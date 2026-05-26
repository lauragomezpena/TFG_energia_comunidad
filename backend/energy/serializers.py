from rest_framework import serializers
from .models import Home, Reading, Alert

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

class AlertSerializer(serializers.ModelSerializer):
    home_name = serializers.CharField(source='home.name', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    alert_type_display = serializers.CharField(source='get_alert_type_display', read_only=True)

    class Meta:
        model = Alert
        fields = [
            'id', 'home', 'home_name', 'alert_type', 'alert_type_display',
            'severity', 'severity_display', 'title', 'message',
            'detection_date', 'start_period', 'end_period',
            'status', 'status_display', 'is_read',
            'observed_value', 'reference_value', 'metadata'
        ]
