from rest_framework import serializers
from .models import Home, Reading

class HomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Home
        fields = ['id', 'name']

class ReadingSerializer(serializers.ModelSerializer):
    home = HomeSerializer(read_only=True)

    class Meta:
        model = Reading
        fields = [
            'id', 'home', 'timestamp', 'electricity_kwh', 
            'water_m3', 'gas_kwh', 'cost_eur'
        ]
