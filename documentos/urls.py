from django.urls import path

from . import views

urlpatterns = [
    path('auth/csrf/', views.CsrfTokenView.as_view(), name='auth-csrf'),
    path('auth/login/', views.LoginView.as_view(), name='auth-login'),
    path('auth/me/', views.CurrentUserView.as_view(), name='auth-current-user'),
    path('auth/logout/', views.LogoutView.as_view(), name='auth-logout'),
    path('auth/change-password/', views.ChangePasswordView.as_view(), name='auth-change-password'),
    path('health/', views.HealthView.as_view(), name='health'),
]
