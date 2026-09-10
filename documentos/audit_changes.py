"""Explicit safe snapshots for modification events; never serialize models/requests."""
import json
import unicodedata
from django.core.serializers.json import DjangoJSONEncoder


def sensitive_field(field):
    name = ''.join(c for c in unicodedata.normalize('NFKD', field).lower() if c.isalnum())
    return any(word in name for word in (
        'password', 'passwd', 'contrasena', 'token', 'secret', 'credential',
        'credencial', 'authorization', 'cookie', 'apikey', 'accesskey',
        'privatekey', 'connectionstring', 'hashcontrasena',
    ))


def modification_changes(before, after):
    """Inputs must be explicit auditable snapshots, never request.data/__dict__."""
    changes = []
    for field in sorted(before.keys() | after.keys()):
        if sensitive_field(field):
            continue
        old = json.loads(json.dumps(before.get(field), cls=DjangoJSONEncoder))
        new = json.loads(json.dumps(after.get(field), cls=DjangoJSONEncoder))
        if old != new:
            changes.append({'field': field, 'before': old, 'after': new})
    return changes


def document_snapshot(document):
    values = {'code': document.codigo, 'title': document.nombre,
              'description': document.descripcion, 'date': document.fecha_documento,
              'area_id': document.area_id, 'type_id': document.tipo_documento_id}
    # Metadata is extensible. Only the application's declared descriptive fields
    # are auditable; unknown metadata could contain credentials under arbitrary keys.
    values.update({f'metadata.{item.clave}': item.valor for item in document.metadatos.filter(
        clave__in=['classification', 'observations'])})
    return values


def user_snapshot(user):
    return {'email': user.correo, 'first_name': user.nombres, 'last_name': user.apellidos,
            'area_id': user.area_id, 'active': user.activo,
            'locked_until': user.bloqueado_hasta, 'failed_attempts': user.intentos_fallidos}


def named_snapshot(item):
    return {'name': item.nombre, 'description': item.descripcion, 'active': item.activo,
            **({'module': item.modulo} if hasattr(item, 'modulo') else {})}


def document_acl_snapshot(payload):
    result = {}
    for assignment in payload['assignments']:
        for permission in assignment['permission_ids']:
            result[f"permissions.{assignment['role_id']}.{permission}"] = True
    for policy in payload['policies']:
        result[f"permission_policy.{policy['permission_id']}"] = policy['mode']
    return result


def settings_snapshot(values):
    allowed = {
        'general': ('organization_name', 'timezone', 'language'),
        'security': ('min_length', 'complexity', 'expiration_days', 'mfa_admins', 'mfa_users',
                     'inactivity_minutes', 'max_session_hours', 'max_failed_attempts', 'lock_minutes'),
        'smtp': ('enabled', 'port', 'security'),
        'uploads': ('max_file_mb', 'max_request_mb', 'extensions'),
        'appearance': ('primary_color', 'secondary_color'),
        'notifications': ('in_app_enabled', 'email_enabled', 'digest_frequency'),
    }
    return {f'{section}.{field}': values.get(section, {}).get(field)
            for section, fields in allowed.items() for field in fields}
