from django.contrib import admin
from django.urls import path, include, re_path
from django.http import HttpResponse, FileResponse
from django.conf import settings
import os

def serve_react(request, path=''):
    """Sirve archivos del build de React"""
    react_dir = settings.REACT_APP_DIR
    
    # Si se pide un archivo especifico, servirlo
    if path:
        file_path = os.path.join(react_dir, path)
        if os.path.isfile(file_path):
            return FileResponse(open(file_path, 'rb'))
    
    # Para todo lo demas, servir index.html
    index_path = os.path.join(react_dir, 'index.html')
    if os.path.isfile(index_path):
        return FileResponse(open(index_path, 'rb'))
    
    return HttpResponse('Archivo no encontrado', status=404)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('documentos.urls')),
]

# React: servir archivos estaticos y SPA
urlpatterns += [
    re_path(r'^assets/(?P<path>.*)$', lambda r, path: serve_react(r, f'assets/{path}')),
    re_path(r'^(?P<path>.+\.(js|css|svg|png|jpg|ico|json))$', lambda r, path: serve_react(r, path)),
    re_path(r'^(?!api/).*$', serve_react),
]
