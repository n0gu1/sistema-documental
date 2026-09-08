"""Estado explícito independiente de la existencia de concesiones por rol."""
from django.db import connection
from rest_framework.exceptions import ValidationError
from .models import PermisoDocumental


def read_policies(document_id):
    with connection.cursor() as cursor:
        cursor.execute('SELECT permiso_id, modo FROM gestion_documental.documentos_politicas_acl WHERE documento_id=%s', [document_id])
        return [{'permission_id': str(pid), 'mode': mode} for pid, mode in cursor.fetchall()]


def validate_policies(policies, assignments):
    ids = [item['permission_id'] for item in policies]
    if len(ids) != len(set(ids)):
        raise ValidationError({'policies': 'No puede repetir un permiso.'})
    if set(ids) != set(PermisoDocumental.objects.filter(id__in=ids, activo=True).values_list('id', flat=True)):
        raise ValidationError({'policies': 'Los permisos deben existir y estar activos.'})
    granted = {pid for item in assignments for pid in item['permission_ids']}
    if any(item['mode'] != 'PERMITIR' and item['permission_id'] in granted for item in policies):
        raise ValidationError({'policies': 'HEREDAR y DENEGAR no admiten concesiones de roles.'})


def save_policies(cursor, document_id, policies, assignments):
    # Retener también estados de ACL anteriores a la migración o escritura actual.
    cursor.execute("""INSERT INTO gestion_documental.documentos_politicas_acl
        SELECT DISTINCT documento_id, permiso_id, 'PERMITIR'
        FROM gestion_documental.documentos_roles_permisos WHERE documento_id=%s
        ON CONFLICT DO NOTHING""", [document_id])
    modes = {pid: 'PERMITIR' for item in assignments for pid in item['permission_ids']}
    modes.update({item['permission_id']: item['mode'] for item in policies})
    cursor.executemany("""INSERT INTO gestion_documental.documentos_politicas_acl
        (documento_id, permiso_id, modo) VALUES (%s, %s, %s)
        ON CONFLICT (documento_id, permiso_id) DO UPDATE SET modo=EXCLUDED.modo""",
        [(document_id, pid, mode) for pid, mode in modes.items()])
