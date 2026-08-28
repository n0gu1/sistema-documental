import base64
import binascii
import hashlib
import json
import logging
import secrets
import uuid
from contextlib import contextmanager
from datetime import timedelta
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.utils import timezone

from .models import ArchivoDocumento, ConfiguracionRespaldo, Respaldo


logger = logging.getLogger(__name__)
BACKUP_MAGIC = b'SDBK1'
BACKUP_FORMAT = 'sistema-documental-backup-v2'
BACKUP_SCHEMA = 'gestion_documental'
DEFAULT_RETENTION_DAYS = 30
SUPPORTED_FREQUENCIES = {'daily', 'weekly', 'monthly'}
SUPPORTED_DESTINATIONS = {'s3', 'filesystem'}
GLOBAL_BACKUP_TABLES = frozenset({
    'acciones_auditoria',
    'estados_documento',
    'estados_revision',
    'estados_version',
    'permisos',
    'tipos_documento',
    'tipos_recurso_auditoria',
})
BACKUP_OPERATIONAL_TABLES = frozenset({
    'configuraciones_respaldo_v2',
    'respaldos_v2',
})
BACKUP_RELATIONS = {
    'sesiones': (('usuarios', 'usuario_id', 'id'),),
    'usuarios_roles': (
        ('usuarios', 'usuario_id', 'id'),
        ('roles', 'rol_id', 'id'),
        ('usuarios', 'asignado_por_id', 'id'),
    ),
    'roles_permisos': (
        ('roles', 'rol_id', 'id'),
        ('usuarios', 'asignado_por_id', 'id'),
    ),
    'versiones_documento': (
        ('documentos', 'documento_id', 'id'),
        ('proveedores_almacenamiento', 'proveedor_almacenamiento_id', 'id'),
        ('usuarios', 'creada_por_id', 'id'),
    ),
    'documentos_metadatos': (('documentos', 'documento_id', 'id'),),
    'documentos_roles_permisos': (
        ('documentos', 'documento_id', 'id'),
        ('roles', 'rol_id', 'id'),
        ('usuarios', 'asignado_por_id', 'id'),
    ),
    'solicitudes_revision': (
        ('versiones_documento', 'version_documento_id', 'id'),
        ('usuarios', 'revisor_id', 'id'),
        ('usuarios', 'solicitada_por_id', 'id'),
    ),
    'historial_estados_version': (
        ('versiones_documento', 'version_documento_id', 'id'),
        ('usuarios', 'cambiado_por_id', 'id'),
    ),
    'solicitudes_revision_detalle': (('solicitudes_revision', 'solicitud_revision_id', 'id'),),
    'revision_comentarios': (
        ('solicitudes_revision', 'solicitud_revision_id', 'id'),
        ('usuarios', 'autor_id', 'id'),
        ('usuarios', 'resuelto_por_id', 'id'),
    ),
    'revisiones_checklist': (
        ('solicitudes_revision', 'solicitud_revision_id', 'id'),
        ('usuarios', 'completada_por_id', 'id'),
    ),
    'documentos_accesos': (
        ('documentos', 'documento_id', 'id'),
        ('versiones_documento', 'version_documento_id', 'id'),
        ('usuarios', 'usuario_id', 'id'),
    ),
    'documentos_favoritos': (
        ('documentos', 'documento_id', 'id'),
        ('usuarios', 'usuario_id', 'id'),
    ),
    'notificaciones': (
        ('usuarios', 'usuario_id', 'id'),
        ('documentos', 'documento_id', 'id'),
        ('versiones_documento', 'version_documento_id', 'id'),
        ('solicitudes_revision', 'solicitud_revision_id', 'id'),
    ),
}


class BackupExecutionError(Exception):
    def __init__(self, message, backup=None):
        super().__init__(message)
        self.backup = backup


def configured_destination():
    backend = getattr(settings, 'STORAGE_BACKEND', 'filesystem')
    return 's3' if backend == 's3' else 'filesystem'


def destination_options():
    options = []
    if getattr(settings, 'STORAGE_BACKEND', 'filesystem') == 's3':
        options.append({
            'code': 's3',
            'name': 'Almacenamiento S3/B2',
            'active': True,
            'location': getattr(settings, 'AWS_LOCATION', 'documentos'),
        })
    if settings.DEBUG:
        options.append({'code': 'filesystem', 'name': 'Almacenamiento local', 'active': True, 'location': str(settings.MEDIA_ROOT)})
    return options


def backup_key():
    configured = getattr(settings, 'BACKUP_ENCRYPTION_KEY', '') or ''
    if configured:
        try:
            decoded = base64.urlsafe_b64decode(configured + '=' * (-len(configured) % 4))
        except (ValueError, binascii.Error) as error:
            raise BackupExecutionError('BACKUP_ENCRYPTION_KEY no es una clave Base64 valida.') from error
        if len(decoded) != 32:
            raise BackupExecutionError('BACKUP_ENCRYPTION_KEY debe contener 32 bytes.')
        return decoded
    return hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()


def encrypt_archive(archive):
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(backup_key()).encrypt(nonce, archive, None)
    return BACKUP_MAGIC + nonce + encrypted


def decrypt_archive(payload):
    if not payload.startswith(BACKUP_MAGIC) or len(payload) <= len(BACKUP_MAGIC) + 12:
        raise BackupExecutionError('El respaldo no tiene un formato valido.')
    nonce_start = len(BACKUP_MAGIC)
    nonce = payload[nonce_start:nonce_start + 12]
    try:
        return AESGCM(backup_key()).decrypt(nonce, payload[nonce_start + 12:], None)
    except Exception as error:
        raise BackupExecutionError('No fue posible descifrar el respaldo; la clave no coincide o el archivo esta danado.') from error


def json_default(value):
    if isinstance(value, bytes):
        return {'__bytes__': base64.b64encode(value).decode('ascii')}
    return str(value)


def database_table_names():
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                [BACKUP_SCHEMA],
            )
            return [row[0] for row in cursor.fetchall()]
    return connection.introspection.table_names()


def qualified_table_name(table_name):
    quoted_table = connection.ops.quote_name(table_name)
    if connection.vendor == 'postgresql':
        return f'{connection.ops.quote_name(BACKUP_SCHEMA)}.{quoted_table}'
    return quoted_table


