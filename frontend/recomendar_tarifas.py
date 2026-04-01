"""
Recomendador simple de tarifas 2.0TD (España) usando:
- Consumo: UCI Individual Household Electric Power Consumption (se descarga en el script)
- Precio horario: REE Open Data (se descarga en el script, sin token)
- Peajes + cargos 2026 (términos regulados) para 2.0TD: tomados de tu PDF/tabla.

⚠️ Simplificaciones (válidas para un TFG MVP):
- No calcula impuestos (IVA/IEE), alquiler de contador, ni penalizaciones por excesos de potencia.
- Asume que NO hay excesos de potencia (o sea, potencia contratada suficiente).
"""

from __future__ import annotations

import io
import math
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import pandas as pd
import requests


# ---------------------------
# 1) PARAMETROS REGULADOS 2026 (2.0TD)
# ---------------------------
# Según tu tabla (2026): Término de energía total (€/kWh) y término de potencia total (€/kW año)
# 2.0TD tiene 3 periodos de energía (P1,P2,P3) y 2 periodos de potencia (P1,P2).
REGULATED_ENERGY_EUR_PER_KWH = {
    "P1": 0.097553,  # punta
    "P2": 0.029267,  # llano
    "P3": 0.003292,  # valle
}

REGULATED_POWER_EUR_PER_KW_YEAR = {
    "P1": 27.704413,  # potencia periodo 1
    "P2": 0.725423,   # potencia periodo 2
}


# ---------------------------
# 2) TARIFAS (EJEMPLO) - EDITA ESTO
# ---------------------------
@dataclass
class Tariff:
    name: str
    type: str  # "PVPC" o "FIXED"
    fixed_energy_eur_per_kwh: float | None = None  # solo para FIXED


TARIFFS: List[Tariff] = [
    Tariff(name="PVPC (precio horario + regulados)", type="PVPC"),
    Tariff(name="Libre Fijo 0.12 €/kWh", type="FIXED", fixed_energy_eur_per_kwh=0.120),
    Tariff(name="Libre Fijo 0.13 €/kWh", type="FIXED", fixed_energy_eur_per_kwh=0.130),
    Tariff(name="Libre Fijo 0.11 €/kWh", type="FIXED", fixed_energy_eur_per_kwh=0.110),
]


# ---------------------------
# 3) UTILIDADES HORARIAS 2.0TD
# ---------------------------
def is_weekend(dt: pd.Timestamp) -> bool:
    return dt.weekday() >= 5  # 5=Sat, 6=Sun


# Horarios 2.0TD (Península, estándar):
# - Valle: 00-08 + fines de semana/ festivos todo el día
# - Llano: 08-10, 14-18, 22-24 (laborables)
# - Punta: 10-14, 18-22 (laborables)
# Para simplificar NO metemos festivos nacionales (puedes añadirlos luego).
def energy_period_20td(dt: pd.Timestamp) -> str:
    if is_weekend(dt):
        return "P3"  # valle
    h = dt.hour
    if 0 <= h < 8:
        return "P3"  # valle
    if 8 <= h < 10 or 14 <= h < 18 or 22 <= h < 24:
        return "P2"  # llano
    return "P1"      # punta


# Potencia 2.0TD suele tener 2 periodos:
# - P1 (punta): 08-24 (laborables)
# - P2 (valle): 00-08 + fines de semana
def power_period_20td(dt: pd.Timestamp) -> str:
    if is_weekend(dt):
        return "P2"
    h = dt.hour
    return "P2" if 0 <= h < 8 else "P1"


