import datetime
from django.utils import timezone
from energy.models import Home, Reading, Alert
from energy.services.tariff_recommendation import generate_recommendation
import pandas as pd

class AlertDetector:
    def __init__(self, home: Home):
        self.home = home
        
        # Como los datos son históricos (hasta Feb 2026), ajustamos "ahora" 
        # al último registro disponible de esta vivienda para que las alertas se disparen.
        latest = Reading.objects.filter(home=home).order_by('-timestamp').first()
        if latest:
            self.now = latest.timestamp
        else:
            self.now = timezone.now()

    def run_all_checks(self):
        # 1. Comprobamos el consumo base primero
        has_high_standby = self.check_high_standby()
        
        # 2. Si hay un consumo base alto (ej. radiador 24h), 
        # anulamos la alerta de "consumo nocturno" porque sería redundante 
        # (el radiador obviamente también estará gastando por la noche).
        if has_high_standby:
            self._resolve_alert('HIGH_NIGHT_USAGE')
        else:
            self.check_high_night_usage()
            
        self.check_anomalous_peak()
        self.check_high_usage()
        self.check_tariff_saving()

    def _get_readings_df(self, days: int) -> pd.DataFrame:
        """Helper para obtener lecturas en DataFrame en los últimos N días."""
        start_date = self.now - datetime.timedelta(days=days)
        readings = Reading.objects.filter(home=self.home, timestamp__gte=start_date).order_by('timestamp')
        if not readings.exists():
            return pd.DataFrame()
        
        data = [{'timestamp': r.timestamp, 'kwh': r.electricity_kwh} for r in readings]
        df = pd.DataFrame(data)
        # Convert timestamp strings to timezone-aware datetimes just in case
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
        return df

    def _update_or_create_alert(self, alert_type, severity, title, message, start_period, end_period, observed_value, reference_value, metadata=None):
        """Lógica de deduplicación. Si existe una activa del mismo tipo, la actualiza."""
        alert = Alert.objects.filter(home=self.home, alert_type=alert_type, status='ACTIVE').first()
        
        if alert:
            # Actualizamos la alerta existente
            alert.end_period = end_period
            alert.observed_value = observed_value
            alert.reference_value = reference_value
            alert.message = message
            if metadata:
                alert.metadata = metadata
            alert.save()
        else:
            # Creamos una nueva
            Alert.objects.create(
                home=self.home,
                alert_type=alert_type,
                severity=severity,
                title=title,
                message=message,
                start_period=start_period,
                end_period=end_period,
                observed_value=observed_value,
                reference_value=reference_value,
                metadata=metadata or {}
            )

    def _resolve_alert(self, alert_type):
        """Si la anomalía ya no existe, marcamos la alerta activa como resuelta."""
        Alert.objects.filter(home=self.home, alert_type=alert_type, status='ACTIVE').update(status='RESOLVED')

    def check_high_night_usage(self):
        """
        Alerta: Consumo nocturno inusualmente alto.
        Regla: Analiza la franja 00:00 - 06:00 de los últimos 2 días frente a los 14 anteriores.
        Si la media de los últimos 2 días es > 30% superior a los 14 días base, alerta.
        """
        df = self._get_readings_df(16) # 14 días de base + 2 días recientes
        if df.empty:
            return

        # Filtrar horas nocturnas (0 a 5)
        df_night = df[df['timestamp'].dt.hour < 6]
        if df_night.empty:
            return

        # Separar en periodo base y periodo reciente
        recent_threshold = self.now - datetime.timedelta(days=2)
        df_base = df_night[df_night['timestamp'] < recent_threshold]
        df_recent = df_night[df_night['timestamp'] >= recent_threshold]

        if df_base.empty or df_recent.empty:
            return

        base_avg = df_base['kwh'].mean()
        recent_avg = df_recent['kwh'].mean()

        if base_avg == 0:
            return

        increase_ratio = (recent_avg - base_avg) / base_avg

        if increase_ratio > 0.30 and recent_avg > 0.5: # 30% más y al menos medio kWh (evitar falsos positivos)
            self._update_or_create_alert(
                alert_type='HIGH_NIGHT_USAGE',
                severity='MEDIUM',
                title='Consumo nocturno inusualmente alto',
                message=f'El consumo nocturno reciente ({recent_avg:.2f} kWh) es un {increase_ratio*100:.0f}% superior a la media de tu vivienda.',
                start_period=df_recent['timestamp'].min(),
                end_period=df_recent['timestamp'].max(),
                observed_value=recent_avg,
                reference_value=base_avg
            )
        else:
            self._resolve_alert('HIGH_NIGHT_USAGE')

    def check_anomalous_peak(self):
        """
        Alerta: Pico de consumo anómalo.
        Regla: Si el valor máximo horario en las últimas 24h supera un umbral (ej. 4.6 kW o 90% de un histórico).
        """
        df = self._get_readings_df(7) # Miramos 7 días
        if df.empty:
            return

        recent_threshold = self.now - datetime.timedelta(hours=24)
        df_recent = df[df['timestamp'] >= recent_threshold]
        df_base = df[df['timestamp'] < recent_threshold]

        if df_recent.empty:
            return

        recent_max = df_recent['kwh'].max()
        base_max = df_base['kwh'].max() if not df_base.empty else 4.0

        # Umbral estático alto (ej. 4.5 kW) o 30% más alto que el máximo histórico reciente
        reference_max = max(base_max * 1.3, 4.5)

        if recent_max > reference_max:
            peak_time = df_recent.loc[df_recent['kwh'].idxmax()]['timestamp']
            self._update_or_create_alert(
                alert_type='ANOMALOUS_PEAK',
                severity='HIGH',
                title='Pico de consumo anómalo detectado',
                message=f'Se detectó un pico de {recent_max:.2f} kWh el {peak_time.strftime("%d/%m %H:%M")}, muy superior a tus niveles habituales.',
                start_period=recent_threshold,
                end_period=self.now,
                observed_value=recent_max,
                reference_value=reference_max
            )
        else:
            self._resolve_alert('ANOMALOUS_PEAK')

    def check_high_standby(self):
        """
        Alerta: Consumo base elevado sostenido (Vampire Load).
        Regla: Si el mínimo consumo en 48h es > 0.3 kWh.
        """
        df = self._get_readings_df(2)
        if df.empty or len(df) < 24: # Necesitamos suficientes datos
            return

        standby_load = df['kwh'].min()
        reference_standby = 0.3 # 300W

        if standby_load > reference_standby:
            if standby_load > 1.0:
                msg = f'Tu vivienda tiene un consumo base constante de al menos {standby_load:.2f} kWh cada hora. Esto equivale a tener un electrodoméstico potente (como un radiador) funcionando las 24 horas del día. Revisa si hay algo encendido por error.'
            else:
                msg = f'Tu vivienda consume al menos {standby_load:.2f} kWh cada hora, incluso en los momentos de menor actividad. Revisa aparatos en stand-by o "consumos vampiro".'
                
            self._update_or_create_alert(
                alert_type='HIGH_STANDBY',
                severity='LOW' if standby_load <= 1.0 else 'HIGH',
                title='Consumo base muy elevado' if standby_load > 1.0 else 'Consumo "en reposo" elevado',
                message=msg,
                start_period=df['timestamp'].min(),
                end_period=df['timestamp'].max(),
                observed_value=standby_load,
                reference_value=reference_standby
            )
            return True
        else:
            self._resolve_alert('HIGH_STANDBY')
            return False

    def check_high_usage(self):
        """
        Alerta: Consumo general semanal inusualmente alto.
        Regla: Si la última semana se ha consumido un 20% más que la media de las 3 semanas anteriores.
        """
        df = self._get_readings_df(28) # Miramos 4 semanas (1 reciente + 3 base)
        if df.empty:
            return
            
        recent_threshold = self.now - datetime.timedelta(days=7)
        df_recent = df[df['timestamp'] >= recent_threshold]
        df_base = df[df['timestamp'] < recent_threshold]
        
        if df_recent.empty or df_base.empty:
            return
            
        recent_total = df_recent['kwh'].sum()
        # Media semanal de la base (3 semanas)
        base_weekly_avg = df_base['kwh'].sum() / 3
        
        if base_weekly_avg == 0:
            return
            
        increase_ratio = (recent_total - base_weekly_avg) / base_weekly_avg
        
        if increase_ratio > 0.20 and recent_total > 10: # 20% más y al menos 10 kWh a la semana
            self._update_or_create_alert(
                alert_type='HIGH_USAGE',
                severity='HIGH',
                title='Consumo semanal muy elevado',
                message=f'En los últimos 7 días has consumido {recent_total:.1f} kWh, un {increase_ratio*100:.0f}% más de lo habitual. Revisa si has dejado algún aparato potente encendido.',
                start_period=recent_threshold,
                end_period=self.now,
                observed_value=recent_total,
                reference_value=base_weekly_avg
            )
        else:
            self._resolve_alert('HIGH_USAGE')

    def check_tariff_saving(self):
        """
        Alerta: Posible ahorro por cambio de tarifa.
        Regla: Ejecuta el recomendador. Si el ahorro anual estimado > 5% y > 15 € vs tarifa actual del usuario.
        """
        try:
            res = generate_recommendation(self.home.id)
            if "error" in res or not res.get("rankings") or not res.get("current_tariff"):
                return
            
            rankings = res["rankings"]
            best_tariff = rankings[0]
            current_tariff = res["current_tariff"]

            best_cost = best_tariff["coste_anual_estimado_eur"]
            current_cost = current_tariff["coste_anual_estimado_eur"]

            if current_cost <= 0:
                return

            savings_eur = current_cost - best_cost
            saving_ratio = savings_eur / current_cost

            if savings_eur > 15.0 and saving_ratio > 0.05: # Más de 15 € de ahorro anual y más de 5%
                self._update_or_create_alert(
                    alert_type='TARIFF_SAVING',
                    severity='MEDIUM',
                    title='¡Oportunidad de Ahorro!',
                    message=f'Podrías ahorrar {savings_eur:.2f} € al año ({saving_ratio*100:.0f}%) pasándote a la tarifa {best_tariff["tarifa"]} con potencia {best_tariff["potencia_p1_kw"]} kW / {best_tariff["potencia_p2_kw"]} kW.',
                    start_period=self.now - datetime.timedelta(days=90),
                    end_period=self.now,
                    observed_value=best_cost,
                    reference_value=current_cost,
                    metadata={"best_tariff": best_tariff["tarifa"], "savings_eur": savings_eur}
                )
            else:
                self._resolve_alert('TARIFF_SAVING')
        except Exception as e:
            # Ignorar fallos del recomendador durante el worker
            pass
