import datetime
import math
from dataclasses import dataclass
from typing import List
from django.utils.timezone import make_aware, now
import pandas as pd
import requests

from energy.models import Reading

METER_RENTAL_EUR_PER_DAY = 0.0266  # roughly 0.8€/month
EXCESS_PENALTY_EUR_PER_KW = 1.44  # Penalty per kW exceeded (aproximación genérica BOE)
CONTRACTED_KW_P1 = 4.6
CONTRACTED_KW_P2 = 4.6

REGULATED_ENERGY_EUR_PER_KWH = {
    "P1": 0.097553,
    "P2": 0.029267,
    "P3": 0.003292,
}

REGULATED_POWER_EUR_PER_KW_YEAR = {
    "P1": 27.704413,
    "P2": 0.725423,
}

@dataclass
class Tariff:
    name: str
    type: str # "PVPC" or "FIXED"
    fixed_energy_eur_per_kwh: float = None

TARIFFS = [
    Tariff(name="PVPC (Mercado Regulado)", type="PVPC"),
    Tariff(name="Libre Fijo 0.11 €/kWh", type="FIXED", fixed_energy_eur_per_kwh=0.110),
    Tariff(name="Libre Fijo 0.12 €/kWh", type="FIXED", fixed_energy_eur_per_kwh=0.120),
    Tariff(name="Libre Fijo 0.13 €/kWh", type="FIXED", fixed_energy_eur_per_kwh=0.130),
]

def energy_period_20td(dt: datetime.datetime) -> str:
    if dt.weekday() >= 5: return "P3"
    h = dt.hour
    if 0 <= h < 8: return "P3"
    if 8 <= h < 10 or 14 <= h < 18 or 22 <= h < 24: return "P2"
    return "P1"

def power_period_20td(dt: datetime.datetime) -> str:
    if dt.weekday() >= 5: return "P2"
    h = dt.hour
    return "P2" if 0 <= h < 8 else "P1"

def compute_excess_penalty(cons_kwh: pd.Series) -> float:
    # Aproximación BOE: si el kwh en esa hora (que equivale a kW medio)
    # supera la P_contratada, se penaliza ese kW sobrante.
    df = cons_kwh.to_frame("kw")
    df["period"] = [power_period_20td(ts) for ts in df.index]
    
    total_penalty = 0.0
    for ts, row in df.iterrows():
        contracted = CONTRACTED_KW_P1 if row["period"] == "P1" else CONTRACTED_KW_P2
        if row["kw"] > contracted:
            excess = row["kw"] - contracted
            total_penalty += excess * EXCESS_PENALTY_EUR_PER_KW
            
    return total_penalty

def download_ree_hourly_prices(start_date: datetime.datetime, end_date: datetime.datetime) -> pd.DataFrame:
    base = "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real"
    params = {
        "start_date": start_date.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "end_date": end_date.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "time_trunc": "hour",
    }
    try:
        r = requests.get(base, params=params, timeout=10)
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
        df["eur_per_kwh"] = pd.to_numeric(df["value"], errors="coerce") / 1000.0
        return df[["eur_per_kwh"]].dropna()
    except Exception:
        return pd.DataFrame()

def generate_recommendation(home_id: int):
    # Retrieve last 30 days of data for the home
    readings = Reading.objects.filter(home_id=home_id).order_by('-timestamp')[:720]
    if not readings.exists():
        return {"error": "No hay datos suficientes de lecturas"}
        
    data = [{"timestamp": r.timestamp, "kwh": r.electricity_kwh} for r in readings]
    df_readings = pd.DataFrame(data)
    df_readings["timestamp"] = pd.to_datetime(df_readings["timestamp"])
    df_readings = df_readings.set_index("timestamp").sort_index()
    
    strt = df_readings.index.min()
    end = df_readings.index.max()
    days = (end - strt).total_seconds() / 86400.0
    if days < 1.0:
        days = 1.0

    # REE PVPC Prices
    prices_df = download_ree_hourly_prices(strt, end)
    
    # Costes fijos
    meter_rental_cost = days * METER_RENTAL_EUR_PER_DAY
    penalty_cost = compute_excess_penalty(df_readings["kwh"])
    
    # Coste potencia
    p1_day = REGULATED_POWER_EUR_PER_KW_YEAR["P1"] / 365.0
    p2_day = REGULATED_POWER_EUR_PER_KW_YEAR["P2"] / 365.0
    power_cost = days * (CONTRACTED_KW_P1 * p1_day + CONTRACTED_KW_P2 * p2_day)
    
    # Coste energia regulada
    df_reg = df_readings["kwh"].to_frame("kwh")
    df_reg["period"] = [energy_period_20td(ts) for ts in df_reg.index]
    regulated_energy_cost = 0.0
    for p, grp in df_reg.groupby("period"):
        regulated_energy_cost += float(grp["kwh"].sum()) * REGULATED_ENERGY_EUR_PER_KWH[p]
        
    results = []
    for t in TARIFFS:
        if t.type == "PVPC":
            if prices_df.empty:
                # Mock if API fails
                market_cost = float(df_readings["kwh"].sum() * 0.10) 
            else:
                aligned = pd.concat([df_readings["kwh"], prices_df["eur_per_kwh"]], axis=1).dropna()
                aligned.columns = ["kwh", "eur_per_kwh"]
                market_cost = float((aligned["kwh"] * aligned["eur_per_kwh"]).sum())
        else:
            market_cost = float(df_readings["kwh"].sum() * t.fixed_energy_eur_per_kwh)
            
        total_win = power_cost + regulated_energy_cost + market_cost + meter_rental_cost + penalty_cost
        
        # Anualizar
        multiplier = 365.0 / days
        ann_total = total_win * multiplier
        
        results.append({
            "tarifa": t.name,
            "tipo": t.type,
            "coste_ventana_eur": round(total_win, 2),
            "coste_anual_estimado_eur": round(ann_total, 2),
            "detalle_anual_potencia_eur": round(power_cost * multiplier, 2),
            "detalle_anual_regulados_energia_eur": round(regulated_energy_cost * multiplier, 2),
            "detalle_anual_energia_suministro_eur": round(market_cost * multiplier, 2),
            "detalle_anual_alquiler_contador_eur": round(meter_rental_cost * multiplier, 2),
            "detalle_anual_penalizaciones_eur": round(penalty_cost * multiplier, 2),
        })
        
    # Sort by cheapest
    results.sort(key=lambda x: x["coste_anual_estimado_eur"])
    
    return {
        "days_analyzed": round(days, 1),
        "total_kwh": round(float(df_readings["kwh"].sum()), 2),
        "rankings": results
    }
