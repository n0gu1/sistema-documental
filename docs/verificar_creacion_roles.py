"""Prueba acotada del requisito 6 contra la BD configurada (crea tres usuarios)."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tmp-role-deps'))
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from documentos.models import UsuarioDocumental, RolDocumental, UsuarioRolDocumental
from documentos.management_views import UserListCreateView, UserDetailView
from rest_framework.test import APIRequestFactory, force_authenticate

admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local', activo=True)
factory = APIRequestFactory()
stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
results = []
for code in ('EDITOR', 'REVISOR', 'LECTOR'):
    role = RolDocumental.objects.get(organizacion_id=admin.organizacion_id, codigo=code, activo=True)
    username = f'req6.{code.lower()}.{stamp}'
    payload = {
        'username': username, 'email': f'{username}@test.local',
        'first_name': 'Prueba requisito 6', 'last_name': code,
        'organization_id': str(admin.organizacion_id),
        'temporary_password': os.environ['ROLE_TEST_PASSWORD'],
        'role_ids': [str(role.id)],
    }
    request = factory.post('/api/admin/users/', payload, format='json')
    force_authenticate(request, user=admin)
    response = UserListCreateView.as_view()(request)
    assert response.status_code == 201, (response.status_code, response.data)
    user_id = response.data['user']['id']
    request = factory.get(f'/api/admin/users/{user_id}/')
    force_authenticate(request, user=admin)
    detail = UserDetailView.as_view()(request, user_id=user_id)
    assert detail.status_code == 200, detail.data
    api_codes = [r['code'] for r in detail.data['user']['roles']]
    db_roles = list(UsuarioRolDocumental.objects.filter(usuario_id=user_id).values_list('rol_id', 'rol__codigo'))
    assert api_codes == [code], api_codes
    assert db_roles == [(role.id, code)], db_roles
    assert 'ADMINISTRADOR' not in api_codes
    results.append({'email': payload['email'], 'id': str(user_id), 'selected_role_id': str(role.id), 'api_roles': api_codes, 'db_roles': [c for _, c in db_roles], 'status': 'PASS'})
    print(json.dumps(results[-1]), flush=True)

(ROOT / 'docs' / 'resultado_creacion_roles.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