def catalog_rows(sql, params=None):
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        columns = [item[0] for item in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def database_column_metadata(table_name):
    if connection.vendor == 'postgresql':
        return catalog_rows(
            """
            SELECT column_name, ordinal_position, data_type, udt_name,
                   is_nullable, column_default, is_identity, identity_generation,
                   is_generated, generation_expression
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            [BACKUP_SCHEMA, table_name],
        )
    with connection.cursor() as cursor:
        columns = connection.introspection.get_table_description(cursor, table_name)
    return [
        {
            'column_name': getattr(column, 'name', column[0]),
            'ordinal_position': index,
            'data_type': str(getattr(column, 'type_code', '')),
            'udt_name': None,
            'is_nullable': 'YES' if getattr(column, 'null_ok', True) else 'NO',
            'column_default': None,
            'is_identity': 'NO',
            'identity_generation': None,
            'is_generated': 'NEVER',
            'generation_expression': None,
        }
        for index, column in enumerate(columns, start=1)
    ]


def database_schema_snapshot(table_names):
    tables = []
    columns_by_table = {}
    for table_name in table_names:
        columns = database_column_metadata(table_name)
        tables.append({'name': table_name, 'columns': columns})
        columns_by_table[table_name] = {item['column_name'] for item in columns}

    if connection.vendor == 'postgresql':
        constraints = catalog_rows(
            """
            SELECT c.relname AS table_name,
                   constraint_row.conname AS constraint_name,
                   CASE constraint_row.contype
                       WHEN 'p' THEN 'PRIMARY KEY'
                       WHEN 'u' THEN 'UNIQUE'
                       WHEN 'f' THEN 'FOREIGN KEY'
                       WHEN 'c' THEN 'CHECK'
                       WHEN 'x' THEN 'EXCLUDE'
                       ELSE constraint_row.contype::text
                   END AS constraint_type,
                   referenced.relname AS foreign_table_name,
                   ARRAY(
                       SELECT attribute.attname
                       FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, position)
                       JOIN pg_attribute attribute
                         ON attribute.attrelid = constraint_row.conrelid
                        AND attribute.attnum = key.attnum
                       ORDER BY key.position
                   ) AS constraint_columns,
                   ARRAY(
                       SELECT attribute.attname
                       FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, position)
                       JOIN pg_attribute attribute
                         ON attribute.attrelid = constraint_row.confrelid
                        AND attribute.attnum = key.attnum
                       ORDER BY key.position
                   ) AS foreign_columns,
                   pg_get_constraintdef(constraint_row.oid, true) AS definition
            FROM pg_constraint constraint_row
            JOIN pg_class c ON c.oid = constraint_row.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_class referenced ON referenced.oid = constraint_row.confrelid
            WHERE n.nspname = %s
            ORDER BY c.relname, constraint_name
            """,
            [BACKUP_SCHEMA],
        )
        indexes = catalog_rows(
            """
            SELECT tablename AS table_name, indexname AS index_name, indexdef
            FROM pg_indexes
            WHERE schemaname = %s
            ORDER BY tablename, indexname
            """,
            [BACKUP_SCHEMA],
        )
        views = catalog_rows(
            """
            SELECT table_name, view_definition
            FROM information_schema.views
            WHERE table_schema = %s
            ORDER BY table_name
            """,
            [BACKUP_SCHEMA],
        )
        triggers = catalog_rows(
            """
            SELECT c.relname AS table_name,
                   t.tgname AS trigger_name,
                   pg_get_triggerdef(t.oid, true) AS definition
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = %s AND NOT t.tgisinternal
            ORDER BY c.relname, trigger_name
            """,
            [BACKUP_SCHEMA],
        )
        policies = catalog_rows(
            """
            SELECT schemaname, tablename, policyname, permissive,
                   roles, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname = %s
            ORDER BY tablename, policyname
            """,
            [BACKUP_SCHEMA],
        )
        routines = catalog_rows(
            """
            SELECT routine_name, routine_type, data_type, routine_definition
            FROM information_schema.routines
            WHERE routine_schema = %s
            ORDER BY routine_name
            """,
            [BACKUP_SCHEMA],
        )
    else:
        constraints = []
        indexes = []
        views = []
        triggers = []
        policies = []
        routines = []

    return {
        'name': BACKUP_SCHEMA,
        'vendor': connection.vendor,
        'captured_at': timezone.now().isoformat(),
        'tables': tables,
        'constraints': constraints,
        'indexes': indexes,
        'views': views,
        'triggers': triggers,
        'policies': policies,
        'routines': routines,
        'tenant_scope': {
            'organization_column': 'organizacion_id',
            'global_tables': sorted(GLOBAL_BACKUP_TABLES),
            'relation_rules': {
                table_name: [list(relation) for relation in relations]
                for table_name, relations in BACKUP_RELATIONS.items()
            },
        },
    }, columns_by_table


def database_sequence_snapshot():
    if connection.vendor != 'postgresql':
        return []
    return catalog_rows(
        """
        SELECT sequencename AS sequence_name,
               data_type,
               start_value,
               min_value AS minimum_value,
               max_value AS maximum_value,
               increment_by,
               cycle,
               cache_size,
               last_value
        FROM pg_catalog.pg_sequences
        WHERE schemaname = %s
        ORDER BY sequencename
        """,
        [BACKUP_SCHEMA],
    )


def _constraint_columns(constraint, key):
    values = constraint.get(key)
    if values is None:
        fallback = 'columns' if key == 'constraint_columns' else 'referenced_columns'
        values = constraint.get(fallback, [])
    if isinstance(values, str):
        return [values]
    return list(values or [])


def _schema_table_columns(table_definition):
    columns = table_definition.get('columns', [])
    if not isinstance(columns, list):
        raise BackupExecutionError('Las columnas del esquema del respaldo no son validas.')
    return {
        column.get('column_name') if isinstance(column, dict) else str(column)
        for column in columns
    }


def _schema_table_definitions(schema_definition):
    if not isinstance(schema_definition, dict) or not isinstance(schema_definition.get('tables', []), list):
        raise BackupExecutionError('Las tablas del esquema del respaldo no son validas.')
    definitions = {}
    for table in schema_definition.get('tables', []):
        if not isinstance(table, dict):
            raise BackupExecutionError('El esquema del respaldo contiene una tabla invalida.')
        table_name = table.get('name')
        if not table_name or table_name in definitions:
            raise BackupExecutionError('El esquema del respaldo contiene tablas duplicadas o invalidas.')
        definitions[table_name] = table
    return definitions


def _primary_key_columns(constraints, table_name):
    for constraint in constraints:
        if constraint.get('table_name') == table_name and constraint.get('constraint_type') == 'PRIMARY KEY':
            return _constraint_columns(constraint, 'constraint_columns')
    return []


def _foreign_key_constraints(constraints, table_name):
    return [
        constraint
        for constraint in constraints
        if constraint.get('table_name') == table_name
        and constraint.get('constraint_type') == 'FOREIGN KEY'
        and constraint.get('foreign_table_name')
        and _constraint_columns(constraint, 'constraint_columns')
        and _constraint_columns(constraint, 'foreign_columns')
    ]


def _fallback_foreign_key_constraints(table_name):
    return [
        {
            'table_name': table_name,
            'constraint_columns': [local_column],
            'foreign_table_name': parent_table,
            'foreign_columns': [parent_column],
        }
        for parent_table, local_column, parent_column in BACKUP_RELATIONS.get(table_name, ())
    ]


def _decode_backup_value(value):
    if isinstance(value, dict):
        if set(value) == {'__bytes__'}:
            try:
                return base64.b64decode(value['__bytes__'], validate=True)
            except (TypeError, ValueError, binascii.Error) as error:
                raise BackupExecutionError('El respaldo contiene un valor binario invalido.') from error
        return {key: _decode_backup_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_decode_backup_value(item) for item in value]
    return value


def _lookup_value(value):
    value = _decode_backup_value(value)
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=json_default, sort_keys=True, ensure_ascii=True)
    return str(value)


def _restore_value(value, column_type):
    value = _decode_backup_value(value)
    if value is not None and column_type in {'json', 'jsonb'}:
        return json.dumps(value, default=json_default, ensure_ascii=True)
    return value


def _row_identity(table_name, row, primary_keys):
    if primary_keys:
        values = tuple(_lookup_value(row.get(column)) for column in primary_keys)
        if any(value is None for value in values):
            raise BackupExecutionError(f'Una fila de {table_name} no contiene su clave primaria completa.')
        return table_name, values
    return table_name, id(row)


def _snapshot_scope_resolver(schema_definition, database, organization_id):
    if not isinstance(database, dict):
        raise BackupExecutionError('La base de datos del respaldo no es valida.')
    table_definitions = _schema_table_definitions(schema_definition)
    constraints = schema_definition.get('constraints', [])
    if not isinstance(constraints, list) or any(not isinstance(item, dict) for item in constraints):
        raise BackupExecutionError('Las restricciones del esquema del respaldo no son validas.')
    constraints_by_table = {
        table_name: _foreign_key_constraints(constraints, table_name)
        for table_name in table_definitions
    }
    rows_by_table = {}
    for table in database.get('tables', []):
        rows_by_table[table.get('name')] = table.get('rows', [])
    lookup_cache = {}
    primary_keys = {
        table_name: _primary_key_columns(constraints, table_name)
        for table_name in table_definitions
    }

    def find_row(table_name, columns, values):
        cache_key = table_name, tuple(columns)
        lookup = lookup_cache.get(cache_key)
        if lookup is None:
            lookup = {}
            for row in rows_by_table.get(table_name, []):
                key = tuple(_lookup_value(row.get(column)) for column in columns)
                if any(value is None for value in key):
                    continue
                if key in lookup:
                    raise BackupExecutionError(f'El respaldo contiene claves duplicadas en {table_name}.')
                lookup[key] = row
            lookup_cache[cache_key] = lookup
        return lookup.get(tuple(_lookup_value(value) for value in values))

    memo = {}
    resolving = set()

    def resolve(table_name, row):
        identity = _row_identity(table_name, row, primary_keys.get(table_name, []))
        if identity in memo:
            return memo[identity]
        if identity in resolving:
            raise BackupExecutionError(f'El respaldo contiene una dependencia circular invalida en {table_name}.')
        resolving.add(identity)
        columns = _schema_table_columns(table_definitions[table_name])
        scopes = []
        if 'organizacion_id' in columns:
            value = row.get('organizacion_id')
            if value is None:
                raise BackupExecutionError(f'La tabla {table_name} contiene una fila sin organizacion.')
            scopes.append(str(value))
        elif table_name == 'organizaciones':
            value = row.get('id')
            if value is None:
                raise BackupExecutionError('La tabla organizaciones contiene una fila sin id.')
            scopes.append(str(value))
        elif table_name in GLOBAL_BACKUP_TABLES:
            resolving.remove(identity)
            memo[identity] = None
            return None

        foreign_keys = constraints_by_table.get(table_name) or _fallback_foreign_key_constraints(table_name)
        for constraint in foreign_keys:
            local_columns = _constraint_columns(constraint, 'constraint_columns')
            foreign_table = constraint.get('foreign_table_name')
            foreign_columns = _constraint_columns(constraint, 'foreign_columns')
            local_values = [row.get(column) for column in local_columns]
            if all(value is None for value in local_values):
                continue
            if any(value is None for value in local_values):
                raise BackupExecutionError(f'La tabla {table_name} contiene una clave foranea incompleta.')
            parent_row = find_row(foreign_table, foreign_columns, local_values)
            if parent_row is None:
                raise BackupExecutionError(
                    f'La fila de {table_name} referencia una fila ausente de {foreign_table}.',
                )
            if foreign_table == table_name:
                continue
            parent_scope = resolve(foreign_table, parent_row)
            if parent_scope is not None:
                scopes.append(parent_scope)

        if not scopes:
            resolving.remove(identity)
            raise BackupExecutionError(
                f'No se pudo determinar la organizacion de la tabla {table_name}.',
            )
        normalized_scopes = {str(scope) for scope in scopes}
        if len(normalized_scopes) != 1:
            resolving.remove(identity)
            raise BackupExecutionError(
                f'La fila de {table_name} relaciona organizaciones diferentes.',
            )
        scope = normalized_scopes.pop()
        if scope != str(organization_id):
            resolving.remove(identity)
            raise BackupExecutionError(
                f'El snapshot contiene una fila de {table_name} de otra organizacion.',
            )
        memo[identity] = scope
        resolving.remove(identity)
        return scope

    return table_definitions, rows_by_table, primary_keys, resolve


def validate_database_snapshot(database, schema_definition, organization_id, manifest=None):
    if not isinstance(database, dict) or not isinstance(schema_definition, dict):
        raise BackupExecutionError('El snapshot de la base de datos no es valido.')
    if database.get('schema') != BACKUP_SCHEMA or schema_definition.get('name') != BACKUP_SCHEMA:
        raise BackupExecutionError('El snapshot no pertenece al esquema documental esperado.')
    if str(database.get('organization_id')) != str(organization_id):
        raise BackupExecutionError('La organizacion del snapshot no coincide con la restauracion solicitada.')
    database_tables = database.get('tables', [])
    if not isinstance(database_tables, list):
        raise BackupExecutionError('Las tablas del snapshot no son validas.')
    seen_tables = set()
    record_count = 0
    for table in database_tables:
        if not isinstance(table, dict):
            raise BackupExecutionError('El snapshot contiene una tabla invalida.')
        table_name = table.get('name')
        if not table_name or table_name in seen_tables:
            raise BackupExecutionError('El snapshot contiene tablas duplicadas o invalidas.')
        seen_tables.add(table_name)
        columns = table.get('columns', [])
        rows = table.get('rows', [])
        if not isinstance(columns, list) or not all(isinstance(column, str) for column in columns):
            raise BackupExecutionError(f'Las columnas de {table_name} no son validas.')
        if not isinstance(rows, list):
            raise BackupExecutionError(f'Las filas de {table_name} no son validas.')
        if any(not isinstance(row, dict) for row in rows):
            raise BackupExecutionError(f'Las filas de {table_name} no son validas.')
        record_count += len(rows)
    if manifest is not None:
        try:
            expected_records = int(manifest.get('database_records', -1))
        except (TypeError, ValueError) as error:
            raise BackupExecutionError('El conteo de registros del manifiesto no es valido.') from error
        if expected_records != record_count:
            raise BackupExecutionError('El conteo de registros no coincide con el manifiesto.')
    table_definitions, rows_by_table, primary_keys, resolve = _snapshot_scope_resolver(
        schema_definition,
        database,
        organization_id,
    )
    seen_primary_keys = set()
    for table in database_tables:
        table_name = table.get('name')
        if table_name not in table_definitions:
            raise BackupExecutionError('El snapshot contiene una tabla no descrita en el esquema.')
        schema_columns = _schema_table_columns(table_definitions[table_name])
        database_columns = set(table.get('columns', []))
        if not database_columns <= schema_columns:
            raise BackupExecutionError(f'El snapshot contiene columnas no descritas en {table_name}.')
        rows = table.get('rows', [])
        for row in rows:
            if not isinstance(row, dict) or not set(row) <= database_columns:
                raise BackupExecutionError(f'El snapshot contiene una fila invalida en {table_name}.')
            if row and primary_keys.get(table_name):
                identity = _row_identity(table_name, row, primary_keys[table_name])
                if identity in seen_primary_keys:
                    raise BackupExecutionError(f'El respaldo contiene claves duplicadas en {table_name}.')
                seen_primary_keys.add(identity)
            resolve(table_name, row)
    if seen_tables != set(table_definitions):
        raise BackupExecutionError('El snapshot no contiene todas las tablas descritas en el esquema.')
    return table_definitions, rows_by_table, primary_keys


def table_scope_clause(table_name, columns_by_table, organization_id, alias='row_data', visited=None):
    columns = columns_by_table.get(table_name)
    if columns is None:
        raise BackupExecutionError(f'No se pudo describir la tabla {table_name}.')
    if 'organizacion_id' in columns:
        return f'{alias}.{connection.ops.quote_name("organizacion_id")} = %s', [organization_id]
    if table_name == 'organizaciones':
        return f'{alias}.{connection.ops.quote_name("id")} = %s', [organization_id]
    if table_name in GLOBAL_BACKUP_TABLES:
        return None, []

    visited = set(visited or ())
    if table_name in visited:
        raise BackupExecutionError(f'La regla de aislamiento de {table_name} contiene una referencia circular.')
    visited.add(table_name)
    relation_clauses = []
    presence_clauses = []
    params = []
    for index, (parent_table, local_column, parent_column) in enumerate(BACKUP_RELATIONS.get(table_name, ())):
        if local_column not in columns:
            continue
        parent_columns = columns_by_table.get(parent_table, set())
        if parent_column not in parent_columns:
            continue
        parent_alias = f'scope_{len(visited)}_{index}'
        parent_clause, parent_params = table_scope_clause(
            parent_table,
            columns_by_table,
            organization_id,
            alias=parent_alias,
            visited=visited,
        )
        if not parent_clause:
            continue
        relation_clauses.append(
            f'EXISTS (SELECT 1 FROM {qualified_table_name(parent_table)} AS {parent_alias} '
            f'WHERE {parent_alias}.{connection.ops.quote_name(parent_column)} = '
            f'{alias}.{connection.ops.quote_name(local_column)} AND ({parent_clause}))',
        )
        presence_clauses.append(f'{alias}.{connection.ops.quote_name(local_column)} IS NULL')
        params.extend(parent_params)
    if not relation_clauses:
        raise BackupExecutionError(
            f'No existe una regla de aislamiento para la tabla {table_name}; respaldo cancelado para evitar fuga de datos.',
        )
    all_relations_match = ' AND '.join(
        f'({presence} OR {relation})'
        for presence, relation in zip(presence_clauses, relation_clauses)
    )
    at_least_one_relation = ' OR '.join(
        presence.replace(' IS NULL', ' IS NOT NULL')
        for presence in presence_clauses
    )
    return f'({all_relations_match}) AND ({at_least_one_relation})', params


def database_table_rows(table_name, columns_by_table, organization_id):
    clause, params = table_scope_clause(table_name, columns_by_table, organization_id)
    sql = f'SELECT * FROM {qualified_table_name(table_name)} AS row_data'
    if clause:
        sql = f'{sql} WHERE {clause}'
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        columns = [item[0] for item in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    return columns, rows


def table_load_order(table_names, constraints):
    available = set(table_names)
    dependencies = {table_name: set() for table_name in table_names}
    for constraint in constraints:
        if constraint.get('constraint_type') != 'FOREIGN KEY':
            continue
        table_name = constraint.get('table_name')
        foreign_table = constraint.get('foreign_table_name')
        if table_name in available and foreign_table in available and foreign_table != table_name:
            dependencies[table_name].add(foreign_table)

    ordered = []
    remaining = set(available)
    while remaining:
        ready = sorted(table for table in remaining if not (dependencies[table] & remaining))
        if not ready:
            ready = sorted(remaining)
        ordered.extend(ready)
        remaining.difference_update(ready)
    return ordered


@contextmanager
def database_snapshot_transaction():
    with transaction.atomic():
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            metadata = {
                'isolation_level': 'REPEATABLE READ',
                'read_only': True,
                'captured_at': timezone.now().isoformat(),
            }
        else:
            metadata = {
                'isolation_level': 'DATABASE_DEFAULT',
                'read_only': False,
                'captured_at': timezone.now().isoformat(),
            }
        yield metadata


@contextmanager
def database_restore_transaction():
    with transaction.atomic():
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ WRITE')
            metadata = {
                'isolation_level': 'SERIALIZABLE',
                'read_only': False,
                'captured_at': timezone.now().isoformat(),
            }
        else:
            metadata = {
                'isolation_level': 'DATABASE_DEFAULT',
                'read_only': False,
                'captured_at': timezone.now().isoformat(),
            }
        yield metadata


def _build_database_snapshot(organization_id, snapshot_metadata):
    table_names = database_table_names()
    schema_definition, columns_by_table = database_schema_snapshot(table_names)
    sequences = database_sequence_snapshot()
    ordered_tables = table_load_order(table_names, schema_definition['constraints'])
    tables = []
    records = 0
    for table_name in ordered_tables:
        columns, rows = database_table_rows(table_name, columns_by_table, organization_id)
        records += len(rows)
        tables.append({'name': table_name, 'columns': columns, 'rows': rows})
    database = {
        'schema': BACKUP_SCHEMA,
        'organization_id': str(organization_id),
        'snapshot': snapshot_metadata,
        'table_load_order': ordered_tables,
        'sequences': sequences,
        'tables': tables,
    }
    return database, records, schema_definition, sequences


def build_reconstruction_plan(organization_id, database, schema_definition, sequences):
    return {
        'version': '1.0',
        'organization_id': str(organization_id),
        'source_files': {
            'schema': 'schema.json',
            'sequences': 'sequences.json',
            'database': 'database.json',
            'manifest': 'manifest.json',
            'documents': 'files/',
        },
        'snapshot': database.get('snapshot', {}),
        'table_load_order': database.get('table_load_order', []),
        'sequence_count': len(sequences),
        'schema_table_count': len(schema_definition.get('tables', [])),
        'steps': [
            {'order': 1, 'action': 'create_schema', 'detail': f'Crear el esquema {BACKUP_SCHEMA}.'},
            {'order': 2, 'action': 'create_sequences_and_tables', 'detail': 'Recrear secuencias y tablas usando schema.json.'},
            {'order': 3, 'action': 'load_rows', 'detail': 'Insertar o actualizar database.json siguiendo table_load_order y validando organization_id.'},
            {'order': 4, 'action': 'restore_constraints_indexes_views', 'detail': 'Aplicar constraints, indices, vistas, triggers, politicas y rutinas descritos en schema.json.'},
            {'order': 5, 'action': 'restore_sequences', 'detail': 'Avanzar las secuencias al menos hasta los valores de sequences.json despues de cargar las filas.'},
            {'order': 6, 'action': 'restore_files', 'detail': 'Copiar files/ a sus storage_key solo despues de verificar tamano y SHA-256.'},
            {'order': 7, 'action': 'validate', 'detail': 'Comparar conteos, organizacion_id, hashes y manifiesto antes de liberar el sistema.'},
        ],
    }


def reconstruction_document(plan):
    lines = [
        '# Procedimiento de reconstruccion',
        '',
        f"Organizacion: {plan['organization_id']}",
        f"Formato del plan: {plan['version']}",
        '',
        'Ejecutar todos los pasos en un entorno aislado y conservar una copia del respaldo original.',
        '',
    ]
    for step in plan['steps']:
        lines.append(f"{step['order']}. **{step['action']}**: {step['detail']}")
    lines.extend([
        '',
        'No cargar filas cuyo organization_id no coincida con el manifiesto. Las tablas relacionales sin esa columna deben filtrarse por sus claves foraneas documentadas.',
        'Mantener constraints e indices fuera de la carga inicial cuando existan dependencias circulares y validarlos al final.',
        'La restauracion en vivo usa upsert y no elimina filas creadas despues del respaldo; para una recuperacion destructiva se requiere un entorno aislado y un procedimiento aprobado.',
    ])
    return '\n'.join(lines) + '\n'


def build_database_snapshot(organization_id):
    with database_snapshot_transaction() as snapshot_metadata:
        database, records, _, _ = _build_database_snapshot(organization_id, snapshot_metadata)
    return database, records


def build_storage_snapshot(organization_id, archive):
    files = []
    missing = []
    queryset = ArchivoDocumento.objects.filter(documento__organizacion_id=organization_id).only(
        'id', 'documento_id', 'clave_almacenamiento', 'nombre_archivo_original', 'tamano_bytes', 'sha256', 'tipo_mime',
    )
    for item in queryset.iterator():
        archive_path = f'files/{item.id}/{PurePosixPath(item.nombre_archivo_original).name}'
        file_info = {
            'id': str(item.id),
            'document_id': str(item.documento_id),
            'storage_key': item.clave_almacenamiento,
            'archive_path': archive_path,
            'name': item.nombre_archivo_original,
            'size': item.tamano_bytes,
            'sha256': item.sha256,
            'mime_type': item.tipo_mime,
        }
        if not default_storage.exists(item.clave_almacenamiento):
            missing.append(file_info)
            continue
        with default_storage.open(item.clave_almacenamiento, 'rb') as source:
            content = source.read()
        if item.tamano_bytes is not None and len(content) != item.tamano_bytes:
            raise BackupExecutionError(f'El tamano no coincide para {item.nombre_archivo_original}.')
        if item.sha256 and hashlib.sha256(content).hexdigest() != item.sha256:
            raise BackupExecutionError(f'La suma de comprobacion no coincide para {item.nombre_archivo_original}.')
        archive.writestr(archive_path, content)
        files.append(file_info)
    return files, missing


def _archive_file_content(archive, item):
    if not isinstance(item, dict):
        raise BackupExecutionError('El manifiesto contiene un archivo invalido.')
    archive_path = item.get('archive_path', '')
    storage_key = item.get('storage_key', '')
    archive_parts = PurePosixPath(archive_path)
    storage_parts = PurePosixPath(storage_key)
    if (
        not archive_path.startswith('files/')
        or archive_parts.is_absolute()
        or '..' in archive_parts.parts
        or not storage_key
        or not storage_key.strip()
        or storage_parts.is_absolute()
        or '..' in storage_parts.parts
    ):
        raise BackupExecutionError('El respaldo contiene una ruta de archivo no valida.')
    try:
        content = archive.read(archive_path)
    except Exception as error:
        raise BackupExecutionError(f"El respaldo no contiene el archivo {item.get('name', 'indicado')}.") from error
    expected_size = item.get('size')
    if expected_size is not None and len(content) != expected_size:
        raise BackupExecutionError(f"El tamano no coincide para {item.get('name', 'archivo')}.")
    expected_sha256 = item.get('sha256')
    if not expected_sha256 or hashlib.sha256(content).hexdigest() != expected_sha256:
        raise BackupExecutionError(f"La suma de comprobacion no coincide para {item.get('name', 'archivo')}.")
    return storage_key, content


def verify_storage_snapshot(archive, manifest):
    files = manifest.get('files', [])
    if not isinstance(files, list):
        raise BackupExecutionError('Los archivos del manifiesto no son validos.')
    verified = 0
    for item in files:
        _archive_file_content(archive, item)
        verified += 1
    return {
        'files_verified': verified,
        'files_restored': 0,
        'files_replaced': 0,
        'files_skipped': 0,
    }


def restore_storage_snapshot(archive, manifest):
    files = manifest.get('files', [])
    if not isinstance(files, list):
        raise BackupExecutionError('Los archivos del manifiesto no son validos.')
    contents = [_archive_file_content(archive, item) for item in files]
    restored = 0
    replaced = 0
    skipped = 0
    for storage_key, content in contents:
        if default_storage.exists(storage_key):
            try:
                with default_storage.open(storage_key, 'rb') as source:
                    existing_content = source.read()
            except Exception as error:
                raise BackupExecutionError(f'No se pudo leer el archivo existente {storage_key}.') from error
            if existing_content == content:
                skipped += 1
                continue
            default_storage.delete(storage_key)
            was_replaced = True
            replaced += 1
        else:
            was_replaced = False
        stored_key = default_storage.save(storage_key, ContentFile(content))
        if stored_key != storage_key:
            default_storage.delete(stored_key)
            raise BackupExecutionError(f'El almacenamiento no pudo reemplazar exactamente {storage_key}.')
        if was_replaced:
            continue
        restored += 1
    return {
        'files_verified': restored + replaced + skipped,
        'files_restored': restored,
        'files_replaced': replaced,
        'files_skipped': skipped,
    }


def _validate_live_restore_schema(database, schema_definition):
    archive_table_names = {table.get('name') for table in database.get('tables', [])}
    live_table_names = set(database_table_names())
    missing_tables = archive_table_names - live_table_names
    if missing_tables:
        raise BackupExecutionError('El destino no contiene todas las tablas del respaldo.')
    live_schema, live_columns = database_schema_snapshot(sorted(live_table_names))
    archive_definitions = _schema_table_definitions(schema_definition)
    for table_name in archive_table_names:
        archive_columns = _schema_table_columns(archive_definitions[table_name])
        if not archive_columns <= live_columns.get(table_name, set()):
            raise BackupExecutionError(f'El destino no contiene todas las columnas de {table_name}.')
        table_rows = next(table.get('rows', []) for table in database.get('tables', []) if table.get('name') == table_name)
        if table_rows and not _primary_key_columns(live_schema.get('constraints', []), table_name):
            raise BackupExecutionError(f'La tabla {table_name} no tiene una clave primaria restaurable.')
    return live_schema, live_columns


def _upsert_database_table(table, schema_definition, live_schema, live_columns):
    table_name = table.get('name')
    rows = table.get('rows', [])
    if not rows:
        return 0
    table_definition = _schema_table_definitions(schema_definition)[table_name]
    archive_columns = list(table.get('columns', []))
    if not archive_columns:
        raise BackupExecutionError(f'La tabla {table_name} no contiene columnas restaurables.')
    if not set(archive_columns) <= live_columns.get(table_name, set()):
        raise BackupExecutionError(f'La tabla {table_name} contiene columnas que no existen en el destino.')
    primary_keys = _primary_key_columns(live_schema.get('constraints', []), table_name)
    if not primary_keys or not set(primary_keys) <= set(archive_columns):
        raise BackupExecutionError(f'La tabla {table_name} no tiene una clave primaria restaurable.')
    type_by_column = {
        column.get('column_name'): column.get('data_type')
        for column in table_definition.get('columns', [])
        if isinstance(column, dict)
    }
    quoted_table = qualified_table_name(table_name)
    quoted_columns = ', '.join(connection.ops.quote_name(column) for column in archive_columns)
    placeholders = ', '.join(['%s'] * len(archive_columns))
    conflict_columns = ', '.join(connection.ops.quote_name(column) for column in primary_keys)
    update_columns = [column for column in archive_columns if column not in primary_keys]
    if update_columns:
        updates = ', '.join(
            f'{connection.ops.quote_name(column)} = EXCLUDED.{connection.ops.quote_name(column)}'
            for column in update_columns
        )
        conflict_action = f'DO UPDATE SET {updates}'
    else:
        conflict_action = 'DO NOTHING'
    identity_columns = {
        column.get('column_name')
        for column in table_definition.get('columns', [])
        if isinstance(column, dict) and column.get('is_identity') == 'YES'
    }
    overriding = ' OVERRIDING SYSTEM VALUE' if identity_columns & set(archive_columns) else ''
    sql = (
        f'INSERT INTO {quoted_table} ({quoted_columns}){overriding} VALUES ({placeholders}) '
        f'ON CONFLICT ({conflict_columns}) {conflict_action}'
    )
    restored = 0
    with connection.cursor() as cursor:
        for row in rows:
            if not isinstance(row, dict) or not set(row) <= set(archive_columns):
                raise BackupExecutionError(f'La fila de {table_name} no coincide con su esquema.')
            if any(column not in row for column in primary_keys):
                raise BackupExecutionError(f'La fila de {table_name} no contiene su clave primaria completa.')
            values = [
                _restore_value(row[column], type_by_column.get(column))
                for column in archive_columns
            ]
            cursor.execute(sql, values)
            restored += 1
    return restored


def _qualified_sequence_name(sequence_name):
    return f'{connection.ops.quote_name(BACKUP_SCHEMA)}.{connection.ops.quote_name(sequence_name)}'


def _advance_database_sequences(sequences):
    if connection.vendor != 'postgresql':
        return 0
    live_sequences = {
        item.get('sequence_name')
        for item in database_sequence_snapshot()
    }
    advanced = 0
    for sequence in sequences:
        sequence_name = sequence.get('sequence_name')
        if sequence_name not in live_sequences:
            raise BackupExecutionError(f'La secuencia {sequence_name} no existe en el destino.')
        last_value = sequence.get('last_value')
        if last_value is None:
            continue
        try:
            backup_value = int(last_value)
        except (TypeError, ValueError) as error:
            raise BackupExecutionError(f'El valor de la secuencia {sequence_name} no es valido.') from error
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT last_value FROM {_qualified_sequence_name(sequence_name)}')
            current_value = cursor.fetchone()[0]
            if current_value is not None and int(current_value) >= backup_value:
                continue
            cursor.execute(
                'SELECT setval(%s::regclass, %s, true)',
                [f'{BACKUP_SCHEMA}.{sequence_name}', backup_value],
            )
        advanced += 1
    return advanced


def _restore_database_snapshot_in_transaction(database, schema_definition, sequences):
    live_schema, live_columns = _validate_live_restore_schema(database, schema_definition)
    archive_tables = {table.get('name') for table in database.get('tables', [])}
    constraints = live_schema.get('constraints') or schema_definition.get('constraints', [])
    ordered_tables = table_load_order(archive_tables, constraints)
    if 'organizaciones' in ordered_tables:
        ordered_tables.remove('organizaciones')
        ordered_tables.insert(0, 'organizaciones')
    table_map = {table.get('name'): table for table in database.get('tables', [])}
    restored_tables = []
    skipped_tables = []
    restored_rows = 0
    for table_name in ordered_tables:
        if table_name in GLOBAL_BACKUP_TABLES or table_name in BACKUP_OPERATIONAL_TABLES:
            skipped_tables.append(table_name)
            continue
        restored_rows += _upsert_database_table(
            table_map[table_name],
            schema_definition,
            live_schema,
            live_columns,
        )
        restored_tables.append(table_name)
    sequences_advanced = _advance_database_sequences(sequences)
    return {
        'database_strategy': 'upsert',
        'database_tables_restored': len(restored_tables),
        'database_rows_restored': restored_rows,
        'database_tables_skipped': skipped_tables,
        'sequences_advanced': sequences_advanced,
    }


def restore_database_snapshot(database, schema_definition, sequences, organization_id):
    validate_database_snapshot(database, schema_definition, organization_id)
    with database_restore_transaction():
        return _restore_database_snapshot_in_transaction(database, schema_definition, sequences)


def get_or_create_configuration(organization_id):
    config = ConfiguracionRespaldo.objects.filter(organizacion_id=organization_id).first()
    if config:
        return config
    now = timezone.now()
    return ConfiguracionRespaldo(
        id=uuid.uuid4(),
        organizacion_id=organization_id,
        activa=True,
        frecuencia='daily',
        retencion_dias=DEFAULT_RETENTION_DAYS,
        destino=configured_destination(),
        incluir_archivos=True,
        cifrar=True,
        proxima_ejecucion_en=now,
        actualizada_en=now,
    )


def build_backup_archive(organization_id, include_files=True):
    with database_snapshot_transaction() as snapshot_metadata:
        database, record_count, schema_definition, sequences = _build_database_snapshot(
            organization_id,
            snapshot_metadata,
        )
        archive_buffer = BytesIO()
        missing_files = []
        with ZipFile(archive_buffer, 'w', ZIP_DEFLATED) as archive:
            archive.writestr('database.json', json.dumps(database, default=json_default, ensure_ascii=True))
            archive.writestr('schema.json', json.dumps(schema_definition, default=json_default, ensure_ascii=True))
            archive.writestr('sequences.json', json.dumps(sequences, default=json_default, ensure_ascii=True))
            if include_files:
                files, missing_files = build_storage_snapshot(organization_id, archive)
            else:
                files = []
            reconstruction = build_reconstruction_plan(organization_id, database, schema_definition, sequences)
            archive.writestr(
                'reconstruction.json',
                json.dumps(reconstruction, default=json_default, ensure_ascii=True),
            )
            archive.writestr('RECONSTRUCCION.md', reconstruction_document(reconstruction))
            manifest = {
                'format': BACKUP_FORMAT,
                'created_at': timezone.now().isoformat(),
                'organization_id': str(organization_id),
                'database_records': record_count,
                'files': files,
                'missing_files': missing_files,
                'complete': not missing_files,
                'database': {
                    'schema': BACKUP_SCHEMA,
                    'tables': len(database['tables']),
                    'sequences': len(sequences),
                    'snapshot': snapshot_metadata,
                },
                'artifacts': {
                    'database': 'database.json',
                    'schema': 'schema.json',
                    'sequences': 'sequences.json',
                    'reconstruction': 'reconstruction.json',
                    'procedure': 'RECONSTRUCCION.md',
                },
            }
            archive.writestr('manifest.json', json.dumps(manifest, default=json_default, ensure_ascii=True))
    return encrypt_archive(archive_buffer.getvalue()), {
        'records': record_count,
        'files': len(files),
        'missing_files': len(missing_files),
        'complete': not missing_files,
        'schema_tables': len(database['tables']),
        'sequences': len(sequences),
    }


def purge_expired_backups(organization_id):
    now = timezone.now()
    expired = Respaldo.objects.filter(
        organizacion_id=organization_id,
        estado='exitoso',
        retencion_hasta__lt=now,
    )
    for backup in expired.iterator():
        try:
            if backup.clave_almacenamiento:
                default_storage.delete(backup.clave_almacenamiento)
            backup.delete()
        except Exception:
            logger.warning('No fue posible eliminar un respaldo expirado id=%s', backup.id, exc_info=True)


def next_execution(frequency, value=None):
    current = value or timezone.now()
    if frequency == 'weekly':
        return current + timedelta(days=7)
    if frequency == 'monthly':
        return current + timedelta(days=30)
    return current + timedelta(days=1)


def create_backup(organization_id, user_id=None, backup_type='manual', config=None):
    config = config or get_or_create_configuration(organization_id)
    started = timezone.now()
    backup = Respaldo.objects.create(
        organizacion_id=organization_id,
        creado_por_id=user_id,
        tipo=backup_type,
        destino=config.destino,
        nombre=f'Respaldo {backup_type} - {started:%Y-%m-%d %H:%M}',
        estado='en_proceso',
        iniciado_en=started,
        retencion_hasta=started + timedelta(days=config.retencion_dias),
        cifrado=True,
    )
    try:
        payload, stats = build_backup_archive(organization_id, config.incluir_archivos)
        key = f"respaldos/{organization_id}/{started:%Y/%m/%d}/{backup.id}.sdbk"
        stored_key = default_storage.save(key, ContentFile(payload))
        backup.clave_almacenamiento = stored_key
        backup.tamano_bytes = len(payload)
        backup.sha256 = hashlib.sha256(payload).hexdigest()
        backup.archivos = stats['files']
        backup.registros_db = stats['records']
        backup.estado = 'exitoso'
        backup.finalizado_en = timezone.now()
        backup.save(update_fields=[
            'clave_almacenamiento', 'tamano_bytes', 'sha256', 'archivos', 'registros_db',
            'estado', 'finalizado_en',
        ])
        if config.pk and not config._state.adding:
            config.ultima_ejecucion_en = backup.finalizado_en
            config.proxima_ejecucion_en = next_execution(config.frecuencia, backup.finalizado_en)
            config.actualizada_en = backup.finalizado_en
            config.save(update_fields=['ultima_ejecucion_en', 'proxima_ejecucion_en', 'actualizada_en'])
        purge_expired_backups(organization_id)
        return backup, stats
    except Exception as error:
        backup.estado = 'fallido'
        backup.error = str(error)[:2000]
        backup.finalizado_en = timezone.now()
        backup.save(update_fields=['estado', 'error', 'finalizado_en'])
        logger.exception('RESPALDO_FALLIDO organizacion=%s respaldo=%s', organization_id, backup.id)
        raise BackupExecutionError('El respaldo no pudo completarse.', backup=backup) from error


def load_backup_archive(backup):
    if not backup.clave_almacenamiento:
        raise BackupExecutionError('El respaldo no tiene un archivo almacenado.')
    with default_storage.open(backup.clave_almacenamiento, 'rb') as source:
        payload = source.read()
    if backup.sha256 and hashlib.sha256(payload).hexdigest() != backup.sha256:
        raise BackupExecutionError('La suma de comprobacion del respaldo no coincide.')
    archive_bytes = decrypt_archive(payload)
    archive = ZipFile(BytesIO(archive_bytes))
    try:
        manifest = json.loads(archive.read('manifest.json'))
        if not isinstance(manifest, dict):
            raise BackupExecutionError('El manifiesto del respaldo no es valido.')
        if not isinstance(manifest.get('files', []), list) or not isinstance(manifest.get('missing_files', []), list):
            raise BackupExecutionError('Los archivos del manifiesto no son validos.')
        backup_organization_id = getattr(backup, 'organizacion_id', None)
        if backup_organization_id is not None and str(manifest.get('organization_id')) != str(backup_organization_id):
            raise BackupExecutionError('La organizacion del respaldo no coincide con el registro almacenado.')
        if manifest.get('format') == BACKUP_FORMAT:
            if manifest.get('complete') and manifest.get('missing_files'):
                raise BackupExecutionError('El manifiesto marca el respaldo como completo aunque faltan archivos.')
            required_artifacts = {
                'database.json',
                'schema.json',
                'sequences.json',
                'reconstruction.json',
                'RECONSTRUCCION.md',
            }
            missing_artifacts = required_artifacts.difference(archive.namelist())
            if missing_artifacts:
                raise BackupExecutionError('El respaldo no contiene todos los artefactos de reconstruccion.')
            database = json.loads(archive.read('database.json'))
            schema_definition = json.loads(archive.read('schema.json'))
            sequences = json.loads(archive.read('sequences.json'))
            reconstruction = json.loads(archive.read('reconstruction.json'))
            if str(database.get('organization_id')) != str(manifest.get('organization_id')):
                raise BackupExecutionError('La organizacion del snapshot no coincide con el manifiesto.')
            if str(reconstruction.get('organization_id')) != str(manifest.get('organization_id')):
                raise BackupExecutionError('La organizacion del procedimiento no coincide con el manifiesto.')
            if schema_definition.get('name') != BACKUP_SCHEMA:
                raise BackupExecutionError('El esquema del respaldo no es valido.')
            if not isinstance(sequences, list):
                raise BackupExecutionError('Las secuencias del respaldo no son validas.')
    except Exception as error:
        archive.close()
        if isinstance(error, BackupExecutionError):
            raise
        raise BackupExecutionError('El manifiesto del respaldo no es valido.') from error
    return archive, manifest


def _read_v2_artifacts(archive, manifest):
    if manifest.get('format') != BACKUP_FORMAT:
        return None
    try:
        return (
            json.loads(archive.read('database.json')),
            json.loads(archive.read('schema.json')),
            json.loads(archive.read('sequences.json')),
            json.loads(archive.read('reconstruction.json')),
        )
    except Exception as error:
        raise BackupExecutionError('Los artefactos de reconstruccion no son validos.') from error


def verify_backup(backup, restore_files=False, restore_database=False):
    archive, manifest = load_backup_archive(backup)
    try:
        artifacts = _read_v2_artifacts(archive, manifest)
        database_stats = {}
        if artifacts:
            database, schema_definition, sequences, _ = artifacts
            validate_database_snapshot(database, schema_definition, manifest.get('organization_id'), manifest)
        elif restore_database:
            raise BackupExecutionError('La restauracion de registros requiere un respaldo v2.')
        if restore_database:
            with database_restore_transaction():
                database_stats = _restore_database_snapshot_in_transaction(
                    database,
                    schema_definition,
                    sequences,
                )
                file_stats = restore_storage_snapshot(archive, manifest) if restore_files else verify_storage_snapshot(
                    archive,
                    manifest,
                )
        elif restore_files:
            file_stats = restore_storage_snapshot(archive, manifest)
        else:
            file_stats = verify_storage_snapshot(archive, manifest)
        if restore_files or restore_database:
            backup.restaurado_en = timezone.now()
            backup.save(update_fields=['restaurado_en'])
        mode = 'restore' if restore_database else 'restore_files' if restore_files else 'verify'
        return {
            'valid': True,
            'mode': mode,
            'database_records': manifest.get('database_records', 0),
            **database_stats,
            **file_stats,
            'missing_files': len(manifest.get('missing_files', [])),
            'complete': bool(manifest.get('complete', not manifest.get('missing_files'))),
        }
    finally:
        archive.close()


def restore_backup(backup):
    return verify_backup(backup, restore_files=True, restore_database=True)
