from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve
from django.conf import settings

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('documentos.urls')),
]

# Servir archivos estaticos del build de React
reac_dist = settings.REACT_APP_DIR
urlpatterns += [
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': reac_dist / 'assets'}),
    re_path(r'^favicon\.svg$', serve, {'document_root': reac_dist / 'favicon.svg'}),
    re_path(r'^icons\.svg$', serve, {'document_root': reac_dist / 'icons.svg'}),
]

# React: servir index.html para todo lo demas
urlpatterns += [
    re_path(r'^(?!api/).*$', serve, {'document_root': reac_dist, 'path': 'index.html'}),
]
