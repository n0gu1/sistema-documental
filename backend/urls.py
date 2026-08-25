from django.contrib import admin
from django.urls import path, include, re_path
from django.http import HttpResponse
from django.conf import settings
import os

def serve_react(request, path=''):
    """Sirve archivos del build de React"""
    react_dir = settings.REACT_APP_DIR
    
    # Intentar servir el archivo solicitado
    if path:
        file_path = os.path.join(react_dir, path)
        if os.path.isfile(file_path):
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                # Determinar content-type basado en extension
                if path.endswith('.js'):
                    content_type = 'application/javascript'
                elif path.endswith('.css'):
                    content_type = 'text/css'
                elif path.endswith('.svg'):
                    content_type = 'image/svg+xml'
                elif path.endswith('.html'):
                    content_type = 'text/html'
                else:
                    content_type = 'application/octet-stream'
                return HttpResponse(content, content_type=content_type)
            except Exception:
                pass
    
    # Para todo lo demas, servir index.html
    index_path = os.path.join(react_dir, 'index.html')
    if os.path.isfile(index_path):
        try:
            with open(index_path, 'r') as f:
                content = f.read()
            return HttpResponse(content, content_type='text/html')
        except Exception:
            pass
    
    return HttpResponse('Archivo no encontrado', status=404)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('documentos.urls')),
]

# React: servir archivos estaticos y SPA
urlpatterns += [
    re_path(r'^(?P<path>assets/.+)$', serve_react),
    re_path(r'^(?P<path>.+\.(js|css|svg|png|jpg|ico|json|woff|woff2|ttf|eot))$', serve_react),
    re_path(r'^(?!api/).*$', serve_react),
]
