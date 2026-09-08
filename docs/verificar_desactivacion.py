"""Ciclo real de sesiones para las tres vías; preparación revertida al terminar."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.tmp-ui-deps'), str(ROOT)]
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.conf import settings
from django.db import transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.views import LoginView, CurrentUserView
from documentos.management_views import UserDetailView, UserStatusView
from documentos.models import UsuarioDocumental, SesionDocumental

factory = APIRequestFactory()
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
user = UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
results = []

def login():
    request = factory.post('/api/auth/login/', {'identity': user.correo, 'password': os.environ['ACL_TEST_PASSWORD'], 'remember': False}, format='json')
    response = LoginView.as_view()(request)
    assert response.status_code == 200, response.status_code
    return response.cookies[settings.AUTH_COOKIE_NAME].value

def me(token):
    request = factory.get('/api/auth/me/')
    request.COOKIES[settings.AUTH_COOKIE_NAME] = token
    return CurrentUserView.as_view()(request).status_code

def change(view, method, active):
    request = getattr(factory, method)('/api/admin/users/test/', {'active': active}, format='json')
    force_authenticate(request, user=admin)
    response = view.as_view()(request, user_id=user.id)
    assert response.status_code == 200, response.data

with transaction.atomic():
    for view, method in [(UserDetailView, 'patch'), (UserDetailView, 'delete'), (UserStatusView, 'post')]:
        first = login()
        untouched = login()
        assert me(first) == 200
        change(view, method, False)
        assert not SesionDocumental.objects.filter(usuario_id=user.id, revocada_en__isnull=True).exists()
        disabled = me(first)
        assert disabled in (401, 403)
        change(UserStatusView, 'post', True)
        reactivated = me(first)
        untouched_status = me(untouched)
        assert reactivated in (401, 403)
        assert untouched_status in (401, 403)
        fresh = login()
        assert me(fresh) == 200
        results.append({'path': f'{view.__name__}.{method}', 'initial_session': 200,
                        'after_disable': disabled, 'old_after_reactivate': reactivated,
                        'unused_old_after_reactivate': untouched_status,
                        'new_login': 200, 'new_session': 200})
    transaction.set_rollback(True)

result = {'status': 'PASS', 'cases': results, 'rolled_back': True}
(ROOT / 'docs/resultado_desactivacion.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
