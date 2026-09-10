"""HTTP verify only, using #64's derivative of the new #63 backup.

Neon reads and rollback-only audit events; no restore or persisted backup edits.
"""
import copy
import hashlib
import json
import os
import sys
from contextlib import ExitStack
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.db import transaction
from django.test import override_settings
from rest_framework.test import APIClient
from documentos import backup_service as service, backup_views as views
from documentos.models import Respaldo, UsuarioDocumental

evidence64 = json.loads((ROOT / 'docs/resultado_archivos_respaldo_64.json').read_text(encoding='utf-8'))
evidence63 = json.loads((ROOT / 'docs/resultado_respaldo_nuevo_63.json').read_text(encoding='utf-8'))
path = Path(evidence64['derivative_path'])
payload = path.read_bytes()
assert hashlib.sha256(payload).hexdigest() == evidence64['sha256']
key = (ROOT / 'media/req63-controlado/.encryption-key').read_text().strip()
original = Respaldo.objects.get(pk=evidence64['source_backup_id'])
before = (original.sha256, original.tamano_bytes, original.archivos, original.estado, original.restaurado_en)
admin = UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
backup = copy.copy(original)
backup.sha256 = evidence64['sha256']
backup.tamano_bytes = len(payload)
backup.archivos = 3
backup.clave_almacenamiento = path.name
client = APIClient()
client.force_authenticate(user=admin)
checks = []
def check(name, value):
    assert value, name
    checks.append(name)

class ReadOnlyStorage:
    content = payload
    fail = False
    def open(self, name, mode='rb'):
        assert mode == 'rb'
        if self.fail:
            raise FileNotFoundError(name)
        return BytesIO(self.content)
    def save(self, *args, **kwargs):
        raise AssertionError('Escritura storage prohibida')
    delete = save

