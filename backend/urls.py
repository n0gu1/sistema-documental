from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('documentos.urls')),
    # React: servir index.html para todas las rutas no-API
    re_path(r'^(?!api/).*$', TemplateView.as_view(template_name='index.html'), name='react'),
]
