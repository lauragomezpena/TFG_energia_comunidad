import io
import zipfile
import requests
import pandas as pd
import matplotlib.pyplot as plt


UCI_ZIP_URL = "https://archive.ics.uci.edu/static/public/235/individual+household+electric+power+consumption.zip"


def download_uci() -> pd.DataFrame:
    """Descarga el zip de UCI y devuelve el dataframe original con DateTime."""
    r = requests.get(UCI_ZIP_URL, timeout=60)
    r.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        # suele llamarse household_power_consumption.txt
        txt_files = [n for n in zf.namelist() if n.lower().endswith(".txt")]
        if not txt_files:
            raise RuntimeError("No se encontró ningún .txt dentro del zip de UCI.")
        raw = zf.read(txt_files[0])

    df = pd.read_csv(
        io.BytesIO(raw),
        sep=";",
        low_memory=False,
        na_values=["?", "NA", ""],
    )

    # Parse timestamp
    df["DateTime"] = pd.to_datetime(
        df["Date"] + " " + df["Time"],
        dayfirst=True,
        errors="coerce"
    )
    df = df.dropna(subset=["DateTime"]).set_index("DateTime").sort_index()

    # Global_active_power (kW) -> numérico
    df["Global_active_power"] = pd.to_numeric(df["Global_active_power"], errors="coerce")

    return df


def to_hourly_kwh(df_minute: pd.DataFrame) -> pd.DataFrame:
    """
    Convierte potencia (kW) minutal a energía horaria aproximada (kWh).
    Aproximación: media de kW en la hora * 1h = kWh.
    """
    hourly_kw_mean = df_minute["Global_active_power"].resample("h").mean()
    hourly_kwh = hourly_kw_mean.clip(lower=0)  # por si hay valores raros
    out = pd.DataFrame({"kwh": hourly_kwh}).dropna()
    return out


def plot_all(cons_hourly: pd.DataFrame, days_last: int = 14) -> None:
    # 1) Serie temporal últimos N días
    end = cons_hourly.index.max()
    start = end - pd.Timedelta(days=days_last)
    last = cons_hourly.loc[start:end]

    plt.figure()
    plt.plot(last.index, last["kwh"])
    plt.title(f"Consumo horario (kWh) — últimos {days_last} días (UCI)")
    plt.xlabel("Fecha")
    plt.ylabel("kWh")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()

    # 2) Perfil medio diario por hora: laborable vs fin de semana
    df = cons_hourly.copy()
    df["hour"] = df.index.hour
    df["is_weekend"] = df.index.weekday >= 5

    prof_weekday = df.loc[~df["is_weekend"]].groupby("hour")["kwh"].mean()
    prof_weekend = df.loc[df["is_weekend"]].groupby("hour")["kwh"].mean()

    plt.figure()
    plt.plot(prof_weekday.index, prof_weekday.values, label="Laborables")
    plt.plot(prof_weekend.index, prof_weekend.values, label="Fines de semana")
    plt.title("Perfil medio por hora (kWh) — laborable vs fin de semana (UCI)")
    plt.xlabel("Hora del día")
    plt.ylabel("kWh medio")
    plt.legend()
    plt.tight_layout()
    plt.show()

    # 3) Heatmap día x hora (cogemos un mes completo si existe, si no 30 días)
    # elegimos las últimas ~30 noches/días completos
    heat_window = cons_hourly.tail(24 * 30).copy()
    # aseguramos múltiplo de 24 para reshape limpio
    n = (len(heat_window) // 24) * 24
    heat_window = heat_window.tail(n)

    mat = heat_window["kwh"].values.reshape(-1, 24)

    plt.figure()
    plt.imshow(mat, aspect="auto")
    plt.title("Mapa de calor: consumo (kWh) por día (filas) y hora (columnas) — UCI")
    plt.xlabel("Hora (0–23)")
    plt.ylabel("Día (ventana ~30 días)")
    plt.colorbar(label="kWh")
    plt.tight_layout()
    plt.show()

    # 4) Histograma de consumo horario
    plt.figure()
    plt.hist(cons_hourly["kwh"].values, bins=60)
    plt.title("Distribución del consumo horario (kWh) — UCI")
    plt.xlabel("kWh por hora")
    plt.ylabel("Frecuencia")
    plt.tight_layout()
    plt.show()


def main():
    print("Descargando dataset UCI...")
    df_raw = download_uci()

    print("Convirtiendo a consumo horario (kWh)...")
    cons_hourly = to_hourly_kwh(df_raw)

    print(f"Rango temporal: {cons_hourly.index.min()} -> {cons_hourly.index.max()}")
    print(f"Nº horas: {len(cons_hourly):,}")

    print("Generando visualizaciones...")
    plot_all(cons_hourly, days_last=14)


if __name__ == "__main__":
    # Requisitos:
    # pip install pandas matplotlib requests
    main()