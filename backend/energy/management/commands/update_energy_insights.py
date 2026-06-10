from django.core.management.base import BaseCommand
from energy.models import Home, TariffRecommendationResult
from energy.services.prediction_service import generate_forecast
from energy.services.tariff_recommendation import generate_recommendation
from energy.services.alert_detector import AlertDetector

class Command(BaseCommand):
    help = 'Actualiza en background los insights analíticos (predicciones, recomendaciones y alertas) de todas las viviendas.'

    def handle(self, *args, **options):
        homes = Home.objects.exclude(name="Zonas Comunes")
        total_homes = homes.count()

        self.stdout.write(self.style.WARNING(f"Iniciando actualizacion analitica en background para {total_homes} viviendas..."))

        for idx, home in enumerate(homes, 1):
            self.stdout.write(self.style.WARNING(f"\n[{idx}/{total_homes}] Procesando vivienda: '{home.name}' (ID: {home.id})..."))

            # 1. Regenerar Alertas
            try:
                detector = AlertDetector(home)
                detector.run_all_checks()
                self.stdout.write(self.style.SUCCESS("  [OK] Alertas actualizadas."))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  [ERROR] Alertas fallidas: {e}"))

            # 2. Regenerar Recomendador de Tarifas
            try:
                rec_data = generate_recommendation(home.id)
                if "error" not in rec_data:
                    TariffRecommendationResult.objects.update_or_create(
                        home=home,
                        defaults={"data": rec_data}
                    )
                    self.stdout.write(self.style.SUCCESS("  [OK] Recomendacion de tarifas cacheada en BD."))
                else:
                    self.stdout.write(self.style.ERROR(f"  [ERROR] Recomendacion fallida (API/Data): {rec_data.get('error')}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  [ERROR] Recomendacion fallida: {e}"))

            # 3. Regenerar Predicciones XGBoost
            try:
                pred_data = generate_forecast(home.id)
                if "error" not in pred_data:
                    self.stdout.write(self.style.SUCCESS("  [OK] Predicciones XGBoost cacheadas en BD."))
                else:
                    self.stdout.write(self.style.ERROR(f"  [ERROR] Prediccion fallida (Modelo/Data): {pred_data.get('error')}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  [ERROR] Prediccion fallida: {e}"))

        self.stdout.write(self.style.SUCCESS("\nActualizacion de insights analiticos finalizada con exito.\n"))
