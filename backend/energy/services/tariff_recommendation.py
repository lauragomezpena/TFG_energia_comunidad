import datetime
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import pandas as pd
import requests

from energy.models import Reading, Home


# =========================================================
# CONFIGURACIÓN GENERAL
# =========================================================

# Últimos 90 días para recomendar
WINDOW_HOURS = 24 * 90

# Alquiler contador aprox.
METER_RENTAL_EUR_PER_DAY = 0.0266

# Activar o no simulación de excesos
INCLUDE_EXCESS_PENALTY = True


# =========================================================
# PRECIOS REGULADOS 2.0TD (2026)
# =========================================================

# Término de energía total (peajes + cargos), €/kWh
REGULATED_ENERGY_EUR_PER_KWH = {
    "P1": 0.097553,
    "P2": 0.029267,
    "P3": 0.003292,
}

# Término de potencia total, €/kW año
REGULATED_POWER_EUR_PER_KW_YEAR = {
    "P1": 27.704413,
    "P2": 0.725423,
}

# Exceso de potencia 2.0TD tipo medida 4-5, €/kW y día
EXCESS_PRICE_EUR_PER_KW_DAY = {
    "P1": 0.279426,
    "P2": 0.005316,
}


# =========================================================
# POTENCIAS CANDIDATAS (2.0TD)
# Regla: P2 >= P1
# =========================================================

POWER_OPTIONS: List[Tuple[float, float]] = [
    (3.45, 3.45),
    (3.45, 4.60),
    (4.60, 4.60),
    (4.60, 5.75),
    (5.75, 5.75),
]


# =========================================================
# TARIFAS A COMPARAR
# =========================================================

@dataclass
class Tariff:
    name: str
    kind: str  # "PVPC", "FIXED", "TOU"
    fixed_energy_eur_per_kwh: Optional[float] = None
    tou_prices_eur_per_kwh: Optional[Dict[str, float]] = None


TARIFFS: List[Tariff] = [
    Tariff(
        name="PVPC (Mercado Regulado)",
        kind="PVPC"
    ),

    Tariff(
        name="Libre Fijo 0.11 €/kWh",
        kind="FIXED",
        fixed_energy_eur_per_kwh=0.110
    ),
    Tariff(
        name="Libre Fijo 0.12 €/kWh",
        kind="FIXED",
        fixed_energy_eur_per_kwh=0.120
    ),
    Tariff(
        name="Libre Fijo 0.13 €/kWh",
        kind="FIXED",
        fixed_energy_eur_per_kwh=0.130
    ),

    Tariff(
        name="Libre 3 Periodos Económica",
        kind="TOU",
        tou_prices_eur_per_kwh={
            "P1": 0.160,
            "P2": 0.115,
            "P3": 0.080,
        }
    ),
    Tariff(
        name="Libre 3 Periodos Estándar",
        kind="TOU",
        tou_prices_eur_per_kwh={
            "P1": 0.180,
            "P2": 0.130,
            "P3": 0.090,
        }
    ),
]


# =========================================================
# PERIODOS 2.0TD
# =========================================================

def energy_period_20td(dt: datetime.datetime) -> str:
    """
    Periodos de energía 2.0TD:
    - Fines de semana: valle (P3)
    - Entre semana:
        P3: 00-08
        P2: 08-10, 14-18, 22-24
        P1: resto
    """
    if dt.weekday() >= 5:
        return "P3"

    h = dt.hour
    if 0 <= h < 8:
        return "P3"
    if 8 <= h < 10 or 14 <= h < 18 or 22 <= h < 24:
        return "P2"
    return "P1"


def power_period_20td(dt: datetime.datetime) -> str:
    """
    Simplificación para potencia 2.0TD:
    - Fines de semana: P2
    - Entre semana:
        P2: 00-08
        P1: resto
    """
    if dt.weekday() >= 5:
        return "P2"

    h = dt.hour
    return "P2" if 0 <= h < 8 else "P1"


# =========================================================
# DESCARGA PRECIOS REE
# =========================================================

def download_ree_hourly_prices(start_date: datetime.datetime, end_date: datetime.datetime) -> pd.DataFrame:
    base = "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real"
    params = {
        "start_date": start_date.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "end_date": end_date.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "time_trunc": "hour",
    }

    try:
        r = requests.get(base, params=params, timeout=15)
        if not r.ok:
            return pd.DataFrame()

        data = r.json()
        included = data.get("included", [])
        if not included:
            return pd.DataFrame()

        values = included[0]["attributes"]["values"]
        df = pd.DataFrame(values)

        df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
        df = df.set_index("datetime").sort_index()

        # €/MWh -> €/kWh
        df["eur_per_kwh"] = pd.to_numeric(df["value"], errors="coerce") / 1000.0
        return df[["eur_per_kwh"]].dropna()

    except Exception:
        return pd.DataFrame()


# =========================================================
# HELPERS DE COSTES
# =========================================================

