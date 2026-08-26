import json
import logging
from ipaddress import ip_address

from django.db import connection

logger = logging.getLogger(__name__)


def get_client_ip(request):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    value = forwarded_for.split(',', 1)[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR')
    try:
        return str(ip_address(value)) if value else None
    except ValueError:
        return None


def get_user_roles(user_id):
    with connection.cursor() as cursor:
        cursor.execute(
            '''
            SELECT r.codigo, r.nombre
            FROM gestion_documental.usuarios_roles ur
            JOIN gestion_documental.roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = %s
              AND r.activo
              AND (ur.vigente_hasta IS NULL OR ur.vigente_hasta > CURRENT_TIMESTAMP)
            ORDER BY r.codigo
            ''',
            [user_id],
        )
        return [{'code': code, 'name': name} for code, name in cursor.fetchall()]


def get_user_permission_codes(user_id):
    with connection.cursor() as cursor:
        cursor.execute(
            '''
            SELECT DISTINCT p.codigo
            FROM gestion_documental.usuarios_roles ur
            JOIN gestion_documental.roles r ON r.id = ur.rol_id
            JOIN gestion_documental.roles_permisos rp ON rp.rol_id = r.id
            JOIN gestion_documental.permisos p ON p.id = rp.permiso_id
            WHERE ur.usuario_id = %s
              AND r.activo
              AND p.activo
              AND rp.concedido
              AND (ur.vigente_hasta IS NULL OR ur.vigente_hasta > CURRENT_TIMESTAMP)
            ORDER BY p.codigo
            ''',
            [user_id],
        )
        return [code for (code,) in cursor.fetchall()]


def user_has_permission(user, permission_code):
    roles = get_user_roles(user.id)
    if any(role['code'] == 'ADMINISTRADOR' for role in roles):
        return True
    return permission_code in get_user_permission_codes(user.id)


def serialize_user(user):
    return {
        'id': str(user.id),
        'username': user.nombre_usuario,
        'email': user.correo,
        'first_name': user.nombres,
        'last_name': user.apellidos,
        'full_name': f'{user.nombres} {user.apellidos}'.strip(),
        'must_change_password': user.debe_cambiar_contrasena,
        'roles': get_user_roles(user.id),
    }


def record_auth_event(
    *,
    action_code,
    resource_code,
    organization_id,
    request,
    successful,
    user_id=None,
    session_id=None,
    resource_id=None,
    result=None,
    details=None,
):
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                '''
                INSERT INTO gestion_documental.bitacora_auditoria (
                    organizacion_id,
                    usuario_id,
                    sesion_id,
                    accion_id,
                    tipo_recurso_id,
                    recurso_id,
                    exitoso,
                    resultado,
                    detalles,
                    direccion_ip,
                    agente_usuario
                )
                SELECT %s, %s, %s, a.id, tr.id, %s, %s, %s, %s::jsonb, %s, %s
                FROM gestion_documental.acciones_auditoria a
                CROSS JOIN gestion_documental.tipos_recurso_auditoria tr
                WHERE a.codigo = %s AND tr.codigo = %s
                ''',
                [
                    organization_id,
                    user_id,
                    session_id,
                    resource_id,
                    successful,
                    result,
                    json.dumps(details or {}),
                    get_client_ip(request),
                    request.META.get('HTTP_USER_AGENT', ''),
                    action_code,
                    resource_code,
                ],
            )
            if cursor.rowcount != 1:
                logger.error(
                    'No se encontró el catálogo de auditoría action=%s resource=%s',
                    action_code,
                    resource_code,
                )
    except Exception:
        logger.exception('No se pudo registrar el evento de autenticación')
