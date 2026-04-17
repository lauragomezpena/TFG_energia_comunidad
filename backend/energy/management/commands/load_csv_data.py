import pandas as pd
from django.core.management.base import BaseCommand
from django.utils.timezone import make_aware
from django.contrib.auth import get_user_model
from energy.models import Home, Reading

User = get_user_model()

class Command(BaseCommand):
    help = 'Carga los datos de consumos y volúmenes de los CSV en la base de datos'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.WARNING("Cargando archivos CSV... (puede tardar un momento)"))
        
        # Rutas de archivo
        ruta_energia = "../data/energiasedif1(11 pisosycomunes).csv"
        ruta_acs = "../data/VOLUMENAGUACALIENTECONSUMIDA.csv"
        
        try:
            df_energia = pd.read_csv(ruta_energia)
            df_acs = pd.read_csv(ruta_acs)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error al leer CSV: {e}"))
            return

        # Limpiar Fechas
        col_fecha_energia = df_energia.columns[0]
        col_fecha_acs = df_acs.columns[0]

        df_energia[col_fecha_energia] = pd.to_datetime(df_energia[col_fecha_energia], errors="coerce")
        df_acs[col_fecha_acs] = pd.to_datetime(df_acs[col_fecha_acs], errors="coerce")
        
        # Descartar filas con fecha nula
        df_energia = df_energia.dropna(subset=[col_fecha_energia])
        df_acs = df_acs.dropna(subset=[col_fecha_acs])
        
        # Sincronizar índices por fecha
        df_energia.set_index(col_fecha_energia, inplace=True)
        df_acs.set_index(col_fecha_acs, inplace=True)

        # Convertimos los valores acumulativos en incrementos (consumo por hora)
        for col in df_energia.columns:
            if col.startswith("energia") and col != "energia":
                df_energia[col] = df_energia[col].diff().clip(lower=0).fillna(0.0)
                
        # Zonas communes
        comunes_acumulativas = ["energia", "etermicaconserje", "erefrigeración conserje", "etermicasolar", "CAUDAL AGUA CALIENTE"]
        for col in comunes_acumulativas:
            if col in df_energia.columns:
                df_energia[col] = df_energia[col].diff().clip(lower=0).fillna(0.0)

        for col in df_acs.columns:
            if col.startswith("volumen"):
                df_acs[col] = df_acs[col].diff().clip(lower=0).fillna(0.0)

        # Unimos ambos dataframes por hora
        df_merged = df_energia.join(df_acs, how="inner")
        
        # Encontramos los pisos
        columnas_energia = [col for col in df_energia.columns if col.startswith("energia") and col != "energia"]
        pisos = [col.replace("energia", "") for col in columnas_energia]

        self.stdout.write(self.style.SUCCESS(f"Pisos encontrados: {', '.join(pisos)}"))

        # Para cada piso, creamos un Usuario (si no existe) y un Home
        homes_dict = {}
        for piso in pisos:
            username = f"propietario_{piso.lower()}"
            user, created = User.objects.get_or_create(username=username, defaults={
                'role': 'owner'
            })
            if created:
                user.set_password('admin123')
                user.save()
            
            home, h_created = Home.objects.get_or_create(name=f"Piso {piso}", owner=user)
            homes_dict[piso] = home
            
        # Crear usuario admin y home Comunidad
        admin_user, _ = User.objects.get_or_create(username='admin', defaults={'role': 'admin', 'is_superuser': True, 'is_staff': True})
        admin_user.set_password('admin123')
        admin_user.save()
        home_comunidad, _ = Home.objects.get_or_create(name="Zonas Comunes", owner=admin_user)

        self.stdout.write(self.style.SUCCESS("Generando lecturas..."))
        
        # Para optimizar inserciones
        readings_to_insert = []
        batch_size = 5000

        # Vaciamos la tabla antes para no duplicar en repetidas ejecuciones
        Reading.objects.all().delete()
        
        count = 0
        for timestamp, row in df_merged.iterrows():
            if pd.isna(timestamp): continue
            aware_timestamp = make_aware(timestamp) if timestamp.tzinfo is None else timestamp
            
            for piso in pisos:
                col_energia = f"energia{piso}"
                col_agua = f"volumen{piso}"
                
                val_energia = row.get(col_energia, 0.0)
                val_agua = row.get(col_agua, 0.0)
                
                if pd.isna(val_energia): val_energia = 0.0
                if pd.isna(val_agua): val_agua = 0.0
                
                # Insertamos si hay consumo
                if val_energia > 0.0 or val_agua > 0.0:
                    reading = Reading(
                        home=homes_dict[piso],
                        timestamp=aware_timestamp,
                        electricity_kwh=float(val_energia),
                        water_m3=float(val_agua),
                        gas_kwh=0.0,
                        cost_eur=0.0
                    )
                    readings_to_insert.append(reading)
                    count += 1
                
                if len(readings_to_insert) >= batch_size:
                    Reading.objects.bulk_create(readings_to_insert)
                    self.stdout.write(f"Insertados {count} registros...")
                    readings_to_insert = []
            
            # Generar lectura para Zonas Comunes
            val_energia_comun = (
                row.get("energia", 0.0) +
                row.get("etermicaconserje", 0.0) +
                row.get("erefrigeración conserje", 0.0) +
                row.get("etermicasolar", 0.0)
            )
            val_agua_comun = row.get("CAUDAL AGUA CALIENTE", 0.0)

            if pd.isna(val_energia_comun): val_energia_comun = 0.0
            if pd.isna(val_agua_comun): val_agua_comun = 0.0

            if val_energia_comun > 0.0 or val_agua_comun > 0.0:
                reading_comun = Reading(
                    home=home_comunidad,
                    timestamp=aware_timestamp,
                    electricity_kwh=float(val_energia_comun),
                    water_m3=float(val_agua_comun),
                    gas_kwh=0.0,
                    cost_eur=0.0
                )
                readings_to_insert.append(reading_comun)
                count += 1
        
        if readings_to_insert:
            Reading.objects.bulk_create(readings_to_insert)
            
        self.stdout.write(self.style.SUCCESS(f"Se completó la carga: {count} lecturas insertadas en total!"))
