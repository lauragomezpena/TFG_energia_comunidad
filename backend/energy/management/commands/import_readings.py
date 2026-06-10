import os
import datetime
from django.core.management.base import BaseCommand, CommandError
from django.utils.timezone import make_aware
from django.db import transaction
import pandas as pd
from energy.models import Home, Reading

class Command(BaseCommand):
    help = 'Importa lecturas de consumo incrementalmente desde un archivo CSV para una vivienda'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str, help='Ruta del archivo CSV a importar')
        parser.add_argument('--home-id', type=int, required=True, help='ID de la vivienda a la que asociar las lecturas')

    def handle(self, *args, **options):
        csv_file_path = options['csv_file']
        home_id = options['home_id']

        if not os.path.exists(csv_file_path):
            raise CommandError(f"El archivo '{csv_file_path}' no existe.")

        try:
            home = Home.objects.get(id=home_id)
        except Home.DoesNotExist:
            raise CommandError(f"La vivienda con ID {home_id} no existe.")

        self.stdout.write(self.style.WARNING(f"Iniciando ingesta incremental para la vivienda: '{home.name}' (ID: {home.id})..."))

        # Leer CSV usando pandas para facilitar la detección de columnas y parseo
        try:
            df = pd.read_csv(csv_file_path)
        except Exception as e:
            raise CommandError(f"Error al leer el archivo CSV: {e}")

        if df.empty:
            self.stdout.write(self.style.WARNING("El archivo CSV está vacío."))
            return

        # 1. Identificar columnas de fecha
        col_fecha = None
        for col in ['timestamp', 'fecha', 'date', 'datetime', 'time']:
            if col in df.columns:
                col_fecha = col
                break
            # Comprobación insensible a mayúsculas
            for header in df.columns:
                if col in header.lower():
                    col_fecha = header
                    break
            if col_fecha:
                break
        if not col_fecha:
            col_fecha = df.columns[0] # Fallback a la primera columna

        # 2. Identificar columnas de electricidad
        col_elec = None
        for col in ['electricity_kwh', 'kwh', 'consumo', 'energia', 'electricity']:
            for header in df.columns:
                if col in header.lower():
                    col_elec = header
                    break
            if col_elec:
                break
        if not col_elec:
            if len(df.columns) > 1:
                col_elec = df.columns[1]
            else:
                raise CommandError("No se pudo identificar la columna de consumo eléctrico en el archivo.")

        # 3. Identificar columnas de agua (opcional)
        col_agua = None
        for col in ['water_m3', 'agua', 'water', 'acs', 'volumen']:
            for header in df.columns:
                if col in header.lower():
                    col_agua = header
                    break
            if col_agua:
                break

        self.stdout.write(self.style.SUCCESS(
            f"Columnas detectadas: Fecha -> '{col_fecha}', Electricidad -> '{col_elec}'" + 
            (f", Agua -> '{col_agua}'" if col_agua else ", Agua -> (No se encontró column, por defecto 0.0)")
        ))

        # Convertir marcas de tiempo a datetime
        df[col_fecha] = pd.to_datetime(df[col_fecha], errors='coerce')
        
        # Contar y quitar fechas nulas
        nulos_fecha = df[col_fecha].isna().sum()
        df = df.dropna(subset=[col_fecha])

        readings_to_create = []
        errors = nulos_fecha

        # Obtener el recuento de lecturas previo para deducir insertados reales
        prev_count = Reading.objects.filter(home=home).count()

        for _, row in df.iterrows():
            timestamp = row[col_fecha]
            elec_val = row[col_elec]
            
            # Validar consumo eléctrico
            try:
                elec_val = float(elec_val)
                if pd.isna(elec_val) or elec_val < 0:
                    raise ValueError()
            except ValueError:
                errors += 1
                continue

            # Validar consumo de agua
            agua_val = 0.0
            if col_agua:
                try:
                    val = row[col_agua]
                    agua_val = float(val) if not pd.isna(val) else 0.0
                    if agua_val < 0:
                        agua_val = 0.0
                except ValueError:
                    pass

            # Convertir a marca temporal aware (con zona horaria)
            aware_ts = make_aware(timestamp) if timestamp.tzinfo is None else timestamp

            reading = Reading(
                home=home,
                timestamp=aware_ts,
                electricity_kwh=elec_val,
                water_m3=agua_val,
                gas_kwh=0.0,
                cost_eur=0.0
            )
            readings_to_create.append(reading)

        # Inserción masiva en base de datos ignorando conflictos por restricciones UniqueConstraint
        total_rows = len(df) + nulos_fecha
        inserted = 0
        duplicates = 0

        if readings_to_create:
            with transaction.atomic():
                Reading.objects.bulk_create(readings_to_create, ignore_conflicts=True)
            
            # Calcular insertados reales por diferencia de conteos en base de datos
            new_count = Reading.objects.filter(home=home).count()
            inserted = new_count - prev_count
            duplicates = len(readings_to_create) - inserted

        self.stdout.write(self.style.SUCCESS("\n=== Resumen de Ingesta Incremental ==="))
        self.stdout.write(f"  Total de filas procesadas: {total_rows}")
        self.stdout.write(self.style.SUCCESS(f"  Lecturas nuevas insertadas: {inserted}"))
        self.stdout.write(self.style.WARNING(f"  Lecturas duplicadas omitidas: {duplicates}"))
        if errors > 0:
            self.stdout.write(self.style.ERROR(f"  Filas omitidas por errores/formato: {errors}"))
        self.stdout.write(self.style.SUCCESS("=======================================\n"))
