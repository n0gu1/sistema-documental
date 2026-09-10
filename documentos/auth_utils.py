import json
import logging
from dataclasses import dataclass
from ipaddress import ip_address
from uuid import uuid4

from django.db import connection, transaction

logger = logging.getLogger(__name__)


def get_client_ip(request):
    meta = getattr(request, 'META', {})
    forwarded_for = meta.get('HTTP_X_FORWARDED_FOR', '')
    value = forwarded_for.split(',', 1)[0].strip() if forwarded_for else meta.get('REMOTE_ADDR')
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
        'organization_id': str(user.organizacion_id),
        'username': user.nombre_usuario,
        'email': user.correo,
        'first_name': user.nombres,
        'last_name': user.apellidos,
        'full_name': f'{user.nombres} {user.apellidos}'.strip(),
        'must_change_password': user.debe_cambiar_contrasena,
        'roles': get_user_roles(user.id),
    }


def serialize_authenticated_user(user):
    """Expose global UI permissions, including the existing administrator bypass.

    Resource scope, ACL and workflow checks remain the responsibility of each API.
    """
    data = serialize_user(user)
    has_all_permissions = any(role['code'] == 'ADMINISTRADOR' for role in data['roles'])
    if has_all_permissions:
        from .models import PermisoDocumental

        permissions = list(PermisoDocumental.objects.filter(activo=True).order_by('codigo').values_list('codigo', flat=True))
    else:
        permissions = get_user_permission_codes(user.id)
    return {**data, 'permissions': sorted(set(permissions)), 'has_all_permissions': has_all_permissions}


@dataclass(frozen=True)
class AuditWriteResult:
    # inserted is not a promise that an enclosing transaction will commit.
    inserted: bool
    event_id: object = None
    pending_commit: bool = False
    failure_id: str = None
    reason: str = None


class AuditRowCountError(Exception):
    def __init__(self, count):
        self.count = count
        super().__init__('Audit insert must affect exactly one row')


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
    documento_id=None,
    version_documento_id=None,
    result=None,
    details=None,
):
    """Best effort, with explicit failure reporting; never commit the caller's work.

    Own atomic block/savepoint isolates statement failures. Successful inserts
    join the caller's transaction and roll back with it. Failures preserve the
    business outcome and are returned, logged and attached to the HTTP request.
    """
    outer_atomic = connection.in_atomic_block
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                '''
                INSERT INTO gestion_documental.bitacora_auditoria (
                    organizacion_id,
                    usuario_id,
                    sesion_id,
                    accion_id,
                    tipo_recurso_id,
                    recurso_id,
                    documento_id,
                    version_documento_id,
                    exitoso,
                    resultado,
                    detalles,
                    direccion_ip,
                    agente_usuario
                )
                SELECT %s, %s, %s, a.id, tr.id, %s, %s, %s, %s, %s, %s::jsonb, %s, %s
                FROM gestion_documental.acciones_auditoria a
                CROSS JOIN gestion_documental.tipos_recurso_auditoria tr
                WHERE a.codigo = %s AND tr.codigo = %s
                RETURNING id
                ''',
                [
                    organization_id,
                    user_id,
                    session_id,
                    resource_id,
                    documento_id,
                    version_documento_id,
                    successful,
                    result,
                    json.dumps(details or {}, default=str),
                    get_client_ip(request),
                    getattr(request, 'META', {}).get('HTTP_USER_AGENT', ''),
                    action_code,
                    resource_code,
                ],
            )
            if cursor.rowcount != 1:
                raise AuditRowCountError(cursor.rowcount)
            event_id = cursor.fetchone()[0]
        return AuditWriteResult(inserted=True, event_id=event_id, pending_commit=outer_atomic)
    except Exception as error:
        failure_id = str(uuid4())
        reason = ('catalog_not_found' if error.count == 0 else 'unexpected_row_count') if isinstance(error, AuditRowCountError) else 'write_error'
        evidence = {
            'failure_id': failure_id,
            'reason': reason,
            'action': action_code,
            'resource': resource_code,
            'organization_id': organization_id,
            'user_id': user_id,
            'resource_id': resource_id,
            'outer_atomic': outer_atomic,
            'exception_type': type(error).__name__,
            'sqlstate': getattr(error.__cause__, 'sqlstate', None) or getattr(error.__cause__, 'pgcode', None),
        }
        # Do not log payloads, tokens, SQL parameters or database error messages.
        logger.critical(
            'AUDITORIA_NO_REGISTRADA %s', json.dumps(evidence, default=str),
            extra={'audit_failure': evidence},
        )
        if request is not None:
            raw_request = getattr(request, '_request', request)
            failures = getattr(raw_request, '_audit_failures', None)
            if failures is None:
                failures = []
                raw_request._audit_failures = failures
            failures.append(failure_id)
        return AuditWriteResult(inserted=False, failure_id=failure_id, reason=reason)


def record_access_denied(request, reason, resource_code='PERMISO', resource_id=None, details=None):
    raw_request = getattr(request, '_request', request)
    if getattr(raw_request, '_access_denied_recorded', False):
        return None
    user = getattr(request, 'user', None)
    session = getattr(raw_request, '_audit_session', None)
    if not getattr(user, 'organizacion_id', None):
        user = getattr(session, 'usuario', None)
    if not getattr(user, 'id', None) or not getattr(user, 'organizacion_id', None):
        return None
    result = record_auth_event(
        action_code='ACCESO_DENEGADO',
        resource_code=resource_code,
        organization_id=getattr(user, 'organizacion_id', None),
        user_id=getattr(user, 'id', None),
        session_id=getattr(getattr(request, 'auth', None) or session, 'id', None),
        resource_id=resource_id,
        request=request,
        successful=False,
        result='Operacion denegada',
        details={**(details or {}), 'reason': reason,
                 'path': getattr(request, 'path', ''), 'method': getattr(request, 'method', '')},
    )
    raw_request._access_denied_recorded = True
    return result
