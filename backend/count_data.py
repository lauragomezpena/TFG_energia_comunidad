import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from energy.models import Reading, Home
print(f'Total Homes: {Home.objects.count()}')
print(f'Total Readings: {Reading.objects.count()}')
print(f'Start Date: {Reading.objects.order_by("timestamp").first().timestamp}')
print(f'End Date: {Reading.objects.order_by("-timestamp").first().timestamp}')
