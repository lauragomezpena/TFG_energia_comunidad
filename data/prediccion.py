import pandas as pd
import numpy as np
import os
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

data_path = r'C:\Users\laugo\.cache\kagglehub\datasets\kyleahmurphy\uk-electrical-load\versions\2'
houses_ids = [1,2,3,4,5,6,7,8,9,10,11,12,13,15,16,17,18,19,20,21]

# ── 1. CARGA Y CONVERSIÓN A HORARIO ───────────────────────────────────────────

def load_house_hourly(house_id: int) -> pd.Series:
    fpath = os.path.join(data_path, f'House_{house_id}.csv')
    df = pd.read_csv(fpath,
                     usecols=['Time', 'Aggregate'],
                     parse_dates=['Time'],
                     index_col='Time')
    df.index = pd.to_datetime(df.index, utc=True).tz_localize(None)
    series = df['Aggregate']
    series = series[(series >= 0) & (series <= 20000)]  # limpiar spikes

    # Resample a kWh horario (solo horas con ≥80% de muestras)
    min_count = int(3600 / 8 * 0.8)
    hourly = series.resample('1h').agg(
        lambda x: x.mean() / 1000 if x.count() >= min_count else np.nan
    )
    return hourly.rename(f'house_{house_id}')

print("Cargando casas...")
houses = {}
for hid in houses_ids:
    print(f"  → House {hid}", end=' ')
    houses[hid] = load_house_hourly(hid)
    print(f"({len(houses[hid].dropna())} horas válidas)")

# ── 2. FEATURE ENGINEERING ────────────────────────────────────────────────────

def create_features(series: pd.Series) -> pd.DataFrame:
    df = series.to_frame(name='consumption')
    idx = df.index

    df['hour']       = idx.hour
    df['dayofweek']  = idx.dayofweek
    df['month']      = idx.month
    df['is_weekend'] = (idx.dayofweek >= 5).astype(int)

    # Codificación cíclica
    df['hour_sin'] = np.sin(2 * np.pi * idx.hour / 24)
    df['hour_cos'] = np.cos(2 * np.pi * idx.hour / 24)
    df['dow_sin']  = np.sin(2 * np.pi * idx.dayofweek / 7)
    df['dow_cos']  = np.cos(2 * np.pi * idx.dayofweek / 7)

    # Lags semanales (orientados a horizonte mensual)
    for lag in [24, 48, 168, 336, 504, 672]:
        df[f'lag_{lag}h'] = df['consumption'].shift(lag)

    # Medias móviles
    df['rolling_mean_7d'] = df['consumption'].shift(1).rolling(168).mean()
    df['rolling_mean_4w'] = df['consumption'].shift(1).rolling(672).mean()

    return df.dropna()

# ── 3. ENTRENAMIENTO Y EVALUACIÓN POR CASA ────────────────────────────────────

def evaluate(y_true, y_pred, label):
    mae  = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-6))) * 100
    return {'house': label, 'MAE': round(mae,4), 'RMSE': round(rmse,4), 'MAPE': round(mape,2)}

results = []

for hid in houses_ids:
    series = houses[hid].dropna()
    if len(series) < 2000:
        print(f"Casa {hid} — muy pocos datos, se omite")
        continue

    df = create_features(series)
    X, y = df.drop(columns=['consumption']), df['consumption']

    # Split: último mes como test
    test_start = series.index.max().replace(day=1, hour=0, minute=0, second=0)
    X_train, X_test = X[X.index < test_start], X[X.index >= test_start]
    y_train, y_test = y[y.index < test_start], y[y.index >= test_start]

    if len(X_test) < 100:
        print(f"Casa {hid} — test insuficiente, se omite")
        continue

    model = XGBRegressor(
        n_estimators=500, learning_rate=0.05, max_depth=6,
        subsample=0.8, colsample_bytree=0.8,
        early_stopping_rounds=50, random_state=42, verbosity=0
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    res = evaluate(y_test.values, y_pred, f'House_{hid}')
    results.append(res)
    print(f"Casa {hid} — MAE: {res['MAE']:.4f} kWh | RMSE: {res['RMSE']:.4f} | MAPE: {res['MAPE']:.2f}%")

# ── 4. RESUMEN FINAL ──────────────────────────────────────────────────────────
results_df = pd.DataFrame(results).set_index('house')
print("\n── Resultados globales ──")
print(results_df)
print(f"\nMedia — MAE: {results_df['MAE'].mean():.4f} | RMSE: {results_df['RMSE'].mean():.4f} | MAPE: {results_df['MAPE'].mean():.2f}%")

# Guardar resultados
# results_df.to_csv('resultados_xgboost_refit.csv')