from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import joblib

def plot_month_apartment(
    df_energia_diff,
    df_agua_diff,
    data_type="energia", #'energia' or 'agua'
    apartment="energia3A",
    year=2025,
    month=11,
    daily=False,
    kind="line"
):
    """
    Plot energy or water consumption for one apartment in a chosen month and year.

    Parameters
    ----------
    df_energia_diff : pandas.DataFrame
        DataFrame with non-cumulative energy data. Must contain a 'fecha' column.
    df_agua_diff : pandas.DataFrame
        DataFrame with non-cumulative water data. Must contain a 'fecha' column.
    data_type : str
        'energia' or 'agua'
    apartment : str
        Example: 'energia1C' or 'volumen1C'
    year : int
        Year to plot
    month : int
        Month to plot (1 to 12)
    daily : bool
        If True, aggregates by day inside the selected month
    kind : str
        'line' or 'bar'
    """

    # Validate inputs
    if data_type not in ["energia", "agua"]:
        raise ValueError("data_type must be 'energia' or 'agua'")

    if not 1 <= month <= 12:
        raise ValueError("month must be between 1 and 12")

    if kind not in ["line", "bar"]:
        raise ValueError("kind must be 'line' or 'bar'")

    # Select dataframe
    if data_type == "energia":
        df = df_energia_diff.copy()
        ylabel = "Energy consumption"
    else:
        df = df_agua_diff.copy()
        ylabel = "Water consumption"

    # Check fecha column
    if "fecha" not in df.columns:
        raise ValueError("The selected dataframe must contain a 'fecha' column")

    # Convert fecha to datetime
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")

    # Check apartment column
    if apartment not in df.columns:
        raise ValueError(f"'{apartment}' is not a column in the selected dataframe")

    # Keep only selected month and year
    df_plot = df[
        (df["fecha"].dt.year == year) &
        (df["fecha"].dt.month == month)
    ].copy()

    if df_plot.empty:
        print(f"No data found for {apartment} in {year}-{month:02d}")
        return

    # Keep only the columns we need
    df_plot = df_plot[["fecha", apartment]].dropna()

    if df_plot.empty:
        print(f"No non-null data found for {apartment} in {year}-{month:02d}")
        return

    # Aggregate daily if requested
    if daily:
        df_plot = df_plot.set_index("fecha").resample("D").sum().reset_index()
        title_period = f"{year}-{month:02d} (daily)"
    else:
        title_period = f"{year}-{month:02d}"

    # Plot
    plt.figure(figsize=(14, 5))

    if kind == "line":
        plt.plot(df_plot["fecha"], df_plot[apartment], marker="o")
    elif kind == "bar":
        plt.bar(df_plot["fecha"].astype(str), df_plot[apartment])

    plt.title(f"{data_type.capitalize()} consumption - {apartment} - {title_period}")
    plt.xlabel("Date")
    plt.ylabel(ylabel)
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()

def guardar_metricas_modelo(nombre_modelo, y_train, y_pred_train, y_test, y_pred_test, metricas_modelos):
    metricas_modelos[nombre_modelo] = {
        "train": {
            "MAE": mean_absolute_error(y_train, y_pred_train),
            "RMSE": np.sqrt(mean_squared_error(y_train, y_pred_train)),
            "R2": r2_score(y_train, y_pred_train)
        },
        "test": {
            "MAE": mean_absolute_error(y_test, y_pred_test),
            "RMSE": np.sqrt(mean_squared_error(y_test, y_pred_test)),
            "R2": r2_score(y_test, y_pred_test)
        }
    }
    
    return metricas_modelos
