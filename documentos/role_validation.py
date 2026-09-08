from contextlib import contextmanager

from django.db import IntegrityError, transaction
from rest_framework.exceptions import APIException
from .models import RolDocumental


class RoleConflict(APIException):
    status_code = 409


def duplicate_role(field):
    raise RoleConflict({'code': 'ROLE_ALREADY_EXISTS' if field == 'codigo' else 'ROLE_NAME_ALREADY_EXISTS',
                        'detail': 'El codigo del rol ya existe.' if field == 'codigo' else 'El nombre del rol ya existe.'})


def validate_role_name(organization_id, name, role_id=None):
    query = RolDocumental.objects.filter(organizacion_id=organization_id, nombre=name)
    if role_id is not None:
        query = query.exclude(pk=role_id)
    if query.exists():
        duplicate_role('nombre')


@contextmanager
def role_write():
    try:
        with transaction.atomic():
            yield
    except IntegrityError as error:
        # También cubre solicitudes concurrentes, después de revertir el savepoint.
        constraint = getattr(getattr(error.__cause__, 'diag', None), 'constraint_name', None)
        if constraint == 'uq_roles_organizacion_codigo':
            duplicate_role('codigo')
        if constraint == 'uq_roles_organizacion_nombre':
            duplicate_role('nombre')
        raise
