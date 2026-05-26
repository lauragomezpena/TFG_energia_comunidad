import json
import os

notebook_path = "c:/Users/laugo/TFG_DJANGO/data/prediction_models.ipynb"

with open(notebook_path, "r", encoding="utf-8") as f:
    nb = json.load(f)

markdown_cell = {
    "cell_type": "markdown",
    "id": "model_7_days_desc",
    "metadata": {},
    "source": [
        "### Modelo XGBoost a 7 días (Next-Week Forecasting)\n",
        "Como predecir 30 días hacia el futuro de forma recursiva acumula mucho error (error propagation), vamos a evaluar el rendimiento del modelo si reducimos el horizonte a solo 7 días (168 horas). Este horizonte es mucho más realista para un entorno de producción donde queremos optimizar la tarifa de la semana que viene."
    ]
}

code_cell = {
    "cell_type": "code",
    "execution_count": None,
    "id": "model_7_days_code",
    "metadata": {},
    "outputs": [],
    "source": [
        "# Vamos a usar el mismo modelo entrenado (model1 o model2) pero evaluarlo a 168 horas.\n",
        "# Seleccionamos el test set original pero limitamos la evaluación a los primeros 7 días.\n",
        "HORIZON_7D = 24 * 7\n",
        "\n",
        "results_7d = []\n",
        "\n",
        "for vivienda in test[\"vivienda\"].unique():\n",
        "    r = test[test[\"vivienda\"] == vivienda].copy().sort_values(\"fecha\")\n",
        "    if len(r) > HORIZON_7D:\n",
        "        r = r.iloc[:HORIZON_7D]\n",
        "    \n",
        "    X_test_7d = r[features]\n",
        "    y_test_7d = r[target]\n",
        "    \n",
        "    # Usaremos el model2 (XGBoost con lags extra) que ya está entrenado\n",
        "    y_pred_7d = model2.predict(X_test_7d)\n",
        "    \n",
        "    r[\"pred_7d\"] = y_pred_7d\n",
        "    results_7d.append(r)\n",
        "\n",
        "results_7d_df = pd.concat(results_7d)\n",
        "\n",
        "mae_7d = mean_absolute_error(results_7d_df[target], results_7d_df[\"pred_7d\"])\n",
        "rmse_7d = np.sqrt(mean_squared_error(results_7d_df[target], results_7d_df[\"pred_7d\"]))\n",
        "\n",
        "print(\"Métricas globales para horizonte de 7 DÍAS:\")\n",
        "print(\"MAE 7 días:\", mae_7d)\n",
        "print(\"RMSE 7 días:\", rmse_7d)\n",
        "\n",
        "metricas_7d_vivienda = (\n",
        "    results_7d_df.groupby(\"vivienda\")\n",
        "    .apply(lambda g: pd.Series({\n",
        "        \"MAE\": mean_absolute_error(g[target], g[\"pred_7d\"]),\n",
        "        \"RMSE\": np.sqrt(mean_squared_error(g[target], g[\"pred_7d\"]))\n",
        "    }))\n",
        "    .sort_values(\"MAE\")\n",
        ")\n",
        "print(\"\\nMétricas por vivienda (7 días):\")\n",
        "print(metricas_7d_vivienda)\n",
        "\n",
        "# Visualizar la primera vivienda a 7 días\n",
        "vivienda_ejemplo = \"energia1C\"\n",
        "r_vis = results_7d_df[results_7d_df[\"vivienda\"] == vivienda_ejemplo]\n",
        "\n",
        "plt.figure(figsize=(14,5))\n",
        "plt.plot(r_vis[\"fecha\"], r_vis[target], label=\"Real\")\n",
        "plt.plot(r_vis[\"fecha\"], r_vis[\"pred_7d\"], label=\"Predicho (7 días)\")\n",
        "plt.title(f\"Consumo real vs predicho a 7 días - {vivienda_ejemplo}\")\n",
        "plt.xlabel(\"Fecha\")\n",
        "plt.ylabel(\"Consumo horario\")\n",
        "plt.legend()\n",
        "plt.xticks(rotation=45)\n",
        "plt.tight_layout()\n",
        "plt.show()\n"
    ]
}

nb["cells"].append(markdown_cell)
nb["cells"].append(code_cell)

with open(notebook_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)

print("Celdas añadidas con éxito.")