# ---------------------------
# 4) DESCARGA Y PREPARA CONSUMO (UCI)
# ---------------------------
def download_uci_household_dataset() -> pd.DataFrame:
    url = "https://archive.ics.uci.edu/static/public/235/individual+household+electric+power+consumption.zip"
    r = requests.get(url, timeout=60)
    r.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        # Archivo típico: household_power_consumption.txt
        candidates = [n for n in zf.namelist() if n.endswith(".txt")]
        if not candidates:
            raise RuntimeError("No se encontró el .txt dentro del zip de UCI.")
        fname = candidates[0]
        raw = zf.read(fname)

    # Dataset usa ';' y columnas: Date, Time, Global_active_power (kW), ...
    df = pd.read_csv(
        io.BytesIO(raw),
        sep=";",
        low_memory=False,
        na_values=["?", "NA", ""],
    )

    # Parse timestamp
    df["DateTime"] = pd.to_datetime(df["Date"] + " " + df["Time"], dayfirst=True, errors="coerce")
    df = df.dropna(subset=["DateTime"]).set_index("DateTime").sort_index()

    # Convertir potencia activa global a numérica
    df["Global_active_power"] = pd.to_numeric(df["Global_active_power"], errors="coerce")

    # Este dataset está en minutos (kW). Pasamos a energía por hora (kWh):
    # kW promedio en la hora * 1h = kWh.
    hourly_kw = df["Global_active_power"].resample("H").mean()
    hourly_kwh = hourly_kw.clip(lower=0)  # por si acaso
    out = pd.DataFrame({"kwh": hourly_kwh}).dropna()
    return out


