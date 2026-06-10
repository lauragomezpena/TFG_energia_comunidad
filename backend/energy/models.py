from django.db import models
from django.conf import settings

class Home(models.Model):
    name = models.CharField(max_length=120)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="homes"
    )

    def __str__(self):
        return f"{self.name} ({self.owner.username})"
    
class Reading(models.Model):
    home = models.ForeignKey(Home, on_delete=models.CASCADE, related_name="readings")
    timestamp = models.DateTimeField()

    electricity_kwh = models.FloatField(default=0.0)
    water_m3 = models.FloatField(default=0.0)
    gas_kwh = models.FloatField(default=0.0)
    cost_eur = models.FloatField(default=0.0)

    class Meta:
        indexes = [
            models.Index(fields=["home", "timestamp"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["home", "timestamp"], name="unique_home_reading_timestamp")
        ]
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.home.name} @ {self.timestamp}"

class PredictionResult(models.Model):
    home = models.ForeignKey(Home, on_delete=models.CASCADE, related_name="predictions")
    created_at = models.DateTimeField(auto_now_add=True)
    forecast_start = models.DateTimeField()
    
    total_predicted_kwh = models.FloatField()
    estimated_cost_eur = models.FloatField(null=True, blank=True)
    recommended_tariff = models.CharField(max_length=120, null=True, blank=True)
    
    hourly_data = models.JSONField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Prediction for {self.home.name} at {self.created_at}"

class Alert(models.Model):
    ALERT_TYPES = (
        ('HIGH_NIGHT_USAGE', 'Consumo nocturno inusualmente alto'),
        ('ANOMALOUS_PEAK', 'Pico de consumo anómalo'),
        ('HIGH_STANDBY', 'Consumo base elevado sostenido'),
        ('TARIFF_SAVING', 'Posible ahorro por cambio de tarifa'),
        ('HIGH_USAGE', 'Consumo semanal inusualmente alto'),
        ('COMMUNITY_COMPARE', 'Comparativa con vecinos'),
    )
    
    SEVERITY_LEVELS = (
        ('LOW', 'Baja'),
        ('MEDIUM', 'Media'),
        ('HIGH', 'Alta'),
    )
    
    STATUS_CHOICES = (
        ('ACTIVE', 'Activa'),
        ('RESOLVED', 'Resuelta'),
        ('DISMISSED', 'Descartada'),
    )

    home = models.ForeignKey(Home, on_delete=models.CASCADE, related_name="alerts")
    alert_type = models.CharField(max_length=50, choices=ALERT_TYPES)
    severity = models.CharField(max_length=20, choices=SEVERITY_LEVELS)
    
    title = models.CharField(max_length=200)
    message = models.TextField()
    
    detection_date = models.DateTimeField(auto_now_add=True)
    start_period = models.DateTimeField(null=True, blank=True)
    end_period = models.DateTimeField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    is_read = models.BooleanField(default=False)
    
    observed_value = models.FloatField(null=True, blank=True)
    reference_value = models.FloatField(null=True, blank=True)
    
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-detection_date"]
        # Evitar duplicados exactos activos de la misma alerta para la misma casa
        indexes = [
            models.Index(fields=["home", "status", "alert_type"]),
        ]

    def __str__(self):
        return f"[{self.status}] {self.get_severity_display()} - {self.title} ({self.home.name})"

class TariffRecommendationResult(models.Model):
    home = models.OneToOneField(Home, on_delete=models.CASCADE, related_name="recommendation_result")
    created_at = models.DateTimeField(auto_now=True)
    data = models.JSONField()

    def __str__(self):
        return f"Tariff Recommendation cache for {self.home.name} at {self.created_at}"