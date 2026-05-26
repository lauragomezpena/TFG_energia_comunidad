from django.core.management.base import BaseCommand
from energy.models import Home
from energy.services.alert_detector import AlertDetector

class Command(BaseCommand):
    help = 'Ejecuta el motor analítico de detección de alertas de consumo en background para todas las viviendas.'

    def handle(self, *args, **options):
        homes = Home.objects.all()
        total_homes = homes.count()
        
        self.stdout.write(self.style.SUCCESS(f'Iniciando generación de alertas para {total_homes} viviendas...'))

        for home in homes:
            self.stdout.write(f'Analizando vivienda: {home.name} (ID: {home.id})...')
            try:
                detector = AlertDetector(home)
                detector.run_all_checks()
                self.stdout.write(self.style.SUCCESS(f'  [OK] Analisis completado para {home.name}'))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  [ERROR] Error al analizar {home.name}: {str(e)}'))

        self.stdout.write(self.style.SUCCESS('Generación de alertas finalizada con éxito.'))