def compute_power_cost(days: float, contracted_kw_p1: float, contracted_kw_p2: float) -> float:
    p1_day = REGULATED_POWER_EUR_PER_KW_YEAR["P1"] / 365.0
    p2_day = REGULATED_POWER_EUR_PER_KW_YEAR["P2"] / 365.0
    return days * (contracted_kw_p1 * p1_day + contracted_kw_p2 * p2_day)


def compute_regulated_energy_cost(cons_kwh: pd.Series) -> float:
    df = cons_kwh.to_frame("kwh")
    df["period"] = [energy_period_20td(ts.to_pydatetime()) for ts in df.index]

    total = 0.0
    for period, grp in df.groupby("period"):
        total += float(grp["kwh"].sum()) * REGULATED_ENERGY_EUR_PER_KWH[period]
    return total


def compute_excess_penalty(cons_kwh: pd.Series, contracted_kw_p1: float, contracted_kw_p2: float) -> float:
    """
    Aproximación:
    Tomamos el kWh horario como kW medio en esa hora.
    Si supera la potencia contratada en ese periodo, aplicamos exceso.
    """
    if not INCLUDE_EXCESS_PENALTY:
        return 0.0

    df = cons_kwh.to_frame("kw")
    df["period"] = [power_period_20td(ts.to_pydatetime()) for ts in df.index]

    total_penalty = 0.0

    for _, row in df.iterrows():
        period = row["period"]
        contracted = contracted_kw_p1 if period == "P1" else contracted_kw_p2

        if row["kw"] > contracted:
            excess_kw = row["kw"] - contracted
            total_penalty += excess_kw * EXCESS_PRICE_EUR_PER_KW_DAY[period]

    return total_penalty


def compute_energy_supply_cost(
    tariff: Tariff,
    cons_kwh: pd.Series,
    prices_df: pd.DataFrame,
) -> float:

    if tariff.kind == "PVPC":
        if prices_df.empty:
            # fallback si falla API
            return float(cons_kwh.sum()) * 0.10

        aligned = pd.concat([cons_kwh, prices_df["eur_per_kwh"]], axis=1).dropna()
        aligned.columns = ["kwh", "eur_per_kwh"]
        return float((aligned["kwh"] * aligned["eur_per_kwh"]).sum())

    if tariff.kind == "FIXED":
        return float(cons_kwh.sum()) * float(tariff.fixed_energy_eur_per_kwh)

    if tariff.kind == "TOU":
        df = cons_kwh.to_frame("kwh")
        df["period"] = [energy_period_20td(ts.to_pydatetime()) for ts in df.index]

        total = 0.0
        for period, grp in df.groupby("period"):
            total += float(grp["kwh"].sum()) * tariff.tou_prices_eur_per_kwh[period]
        return total

    raise ValueError(f"Tipo de tarifa no soportado: {tariff.kind}")


def annualize(value: float, days: float) -> float:
    return value * (365.0 / max(days, 1.0))


# =========================================================
# FUNCIÓN PRINCIPAL
# =========================================================

