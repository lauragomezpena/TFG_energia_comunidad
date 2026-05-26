from django.urls import path
from .views import HomeListView, ReadingListView, TariffRecommendationView, PredictionView, AlertListView, AlertDetailView

urlpatterns = [
    path("homes/", HomeListView.as_view(), name="home-list"),
    path("readings/", ReadingListView.as_view(), name="reading-list"),
    path("recommend-tariff/", TariffRecommendationView.as_view(), name="recommend-tariff"),
    path("predict/", PredictionView.as_view(), name="predict"),
    path("alerts/", AlertListView.as_view(), name="alert-list"),
    path("alerts/<int:pk>/", AlertDetailView.as_view(), name="alert-detail"),
]