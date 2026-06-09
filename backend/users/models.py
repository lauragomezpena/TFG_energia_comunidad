from django.db import models
from django.contrib.auth.models import AbstractUser


class CustomUser(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        OWNER = "owner", "Owner"

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.OWNER
    )

    current_tariff_type = models.CharField(
        max_length=10,
        choices=[
            ("PVPC", "PVPC (Mercado Regulado)"),
            ("FIXED", "Libre Fijo (Precio único)"),
            ("TOU", "Libre 3 Periodos (Discriminación Horaria)"),
        ],
        default="PVPC"
    )
    current_tariff_fixed_price = models.FloatField(null=True, blank=True)
    current_tariff_p1_price = models.FloatField(null=True, blank=True)
    current_tariff_p2_price = models.FloatField(null=True, blank=True)
    current_tariff_p3_price = models.FloatField(null=True, blank=True)
    current_power_p1 = models.FloatField(default=3.45)
    current_power_p2 = models.FloatField(default=3.45)

