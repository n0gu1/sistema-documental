"""Pruebas reales de las vistas DRF; todos los datos de ensayo se revierten.

Ejecutar con las dependencias del proyecto y su BD configurada. No usa mocks.
"""
import json
import os
import sys
import uuid
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.tmp-role-deps'), str(ROOT)]
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos.models import RolDocumental, RolPermisoDocumental, PermisoDocumental, UsuarioDocumental, UsuarioRolDocumental
from documentos.management_views import UserListCreateView, UserRolesView
from documentos.auth_utils import get_user_roles

factory = APIRequestFactory()
results = []
prefix = 'segroles_' + uuid.uuid4().hex[:10]
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local', activo=True)
roles = {r.codigo: r for r in RolDocumental.objects.filter(organizacion_id=admin.organizacion_id, activo=True)}
created_ids = []

def codes(user):
    # CURRENT_TIMESTAMP de PostgreSQL queda fijado al iniciar la transacción externa.
    # Comprobar vigencia con hora real tras cada operación para este ensayo reversible.
    return sorted(UsuarioRolDocumental.objects.filter(usuario_id=user.id, rol__activo=True).filter(
        Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gt=timezone.now())
    ).values_list('rol__codigo', flat=True))

def create(actor, role, expected, name):
    username = f'{prefix}_{len(results)}'
    data = dict(username=username, email=f'{username}@test.local', first_name='Seguridad',
                last_name='Roles', organization_id=str(admin.organizacion_id),
                temporary_password='Ensayo!Roles' + uuid.uuid4().hex,
                role_ids=[str(role.id)])
    request = factory.post('/api/admin/users/', data, format='json')
    force_authenticate(request, user=actor)
    response = UserListCreateView.as_view()(request)
    assert response.status_code == expected, (name, response.status_code, response.data)
    user = UsuarioDocumental.objects.filter(nombre_usuario=username).first()
    if expected == 201:
        assert codes(user) == [role.codigo]
        created_ids.append(user.id)
    else:
        assert user is None, 'Alta prohibida produjo un usuario'
    results.append(dict(test=name, status=expected, result='PASS'))
    print(json.dumps(results[-1]), flush=True)
    return user

def assign(actor, target, ids, expected, name, wanted=None):
    before = list(UsuarioRolDocumental.objects.filter(usuario_id=target.id).order_by('rol_id').values())
    request = factory.put(f'/api/admin/users/{target.id}/roles/', {'role_ids': [str(i) for i in ids]}, format='json')
    force_authenticate(request, user=actor)
    response = UserRolesView.as_view()(request, user_id=target.id)
    assert response.status_code == expected, (name, response.status_code, response.data)
    if expected != 200:
        assert before == list(UsuarioRolDocumental.objects.filter(usuario_id=target.id).order_by('rol_id').values())
    elif wanted is not None:
        assert codes(target) == sorted(wanted), (name, codes(target))
    results.append(dict(test=name, status=expected, result='PASS'))
    print(json.dumps(results[-1]), flush=True)

with transaction.atomic():
    # Roles/grants de ensayo solo visibles dentro de esta transacción y revertidos al final.
    now = timezone.now()
    delegate_role = RolDocumental.objects.create(id=uuid.uuid4(), organizacion_id=admin.organizacion_id,
        codigo=prefix.upper(), nombre=prefix, activo=True, creado_en=now, actualizado_en=now)
    lector_permissions = list(RolPermisoDocumental.objects.filter(rol=roles['LECTOR']).values_list('permiso_id', flat=True))
    manager_permission = PermisoDocumental.objects.get(codigo='usuarios.gestionar', activo=True)
    for permission_id in set(lector_permissions + [manager_permission.id]):
        RolPermisoDocumental.objects.create(rol=delegate_role, permiso_id=permission_id, asignado_por=admin, asignado_en=now)
    delegate = create(admin, delegate_role, 201, 'Administrador crea gestor limitado')
    delegate.debe_cambiar_contrasena = False
    target = create(admin, roles['EDITOR'], 201, 'Administrador crea Editor')
    create(admin, roles['REVISOR'], 201, 'Administrador crea Revisor')
    create(admin, roles['LECTOR'], 201, 'Administrador crea Lector')
    elevated = create(admin, roles['ADMINISTRADOR'], 201, 'Administrador crea Administrador')
    assign(admin, target, [roles['REVISOR'].id], 200, 'Administrador cambia Editor a Revisor', ['REVISOR'])
    assign(admin, target, [roles['ADMINISTRADOR'].id], 200, 'Administrador otorga Administrador', ['ADMINISTRADOR'])
    assign(delegate, target, [roles['LECTOR'].id], 403, 'Gestor no puede degradar Administrador')
    assign(admin, target, [roles['LECTOR'].id], 200, 'Administrador cambia a Lector', ['LECTOR'])
    create(delegate, roles['LECTOR'], 201, 'Gestor crea Lector dentro de su autoridad')
    for code in ('ADMINISTRADOR', 'EDITOR', 'REVISOR'):
        create(delegate, roles[code], 403, f'Gestor no crea {code} fuera de su autoridad')
        assign(delegate, target, [roles[code].id], 403, f'Gestor no otorga {code} fuera de su autoridad')
    assign(delegate, target, [roles['LECTOR'].id, roles['ADMINISTRADOR'].id], 403, 'Lista mixta no permite escalar')
    assign(delegate, delegate, [roles['ADMINISTRADOR'].id], 403, 'Gestor no se eleva a Administrador')
    assign(delegate, target, [roles['LECTOR'].id], 200, 'Gestor asigna Lector dentro de su autoridad', ['LECTOR'])
    assign(admin, target, [roles['REVISOR'].id], 200, 'Preparar destinatario de autoridad superior', ['REVISOR'])
    assign(delegate, target, [], 403, 'Gestor no elimina roles de usuario superior')
    for code in ('EDITOR', 'REVISOR', 'LECTOR'):
        ordinary = UsuarioDocumental.objects.get(correo=f'prueba.{code.lower()}@test.local')
        create(ordinary, roles['ADMINISTRADOR'], 403, f'{code} sin gestionar no crea Administrador')
        assign(ordinary, target, [roles['LECTOR'].id], 403, f'{code} sin gestionar no reasigna')
    assign(admin, target, [uuid.uuid4()], 400, 'UUID inexistente rechazado')
    inactive = RolDocumental.objects.create(id=uuid.uuid4(), organizacion_id=admin.organizacion_id,
        codigo=prefix.upper() + '_OFF', nombre=prefix + '_off', activo=False, creado_en=now, actualizado_en=now)
    assign(admin, target, [inactive.id], 400, 'Rol inactivo rechazado incluso a Administrador')
    # Un antiguo Administrador debe perder la excepción al vencer su asignación.
    UsuarioRolDocumental.objects.create(usuario=delegate, rol=roles['ADMINISTRADOR'], asignado_por=admin,
        asignado_en=now-timedelta(days=2), vigente_hasta=now-timedelta(days=1))
    assign(delegate, target, [roles['ADMINISTRADOR'].id], 403, 'Administrador vencido no conserva autoridad')
    transaction.set_rollback(True)

assert not UsuarioDocumental.objects.filter(id__in=created_ids).exists()
assert not RolDocumental.objects.filter(id=delegate_role.id).exists()
output = {'environment': 'Backend local y BD Neon, DRF APIRequestFactory sin mocks',
          'rolled_back': True, 'tests': results}
(ROOT / 'docs' / 'resultado_seguridad_roles.json').write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
print(f'PASS: {len(results)} pruebas. Datos de ensayo revertidos.')
