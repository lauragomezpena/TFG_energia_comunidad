"""
Servicio de predicción recursiva a 30 días usando el modelo XGBoost pre-entrenado.
"""
import os
import datetime
from collections import deque

import numpy as np
import pandas as pd

from django.utils import timezone
from energy.models import Reading, PredictionResult
from energy.services.tariff_recommendation import generate_recommendation

# Ruta al modelo pre-entrenado
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
MODEL_PATH = os.path.join(BASE_DIR, "models", "model1.json")

# Cuántos días históricos necesitamos para inicializar los lags
SEED_DAYS = 8       # lag_168 = 7 días, más 1 de margen
FORECAST_HOURS = 24 * 30  # 1 mes


def _load_model():
    """Carga el modelo XGBoost. Lanza RuntimeError si no está disponible."""
    try:
        from xgboost import XGBRegressor
    except ImportError:
        raise RuntimeError("xgboost no está instalado en el entorno de Django.")

    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Modelo no encontrado en {MODEL_PATH}")

    model = XGBRegressor()
    model.load_model(MODEL_PATH)
    return model


def _build_feature_row(history: deque, target_dt: datetime.datetime) -> list:
    """
    Construye el vector de features para una hora futura dada.
    history es una deque con los últimos 168 valores de consumo (kWh) horarios,
    ordenados del más antiguo al más reciente.
    """
    arr = list(history)  # arr[-1] = valor hora anterior, arr[-24] = hace 24h, arr[-168] = hace 168h

    lag_1   = arr[-1]   if len(arr) >= 1   else 0.0
    lag_24  = arr[-24]  if len(arr) >= 24  else 0.0
    lag_168 = arr[-168] if len(arr) >= 168 else 0.0

    rolling_24  = float(np.mean(arr[-24:]))  if len(arr) >= 24  else float(np.mean(arr))
    rolling_168 = float(np.mean(arr[-168:])) if len(arr) >= 168 else float(np.mean(arr))

    hour       = target_dt.hour
    dayofweek  = target_dt.weekday()
    day        = target_dt.day
    month      = target_dt.month
    is_weekend = 1 if dayofweek >= 5 else 0

    return [hour, dayofweek, day, month, is_weekend,
            lag_1, lag_24, lag_168, rolling_24, rolling_168]


