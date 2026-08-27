import base64
import binascii
import hashlib
import json
import logging
import secrets
import uuid
from datetime import timedelta
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection
from django.utils import timezone

from .models import ArchivoDocumento, ConfiguracionRespaldo, Respaldo


logger = logging.getLogger(__name__)
BACKUP_MAGIC = b'SDBK1'
DEFAULT_RETENTION_DAYS = 30
SUPPORTED_FREQUENCIES = {'daily', 'weekly', 'monthly'}
SUPPORTED_DESTINATIONS = {'s3', 'filesystem'}


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
                WHERE table_schema = 'gestion_documental'
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
            )
            return [row[0] for row in cursor.fetchall()]
    return connection.introspection.table_names()


def build_database_snapshot(organization_id):
    tables = []
    records = 0
    for table_name in database_table_names():
        quoted_table = connection.ops.quote_name(table_name)
        if connection.vendor == 'postgresql':
            quoted_table = f'gestion_documental.{quoted_table}'
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT * FROM {quoted_table}')
            columns = [item[0] for item in cursor.description]
            raw_rows = cursor.fetchall()
        rows = []
        for raw_row in raw_rows:
            row = dict(zip(columns, raw_row))
            if 'organizacion_id' in row and str(row['organizacion_id']) != str(organization_id):
                continue
            rows.append(row)
        records += len(rows)
        tables.append({'name': table_name, 'columns': columns, 'rows': rows})
    return {'schema': 'gestion_documental', 'organization_id': str(organization_id), 'tables': tables}, records


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
            archive.writestr(archive_path, source.read())
        files.append(file_info)
    return files, missing


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
    database, record_count = build_database_snapshot(organization_id)
    archive_buffer = BytesIO()
    missing_files = []
    with ZipFile(archive_buffer, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('database.json', json.dumps(database, default=json_default, ensure_ascii=True))
        if include_files:
            files, missing_files = build_storage_snapshot(organization_id, archive)
        else:
            files = []
        manifest = {
            'format': 'sistema-documental-backup-v1',
            'created_at': timezone.now().isoformat(),
            'organization_id': str(organization_id),
            'database_records': record_count,
            'files': files,
            'missing_files': missing_files,
        }
        archive.writestr('manifest.json', json.dumps(manifest, default=json_default, ensure_ascii=True))
    return encrypt_archive(archive_buffer.getvalue()), {
        'records': record_count,
        'files': len(files),
        'missing_files': len(missing_files),
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
    except Exception as error:
        archive.close()
        raise BackupExecutionError('El manifiesto del respaldo no es valido.') from error
    return archive, manifest


def verify_backup(backup, restore_files=False):
    archive, manifest = load_backup_archive(backup)
    try:
        restored_files = 0
        skipped_files = 0
        for item in manifest.get('files', []):
            archive_path = item.get('archive_path', '')
            storage_key = item.get('storage_key', '')
            if not archive_path or not storage_key or not storage_key.strip() or '..' in PurePosixPath(storage_key).parts:
                raise BackupExecutionError('El respaldo contiene una ruta de archivo no valida.')
            content = archive.read(archive_path)
            if hashlib.sha256(content).hexdigest() != item.get('sha256'):
                raise BackupExecutionError(f"La suma de comprobacion no coincide para {item.get('name', 'archivo')}.")
            if restore_files:
                if default_storage.exists(storage_key):
                    skipped_files += 1
                else:
                    default_storage.save(storage_key, ContentFile(content))
                    restored_files += 1
        backup.restaurado_en = timezone.now()
        backup.save(update_fields=['restaurado_en'])
        return {
            'valid': True,
            'mode': 'restore_files' if restore_files else 'verify',
            'database_records': manifest.get('database_records', 0),
            'files_verified': len(manifest.get('files', [])),
            'files_restored': restored_files,
            'files_skipped': skipped_files,
            'missing_files': len(manifest.get('missing_files', [])),
        }
    finally:
        archive.close()