def generate_recommendation(home_id: int):
    try:
        home = Home.objects.get(id=home_id)
        owner = home.owner
    except Home.DoesNotExist:
        return {"error": "La vivienda no existe"}

    readings = Reading.objects.filter(home_id=home_id).order_by("-timestamp")[:WINDOW_HOURS]

    if not readings.exists():
        return {"error": "No hay datos suficientes de lecturas"}

    data = [{"timestamp": r.timestamp, "kwh": r.electricity_kwh} for r in readings]
    df_readings = pd.DataFrame(data)

    df_readings["timestamp"] = pd.to_datetime(df_readings["timestamp"], utc=True)
    df_readings = df_readings.set_index("timestamp").sort_index()

    df_readings["kwh"] = pd.to_numeric(df_readings["kwh"], errors="coerce")
    df_readings = df_readings.dropna()
    df_readings = df_readings[df_readings["kwh"] >= 0]

    if df_readings.empty:
        return {"error": "No hay datos válidos de consumo"}

    start_dt = df_readings.index.min()
    end_dt = df_readings.index.max()

    days = (end_dt - start_dt).total_seconds() / 86400.0
    if days < 1.0:
        days = 1.0

    total_kwh = float(df_readings["kwh"].sum())

    # API REE para PVPC
    prices_df = download_ree_hourly_prices(
        start_dt.to_pydatetime(),
        end_dt.to_pydatetime(),
    )

    meter_rental_cost = days * METER_RENTAL_EUR_PER_DAY
    regulated_energy_cost = compute_regulated_energy_cost(df_readings["kwh"])

    # Calcular la tarifa actual del usuario
    current_tariff_obj = Tariff(
        name="Tu Tarifa Actual",
        kind=owner.current_tariff_type,
        fixed_energy_eur_per_kwh=owner.current_tariff_fixed_price if owner.current_tariff_fixed_price is not None else 0.12,
        tou_prices_eur_per_kwh={
            "P1": owner.current_tariff_p1_price if owner.current_tariff_p1_price is not None else 0.18,
            "P2": owner.current_tariff_p2_price if owner.current_tariff_p2_price is not None else 0.13,
            "P3": owner.current_tariff_p3_price if owner.current_tariff_p3_price is not None else 0.09,
        } if owner.current_tariff_type == "TOU" else None
    )

    current_power_cost = compute_power_cost(days, owner.current_power_p1, owner.current_power_p2)
    current_penalty_cost = compute_excess_penalty(
        cons_kwh=df_readings["kwh"],
        contracted_kw_p1=owner.current_power_p1,
        contracted_kw_p2=owner.current_power_p2,
    )
    current_supply_cost = compute_energy_supply_cost(
        tariff=current_tariff_obj,
        cons_kwh=df_readings["kwh"],
        prices_df=prices_df,
    )
    current_total_window = (
        current_power_cost
        + regulated_energy_cost
        + current_supply_cost
        + meter_rental_cost
        + current_penalty_cost
    )
    current_annual_cost = annualize(current_total_window, days)

    current_tariff_data = {
        "tarifa": "Tu Tarifa Actual",
        "tipo": owner.current_tariff_type,
        "potencia_p1_kw": owner.current_power_p1,
        "potencia_p2_kw": owner.current_power_p2,
        "coste_ventana_eur": round(current_total_window, 2),
        "coste_anual_estimado_eur": round(current_annual_cost, 2),
    }

    results = []

    for tariff in TARIFFS:
        for contracted_kw_p1, contracted_kw_p2 in POWER_OPTIONS:
            power_cost = compute_power_cost(days, contracted_kw_p1, contracted_kw_p2)

            penalty_cost = compute_excess_penalty(
                cons_kwh=df_readings["kwh"],
                contracted_kw_p1=contracted_kw_p1,
                contracted_kw_p2=contracted_kw_p2,
            )

            supply_cost = compute_energy_supply_cost(
                tariff=tariff,
                cons_kwh=df_readings["kwh"],
                prices_df=prices_df,
            )

            total_window = (
                power_cost
                + regulated_energy_cost
                + supply_cost
                + meter_rental_cost
                + penalty_cost
            )

            results.append({
                "tarifa": tariff.name,
                "tipo": tariff.kind,
                "potencia_p1_kw": contracted_kw_p1,
                "potencia_p2_kw": contracted_kw_p2,

                "coste_ventana_eur": round(total_window, 2),
                "coste_anual_estimado_eur": round(annualize(total_window, days), 2),

                "detalle_anual_potencia_eur": round(annualize(power_cost, days), 2),
                "detalle_anual_regulados_energia_eur": round(annualize(regulated_energy_cost, days), 2),
                "detalle_anual_energia_suministro_eur": round(annualize(supply_cost, days), 2),
                "detalle_anual_alquiler_contador_eur": round(annualize(meter_rental_cost, days), 2),
                "detalle_anual_penalizaciones_eur": round(annualize(penalty_cost, days), 2),
            })

    # Añadimos la tarifa actual real del usuario (con sus precios del perfil y potencias actuales reales)
    # al listado de resultados (ranking) para que compita directamente como una única opción.
    results.append({
        "tarifa": "Tu Tarifa Actual",
        "tipo": owner.current_tariff_type,
        "potencia_p1_kw": owner.current_power_p1,
        "potencia_p2_kw": owner.current_power_p2,

        "coste_ventana_eur": round(current_total_window, 2),
        "coste_anual_estimado_eur": round(current_annual_cost, 2),

        "detalle_anual_potencia_eur": round(annualize(current_power_cost, days), 2),
        "detalle_anual_regulados_energia_eur": round(annualize(regulated_energy_cost, days), 2),
        "detalle_anual_energia_suministro_eur": round(annualize(current_supply_cost, days), 2),
        "detalle_anual_alquiler_contador_eur": round(annualize(meter_rental_cost, days), 2),
        "detalle_anual_penalizaciones_eur": round(annualize(current_penalty_cost, days), 2),
    })

    results.sort(key=lambda x: x["coste_anual_estimado_eur"])
    best_tariff = results[0]

    # Determinar si la tarifa actual del usuario es la óptima
    is_already_optimal = False
    if current_annual_cost <= best_tariff["coste_anual_estimado_eur"] + 2.0:
        if owner.current_tariff_type == best_tariff["tipo"]:
            if (abs(owner.current_power_p1 - best_tariff["potencia_p1_kw"]) < 0.01 and 
                abs(owner.current_power_p2 - best_tariff["potencia_p2_kw"]) < 0.01):
                is_already_optimal = True

    return {
        "days_analyzed": round(days, 1),
        "total_kwh": round(total_kwh, 2),
        "n_combinations": len(results),
        "current_tariff": current_tariff_data,
        "is_already_optimal": is_already_optimal,
        "rankings": results,
    }