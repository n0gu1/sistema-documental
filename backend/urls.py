from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, HttpResponseNotFound
from django.urls import include, path, re_path
import os
import mimetypes
import logging

logger = logging.getLogger(__name__)

REACT_DIST = os.path.join(str(settings.BASE_DIR), 'frontend', 'dist')

MIME_TYPES = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
}


def serve_react(request, path=''):
    if path:
        file_path = os.path.join(REACT_DIST, path)
        if os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1].lower()
            content_type = MIME_TYPES.get(ext, 'application/octet-stream')
            with open(file_path, 'rb') as f:
                return HttpResponse(f.read(), content_type=content_type)

    index_path = os.path.join(REACT_DIST, 'index.html')
    if os.path.isfile(index_path):
        with open(index_path, 'r') as f:
            return HttpResponse(f.read(), content_type='text/html')
    return HttpResponse('<h1>Frontend not built</h1>', status=500)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('documentos.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [
    re_path(r'^(?!api/|static/).*$', serve_react, name='react'),
]
