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
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.home.name} @ {self.timestamp}"