storage = ReadOnlyStorage()
cases = []
with override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False, BACKUP_ENCRYPTION_KEY=key), \
    transaction.atomic(), ExitStack() as stack:
    stack.enter_context(patch.object(service, 'default_storage', storage))
    stack.enter_context(patch.object(views, 'get_backup_or_404', return_value=backup))
    stack.enter_context(patch.object(backup, 'save', side_effect=AssertionError('Guardar respaldo prohibido')))
    for name in ('restore_backup', 'restore_storage_snapshot', 'restore_database_snapshot',
                 '_restore_database_snapshot_in_transaction', 'database_restore_transaction'):
        stack.enter_context(patch.object(service, name, side_effect=AssertionError('Restauración prohibida')))
    stack.enter_context(patch.object(views, 'restore_backup', side_effect=AssertionError('Restauración prohibida')))
    with ZipFile(BytesIO(service.decrypt_archive(payload))) as source:
        entries = {name: source.read(name) for name in source.namelist()}

    def repack(change):
        items = dict(entries)
        change(items)
        buffer = BytesIO()
        with ZipFile(buffer, 'w', ZIP_DEFLATED) as archive:
            for name, content in items.items():
                archive.writestr(name, content)
        return service.encrypt_archive(buffer.getvalue())

    def json_change(name, mutate):
        def apply(items):
            value = json.loads(items[name])
            mutate(value)
            items[name] = json.dumps(value).encode()
        return apply

    def call(name, content, expected, wrong_hash=False):
        storage.content = content
        backup.sha256 = '0' * 64 if wrong_hash else hashlib.sha256(content).hexdigest()
        response = client.post(f'/api/backups/{backup.id}/restore/', {'mode': 'verify'}, format='json')
        body = response.json()
        check(name + ' HTTP ' + str(expected), response.status_code == expected)
        if expected == 422:
            check(name + ' valid=false', body.get('valid') is False and bool(body.get('detail')))
        cases.append({'case': name, 'http': response.status_code, 'body': body.get('result', body)})
        return body

    result = call('Copia nueva #63 con archivos incorporados en #64', payload, 200)['result']
    check('Validación completa de formato/manifiesto/hash/BD', all(result[k] for k in ('valid','hash_verified','manifest_verified','database_verified','complete')))
    check('43 tablas, 777 registros y 3 archivos', result['database_tables'] == 43 and result['database_records'] == 777 and result['files_verified'] == result['files_expected'] == 3)
    check('Ninguna restauración', result['mode'] == 'verify' and result['files_restored'] == result['files_replaced'] == 0 and backup.restaurado_en is None)
    call('Hash externo incorrecto', payload, 422, wrong_hash=True)
    call('Cabecera inválida', b'not-a-backup', 422)
    call('ZIP descifrado inválido', service.encrypt_archive(b'not-a-zip'), 422)
    call('Manifiesto JSON inválido', repack(lambda items: items.__setitem__('manifest.json', b'{')), 422)
    call('Formato desconocido', repack(json_change('manifest.json', lambda value: value.update(format='unknown'))), 422)
    call('Artefacto schema ausente', repack(lambda items: items.pop('schema.json')), 422)
    call('Conteo BD incorrecto', repack(json_change('manifest.json', lambda value: value.update(database_records=1))), 422)
    def cross_tenant(value):
        next(t for t in value['tables'] if t['name'] == 'usuarios')['rows'][0]['organizacion_id'] = '00000000-0000-0000-0000-000000000001'
    call('Fila de otra organización', repack(json_change('database.json', cross_tenant)), 422)
    def absent_fk(value):
        next(t for t in value['tables'] if t['name'] == 'versiones_documento')['rows'][0]['documento_id'] = '00000000-0000-0000-0000-000000000001'
    call('Referencia FK ausente', repack(json_change('database.json', absent_fk)), 422)
    file_path = next(name for name in entries if name.startswith('files/'))
    call('Archivo físico ausente', repack(lambda items: items.pop(file_path)), 422)
    call('Hash documental incorrecto', repack(lambda items: items.__setitem__(file_path, b'x' * len(items[file_path]))), 422)
    call('Tamaño documental incorrecto', repack(lambda items: items.__setitem__(file_path, b'x')), 422)
    call('Inventario omite una versión requerida', repack(json_change('manifest.json', lambda value: value['files'].pop())), 422)
    call('Completitud no booleana', repack(json_change('manifest.json', lambda value: value.update(complete='true'))), 422)
    call('Copia parcial simulada del paso64', Path(evidence64['simulated_missing']['path']).read_bytes(), 422)
    backup.estado = 'fallido'
    call('Verify diagnostica copia parcial registrada fallida', Path(evidence64['simulated_missing']['path']).read_bytes(), 422)
    backup.estado = original.estado
    call('Original solo BD sin cobertura documental declarada', Path(evidence63['physical_path']).read_bytes(), 422)
    storage.fail = True
    call('Archivo respaldo inaccesible', payload, 422)
    storage.fail = False
    transaction.set_rollback(True)

original.refresh_from_db()
check('Registro Neon intacto y sin restaurado_en', before == (original.sha256, original.tamano_bytes, original.archivos, original.estado, original.restaurado_en))
check('Archivo cifrado nuevo intacto', hashlib.sha256(path.read_bytes()).hexdigest() == evidence64['sha256'])
evidence = {'source_backup_id': str(original.id), 'verified_path': str(path), 'sha256': evidence64['sha256'],
    'successful_result': result, 'cases': cases, 'checks': checks, 'passed': len(checks),
    'restore_executed': False, 'business_data_changed': False,
    'environment': 'Backend local, APIClient administrador force_authenticate; lookup del registro redirigido en memoria a copia complementaria #64, hash/tamaño no persistidos. Auditoría revertida en transacción Neon.'}
(ROOT / 'docs/resultado_validacion_respaldo_65.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
print(json.dumps({'http_success': 200, 'http_invalid': 422, 'cases': len(cases), 'passed': len(checks), 'result': result, 'restore_executed': False}))
