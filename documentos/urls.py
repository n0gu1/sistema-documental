from django.urls import path
from . import views

urlpatterns = [
    path('api/hola-mundo/', views.hola_mundo, name='hola_mundo'),
]
