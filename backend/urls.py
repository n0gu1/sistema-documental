from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('documentos.urls')),
]

# React SPA: WhiteNoise sirve /static/ automaticamente antes de llegar aqui
urlpatterns += [
    re_path(r'^(?!api/|static/).*$', TemplateView.as_view(template_name='index.html'), name='react'),
]
