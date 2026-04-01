import pandas as pd
import matplotlib.pyplot as plt

# =========================
# 1. CARGAR LOS DATOS
# =========================
ruta_energia = "./data/energiasedif1(11 pisosycomunes).csv"
ruta_acs = "./data/VOLUMENAGUACALIENTECONSUMIDA.csv"

df_energia = pd.read_csv(ruta_energia)
df_acs = pd.read_csv(ruta_acs)

# =========================
# 2. VER INFORMACIÓN GENERAL
# =========================
print("===== ENERGÍA =====")
print(df_energia.head())
print("\nColumnas energía:")
print(df_energia.columns.tolist())
print("\nInfo energía:")
print(df_energia.info())

print("\n" + "="*60 + "\n")

print("===== AGUA CALIENTE =====")
print(df_acs.head())
print("\nColumnas ACS:")
print(df_acs.columns.tolist())
print("\nInfo ACS:")
print(df_acs.info())

# =========================
# 3. CONVERTIR FECHA
# =========================
# Cambia 'Fecha' por el nombre real de la columna temporal si fuera distinto
col_fecha_energia = df_energia.columns[0]
col_fecha_acs = df_acs.columns[0]

df_energia[col_fecha_energia] = pd.to_datetime(df_energia[col_fecha_energia], errors="coerce")
df_acs[col_fecha_acs] = pd.to_datetime(df_acs[col_fecha_acs], errors="coerce")

# Ordenar por fecha
df_energia = df_energia.sort_values(col_fecha_energia).reset_index(drop=True)
df_acs = df_acs.sort_values(col_fecha_acs).reset_index(drop=True)

# =========================
# 4. RANGO DE FECHAS
# =========================
print("\n===== RANGO TEMPORAL =====")
print("Energía:", df_energia[col_fecha_energia].min(), "->", df_energia[col_fecha_energia].max())
print("ACS:", df_acs[col_fecha_acs].min(), "->", df_acs[col_fecha_acs].max())

# =========================
# 5. NULOS
# =========================
print("\n===== NULOS EN ENERGÍA =====")
print(df_energia.isnull().sum())

print("\n===== NULOS EN ACS =====")
print(df_acs.isnull().sum())

# =========================
# 6. ENCONTRAR DESDE CUÁNDO HAY DATOS REALES
# =========================
# Busca la primera fila donde al menos una columna distinta de fecha tenga dato
cols_energia_sin_fecha = df_energia.columns[1:]
cols_acs_sin_fecha = df_acs.columns[1:]

primera_fila_con_datos_energia = df_energia[cols_energia_sin_fecha].notna().any(axis=1).idxmax()
primera_fila_con_datos_acs = df_acs[cols_acs_sin_fecha].notna().any(axis=1).idxmax()

print("\n===== PRIMERA FILA CON DATOS =====")
print("Energía -> índice:", primera_fila_con_datos_energia,
      "| fecha:", df_energia.loc[primera_fila_con_datos_energia, col_fecha_energia])

print("ACS -> índice:", primera_fila_con_datos_acs,
      "| fecha:", df_acs.loc[primera_fila_con_datos_acs, col_fecha_acs])

# =========================
# 7. QUEDARSE SOLO CON DATOS ÚTILES
# =========================
df_energia_util = df_energia.loc[primera_fila_con_datos_energia:].copy()
df_acs_util = df_acs.loc[primera_fila_con_datos_acs:].copy()

print("\n===== TAMAÑO DE DATOS ÚTILES =====")
print("Energía:", df_energia_util.shape)
print("ACS:", df_acs_util.shape)

# =========================
# 8. ESTADÍSTICAS DESCRIPTIVAS
# =========================
print("\n===== DESCRIPTIVAS ENERGÍA =====")
print(df_energia_util.describe(include="all"))

print("\n===== DESCRIPTIVAS ACS =====")
print(df_acs_util.describe(include="all"))

# =========================
# 9. REVISAR SI LAS COLUMNAS PARECEN ACUMULADAS
# =========================
def revisar_acumulada(df, columnas, n=5):
    for col in columnas[:n]:
        serie = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(serie) > 1:
            dif = serie.diff().dropna()
            negativos = (dif < 0).sum()
            print(f"{col}: cambios negativos = {negativos} de {len(dif)} diferencias")

print("\n===== REVISIÓN RÁPIDA DE POSIBLES CONTADORES ACUMULADOS =====")
columnas_numericas_energia = [c for c in cols_energia_sin_fecha if pd.api.types.is_numeric_dtype(df_energia_util[c])]
columnas_numericas_acs = [c for c in cols_acs_sin_fecha if pd.api.types.is_numeric_dtype(df_acs_util[c])]

print("\nEnergía:")
revisar_acumulada(df_energia_util, columnas_numericas_energia, n=10)

print("\nACS:")
revisar_acumulada(df_acs_util, columnas_numericas_acs, n=10)

# =========================
# 10. GRÁFICAS RÁPIDAS
# =========================
# Elegimos algunas columnas de ejemplo si existen
columnas_plot_energia = [
    c for c in ["POTENCIA ACTIVA", "energia", "CAUDAL AGUA CALIENTE",
                "etermicaconserje", "erefrigeración conserje", "etermicasolar"]
    if c in df_energia_util.columns
]

for col in columnas_plot_energia:
    plt.figure(figsize=(12, 4))
    plt.plot(df_energia_util[col_fecha_energia], df_energia_util[col])
    plt.title(f"{col} en el tiempo")
    plt.xlabel("Fecha")
    plt.ylabel(col)
    plt.tight_layout()
    plt.show()

# Algunas columnas por vivienda
columnas_vivienda_energia = [c for c in df_energia_util.columns if c.startswith("energia") and c != "energia"][:5]
for col in columnas_vivienda_energia:
    plt.figure(figsize=(12, 4))
    plt.plot(df_energia_util[col_fecha_energia], df_energia_util[col])
    plt.title(f"{col} en el tiempo")
    plt.xlabel("Fecha")
    plt.ylabel(col)
    plt.tight_layout()
    plt.show()

columnas_vivienda_acs = [c for c in df_acs_util.columns if c.startswith("volumen")][:5]
for col in columnas_vivienda_acs:
    plt.figure(figsize=(12, 4))
    plt.plot(df_acs_util[col_fecha_acs], df_acs_util[col])
    plt.title(f"{col} en el tiempo")
    plt.xlabel("Fecha")
    plt.ylabel(col)
    plt.tight_layout()
    plt.show()

# =========================
# 11. CORRELACIÓN RÁPIDA
# =========================
# Solo si quieres ver relación entre variables numéricas
corr_energia = df_energia_util.select_dtypes(include="number").corr()

plt.figure(figsize=(10, 8))
plt.imshow(corr_energia, aspect="auto")
plt.colorbar()
plt.title("Matriz de correlación - Energía")
plt.xticks(range(len(corr_energia.columns)), corr_energia.columns, rotation=90)
plt.yticks(range(len(corr_energia.columns)), corr_energia.columns)
plt.tight_layout()
plt.show()
