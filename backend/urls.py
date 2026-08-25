from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.http import HttpResponse
import os


def serve_react(request, path=''):
    """Sirve archivos estáticos de React y el SPA."""
    index_path = os.path.join(settings.BASE_DIR, 'frontend', 'dist', 'index.html')
    try:
        with open(index_path, 'r') as f:
            content = f.read()
        return HttpResponse(content, content_type='text/html')
    except FileNotFoundError:
        return HttpResponse('<h1>Frontend not built</h1>', status=500)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('documentos.urls')),
]

# React SPA catch-all
urlpatterns += [
    re_path(r'^(?!api/).*$', serve_react, name='react'),
]
