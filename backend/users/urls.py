from django.urls import path
from .views import (
    UserRegisterView, UserListView, UserRetrieveUpdateDestroyView, 
    LogoutView, ChangePasswordView, UpdateEmailView, UserProfileView
)
app_name="users"
urlpatterns = [
    path('register/', UserRegisterView.as_view(), name='user-register'),
    path('', UserListView.as_view(), name='user-list'),
    path('<int:pk>/', UserRetrieveUpdateDestroyView.as_view(), name='user-detail'),
    path('log-out/', LogoutView.as_view(), name='log-out'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('update-email/', UpdateEmailView.as_view(), name='update-email'),
    path('profile/', UserProfileView.as_view(), name='user-profile'),
]