# ---------------------------
# 5) DESCARGA PRECIO HORARIO REE (€/MWh -> €/kWh)
# ---------------------------
def download_ree_hourly_prices(start_utc: datetime, end_utc: datetime) -> pd.DataFrame:
    """
    Precios horarios del mercado desde REE (Open Data).
    Endpoint: mercados -> precios (puede cambiar nombre exacto con el tiempo).
    Si REE cambia el endpoint, ajusta la URL.
    """
    # API de REE (sin token). Usamos "precios" de mercado diario (aprox).
    base = "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real"
    params = {
        "start_date": start_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "end_date": end_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "time_trunc": "hour",
    }

    r = requests.get(base, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()

    # La estructura suele ser: data["included"][0]["attributes"]["values"] con [{"datetime":..., "value":...}, ...]
    included = data.get("included", [])
    if not included:
        raise RuntimeError("Respuesta REE inesperada: no hay 'included'. Revisa endpoint.")
    values = included[0]["attributes"]["values"]

    df = pd.DataFrame(values)
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
    df = df.set_index("datetime").sort_index()

    # value suele venir en €/MWh -> €/kWh
    df["eur_per_kwh"] = pd.to_numeric(df["value"], errors="coerce") / 1000.0
    return df[["eur_per_kwh"]].dropna()


# ---------------------------
# 6) SIMULACION DE COSTES
# ---------------------------
def annualize_from_window(cost_in_window: float, window_hours: int) -> float:
    # Escalado simple: coste ventana -> anual (8760h)
    return cost_in_window * (8760 / window_hours)


def compute_energy_cost(cons_kwh: pd.Series, energy_price_eur_per_kwh: pd.Series) -> float:
    # Alinea e integra: coste = sum(kWh * €/kWh)
    aligned = pd.concat([cons_kwh, energy_price_eur_per_kwh], axis=1).dropna()
    aligned.columns = ["kwh", "eur_per_kwh"]
    return float((aligned["kwh"] * aligned["eur_per_kwh"]).sum())


def compute_regulated_energy_cost(cons_kwh: pd.Series) -> float:
    # Aplica peajes+cargos por periodo (P1/P2/P3)
    df = cons_kwh.to_frame("kwh")
    df["period"] = [energy_period_20td(ts) for ts in df.index]
    cost = 0.0
    for p, grp in df.groupby("period"):
        cost += float(grp["kwh"].sum()) * REGULATED_ENERGY_EUR_PER_KWH[p]
    return cost


def compute_power_cost(days: int, contracted_kw_p1: float, contracted_kw_p2: float) -> float:
    # Término potencia total (€/kW año) -> €/kW día
    p1_day = REGULATED_POWER_EUR_PER_KW_YEAR["P1"] / 365.0
    p2_day = REGULATED_POWER_EUR_PER_KW_YEAR["P2"] / 365.0
    return days * (contracted_kw_p1 * p1_day + contracted_kw_p2 * p2_day)


def recommend_tariff(cons_hourly: pd.DataFrame, contracted_kw_p1: float = 4.6, contracted_kw_p2: float = 4.6,
                     price_days: int = 30) -> pd.DataFrame:
    # Ventana de análisis: últimos N días del consumo
    end = cons_hourly.index.max()
    start = end - pd.Timedelta(days=price_days)
    cons_win = cons_hourly.loc[start:end].copy()
    cons_win = cons_win.dropna()
    if cons_win.empty:
        raise RuntimeError("No hay consumo en la ventana elegida.")

    # Descarga precios REE para misma ventana (en UTC)
    # Convertimos index a UTC asumiendo que timestamps están en hora local sin tz.
    # Para un MVP, lo aproximamos marcando como UTC.
    start_utc = start.to_pydatetime().replace(tzinfo=timezone.utc)
    end_utc = end.to_pydatetime().replace(tzinfo=timezone.utc)

    prices = download_ree_hourly_prices(start_utc, end_utc)

    # Construimos tabla resultados
    window_hours = len(cons_win)
    days = math.ceil((cons_win.index.max() - cons_win.index.min()).total_seconds() / (3600 * 24))

    regulated_energy_cost = compute_regulated_energy_cost(cons_win["kwh"])
    power_cost = compute_power_cost(days=days, contracted_kw_p1=contracted_kw_p1, contracted_kw_p2=contracted_kw_p2)

    rows = []
    for t in TARIFFS:
        if t.type == "PVPC":
            # Coste energía mercado (REE) + regulados
            market_cost = compute_energy_cost(cons_win["kwh"], prices["eur_per_kwh"])
            total_win = power_cost + regulated_energy_cost + market_cost
        elif t.type == "FIXED":
            assert t.fixed_energy_eur_per_kwh is not None
            fixed_price = pd.Series(t.fixed_energy_eur_per_kwh, index=cons_win.index)
            market_cost = compute_energy_cost(cons_win["kwh"], fixed_price)
            total_win = power_cost + regulated_energy_cost + market_cost
        else:
            raise ValueError("Tipo de tarifa desconocido")

        rows.append({
            "tarifa": t.name,
            "coste_ventana_eur": total_win,
            "coste_anual_estimado_eur": annualize_from_window(total_win, window_hours),
            "detalle_potencia_eur": annualize_from_window(power_cost, window_hours),
            "detalle_regulados_energia_eur": annualize_from_window(regulated_energy_cost, window_hours),
            "detalle_energia_suministro_eur": annualize_from_window(market_cost, window_hours),
        })

    out = pd.DataFrame(rows).sort_values("coste_anual_estimado_eur", ascending=True).reset_index(drop=True)
    return out


def main():
    print("Descargando y preparando consumo (UCI)...")
    cons = download_uci_household_dataset()

    print("Calculando recomendación (ventana 30 días)...")
    ranking = recommend_tariff(cons, contracted_kw_p1=4.6, contracted_kw_p2=4.6, price_days=30)

    print("\n=== RANKING TARIFAS (estimación anual) ===")
    print(ranking.to_string(index=False))

    best = ranking.iloc[0]
    print("\n=== RECOMENDACIÓN ===")
    print(f"Tarifa recomendada: {best['tarifa']}")
    print(f"Coste anual estimado: {best['coste_anual_estimado_eur']:.2f} €")
    print("\n(Desglose anual aprox.)")
    print(f" - Potencia (regulado): {best['detalle_potencia_eur']:.2f} €")
    print(f" - Energía regulados (peajes+cargos): {best['detalle_regulados_energia_eur']:.2f} €")
    print(f" - Energía suministro (PVPC o fijo): {best['detalle_energia_suministro_eur']:.2f} €")


if __name__ == "__main__":
    # Requisitos:
    # pip install pandas requests
    main()