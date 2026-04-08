from django.urls import path
from .views import HomeListView, ReadingListView

urlpatterns = [
    path("homes/", HomeListView.as_view(), name="home-list"),
    path("readings/", ReadingListView.as_view(), name="reading-list"),
]