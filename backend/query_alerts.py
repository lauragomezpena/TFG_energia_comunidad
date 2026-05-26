from energy.models import Alert
alerts = Alert.objects.exclude(alert_type='TARIFF_SAVING').order_by('home__name')
for a in alerts:
    print(f"{a.home.name} - {a.get_alert_type_display()} ({a.status})")