def generate_forecast(home_id: int) -> dict:
    """
    Genera la predicción recursiva de consumo para las próximas 720 horas.
    Devuelve un dict con la lista de predicciones hora a hora, tarifa y coste estimado.
    """
    # 0. Comprobar caché en Base de Datos (menos de 24 horas)
    ahora = timezone.now()
    limite = ahora - datetime.timedelta(hours=24)
    cached = PredictionResult.objects.filter(
        home_id=home_id,
        created_at__gte=limite
    ).order_by("-created_at").first()

    if cached:
        return {
            "home_id": home_id,
            "forecast_start": cached.forecast_start.strftime("%Y-%m-%dT%H:%M:%S"),
            "forecast_end": (cached.forecast_start + datetime.timedelta(hours=FORECAST_HOURS)).strftime("%Y-%m-%dT%H:%M:%S"),
            "total_predicted_kwh": cached.total_predicted_kwh,
            "estimated_cost_eur": cached.estimated_cost_eur,
            "recommended_tariff": cached.recommended_tariff,
            "hourly": cached.hourly_data.get("hourly", []),
            "daily": cached.hourly_data.get("daily", []),
            "from_cache": True
        }

    # 1. Cargar modelo
    try:
        model = _load_model()
    except RuntimeError as e:
        return {"error": str(e)}

    # 2. Obtener datos históricos semilla (últimos SEED_DAYS días)
    seed_hours = SEED_DAYS * 24
    readings_qs = (
        Reading.objects
        .filter(home_id=home_id)
        .order_by("-timestamp")[:seed_hours]
    )

    if not readings_qs.exists():
        return {"error": "No hay datos históricos suficientes para generar predicciones."}

    data = [{"timestamp": r.timestamp, "kwh": float(r.electricity_kwh)} for r in readings_qs]
    df = pd.DataFrame(data).sort_values("timestamp").reset_index(drop=True)
    df["kwh"] = df["kwh"].clip(lower=0)

    if len(df) < 24:
        return {"error": "Se necesitan al menos 24 lecturas históricas para predecir."}

    # 3. Inicializar el buffer circular con el histórico
    history = deque(df["kwh"].tolist(), maxlen=168)

    # 4. Determinar la hora de inicio de la predicción
    last_real_ts = pd.to_datetime(df["timestamp"].iloc[-1])
    # Forzamos a UTC-aware si no lo es
    if last_real_ts.tzinfo is None:
        last_real_ts = last_real_ts.tz_localize("UTC")

    forecast_start = last_real_ts + datetime.timedelta(hours=1)

    # 5. Bucle recursivo de FORECAST_HOURS iteraciones
    predictions = []
    feature_names = ["hour", "dayofweek", "day", "month", "is_weekend",
                     "lag_1", "lag_24", "lag_168", "rolling_24", "rolling_168"]

    current_dt = forecast_start
    for _ in range(FORECAST_HOURS):
        row = _build_feature_row(history, current_dt)
        x = pd.DataFrame([row], columns=feature_names)
        pred = float(model.predict(x)[0])
        pred = max(pred, 0.0)  # no permitir negativos

        # Redondear a 4 decimales para no enviar ruido
        pred_rounded = round(pred, 4)

        predictions.append({
            "timestamp": current_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "electricity_kwh": pred_rounded,
        })

        # Inyectar la predicción en el histórico para el siguiente paso
        history.append(pred)
        current_dt += datetime.timedelta(hours=1)

    # 6. Calcular métricas resumidas por día para la vista
    df_pred = pd.DataFrame(predictions)
    df_pred["timestamp"] = pd.to_datetime(df_pred["timestamp"])
    df_pred["date"] = df_pred["timestamp"].dt.date

    daily = (
        df_pred.groupby("date")["electricity_kwh"]
        .sum()
        .reset_index()
        .rename(columns={"electricity_kwh": "daily_kwh"})
    )
    daily["daily_kwh"] = daily["daily_kwh"].round(4)

    # 7. Calcular coste con la mejor tarifa
    estimated_cost_eur = None
    recommended_tariff_name = None
    
    rec_result = generate_recommendation(home_id)
    if "error" not in rec_result and rec_result.get("rankings"):
        best_tariff = rec_result["rankings"][0]
        recommended_tariff_name = best_tariff["tarifa"]
        
        # El recomendador devuelve el coste anual para los X días analizados
        # Extraemos el precio medio del kWh y lo aplicamos al total predicho
        hist_total_kwh = rec_result.get("total_kwh", 1)
        if hist_total_kwh > 0:
            avg_price_per_kwh = best_tariff["coste_ventana_eur"] / hist_total_kwh
            estimated_cost_eur = round(df_pred["electricity_kwh"].sum() * avg_price_per_kwh, 2)

    total_kwh_rounded = round(df_pred["electricity_kwh"].sum(), 2)
    hourly_list = predictions
    daily_list = [
        {"date": str(row["date"]), "daily_kwh": row["daily_kwh"]}
        for _, row in daily.iterrows()
    ]

    # 8. Guardar en Base de Datos (limpiando previas de esta casa para no acumular basura)
    PredictionResult.objects.filter(home_id=home_id).delete()
    
    PredictionResult.objects.create(
        home_id=home_id,
        forecast_start=forecast_start,
        total_predicted_kwh=total_kwh_rounded,
        estimated_cost_eur=estimated_cost_eur,
        recommended_tariff=recommended_tariff_name,
        hourly_data={"hourly": hourly_list, "daily": daily_list}
    )

    return {
        "home_id": home_id,
        "forecast_start": forecast_start.strftime("%Y-%m-%dT%H:%M:%S"),
        "forecast_end": current_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "total_predicted_kwh": total_kwh_rounded,
        "estimated_cost_eur": estimated_cost_eur,
        "recommended_tariff": recommended_tariff_name,
        "hourly": hourly_list,
        "daily": daily_list,
        "from_cache": False
    }
