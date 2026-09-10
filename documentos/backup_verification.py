"""Strict backup verification; never writes rows, storage, or restore timestamps."""
import re
from zipfile import BadZipFile

from . import backup_service as service


def require(condition, message):
    if not condition:
        raise service.BackupExecutionError(message)


def verify_read_only(backup):
    archive = None
    try:
        require(isinstance(backup.sha256, str) and re.fullmatch(r'[0-9a-f]{64}', backup.sha256),
                'El registro del respaldo no contiene un SHA-256 valido.')
        try:
            archive, manifest = service.load_backup_archive(backup)
        except service.BackupExecutionError:
            raise
        except Exception as error:
            # Storage adapters expose different I/O exceptions. Keep these at
            # the verify boundary, without disclosing credentials or URLs.
            raise service.BackupExecutionError('No se pudo abrir el respaldo o su formato de archivo no es valido.') from error
        require(manifest.get('format') == service.BACKUP_FORMAT,
                'El formato no permite verificar BD y archivos; se requiere un respaldo v2.')
        names = archive.namelist()
        require(len(names) == len(set(names)) and archive.testzip() is None,
                'El ZIP contiene entradas duplicadas o danadas.')
        require(type(manifest.get('complete')) is bool, 'La completitud del manifiesto no es valida.')
        require(type(manifest.get('database_records')) is int and manifest['database_records'] >= 0,
                'El conteo de registros del manifiesto no es valido.')
        database, schema, sequences, reconstruction = service._read_v2_artifacts(archive, manifest)
        require(all(isinstance(value, dict) for value in (database, schema, reconstruction)),
                'Los artefactos de BD no son validos.')
        require(isinstance(schema.get('tables'), list) and isinstance(database.get('tables'), list),
                'El inventario de tablas no es valido.')
        metadata = manifest.get('database')
        require(isinstance(metadata, dict), 'Faltan los metadatos de BD del manifiesto.')
        require(metadata.get('schema') == service.BACKUP_SCHEMA and
                type(metadata.get('tables')) is int and metadata['tables'] == len(database['tables']) and
                type(metadata.get('sequences')) is int and metadata['sequences'] == len(sequences),
                'Los conteos o esquema de BD no coinciden con el manifiesto.')
        require(database.get('sequences') == sequences, 'Las secuencias no coinciden con el snapshot.')
        table_columns = {table['name']: {col['column_name'] for col in table['columns']} for table in schema['tables']}
        require(len(table_columns) == len(schema['tables']), 'El esquema contiene tablas duplicadas.')
        for table in database['tables']:
            columns = table.get('columns')
            require(isinstance(columns, list) and len(columns) == len(set(columns)) and
                    set(columns) == table_columns.get(table.get('name')), 'Las columnas del snapshot no coinciden con el esquema.')
            require(isinstance(table.get('rows'), list) and all(isinstance(row, dict) and set(row) == set(columns) for row in table['rows']),
                    'El snapshot contiene filas con columnas ausentes o invalidas.')
            definition = next(item for item in schema['tables'] if item['name'] == table['name'])
            required_columns = [col['column_name'] for col in definition['columns'] if col.get('is_nullable') == 'NO']
            require(all(row[column] is not None for row in table['rows'] for column in required_columns),
                    'El snapshot contiene un valor nulo en una columna obligatoria.')
        service.validate_database_snapshot(database, schema, manifest['organization_id'], manifest)

        scope = manifest.get('scope', 'database_and_document_files')
        require(scope in ('database_only', 'database_and_document_files'), 'El alcance del respaldo no es valido.')
        requested = scope == 'database_and_document_files'
        require('document_files_requested' not in manifest or manifest['document_files_requested'] is requested,
                'El alcance documental contradice el manifiesto.')
        expected = {item['id']: item for item in service.backup_file_inventory(manifest['organization_id'], database)}
        included, missing = manifest.get('files'), manifest.get('missing_files')
        require(isinstance(included, list) and isinstance(missing, list) and
                all(isinstance(item, dict) for item in included + missing), 'El inventario de archivos no es valido.')
        seen = set()
        paths = set()
        for item in included + missing:
            version_id = item.get('id')
            require(version_id in expected and version_id not in seen, 'El inventario contiene versiones duplicadas o ajenas al snapshot.')
            seen.add(version_id)
            expected_item = expected[version_id]
            for field in ('document_id', 'storage_key', 'archive_path', 'name', 'size', 'sha256'):
                require(item.get(field) == expected_item[field], 'Los metadatos del archivo no coinciden con la version de BD.')
            if 'version' in item:
                require(item['version'] == expected_item['version'], 'El numero de version del archivo no coincide.')
            if 'is_current' in item:
                require(item['is_current'] is expected_item['is_current'], 'La vigencia del archivo no coincide.')
        for item in included:
            require(item['archive_path'] not in paths, 'El inventario contiene rutas de archivo duplicadas.')
            paths.add(item['archive_path'])
        require({name for name in names if name.startswith('files/')} == paths,
                'Los archivos fisicos no coinciden con el inventario.')
        if requested:
            require(seen == set(expected), 'Faltan versiones requeridas en el inventario del respaldo.')
        else:
            require(not included and not missing, 'Un respaldo solo BD contiene un inventario documental contradictorio.')
        files_complete = requested and not missing and seen == set(expected)
        require('document_files_complete' not in manifest or manifest['document_files_complete'] is files_complete,
                'La completitud documental contradice el inventario.')
        require(manifest['complete'] and not missing, 'El respaldo esta incompleto; faltan objetos requeridos.')
        file_stats = service.verify_storage_snapshot(archive, manifest)
        return {
            'valid': True, 'mode': 'verify', 'format': manifest['format'], 'scope': scope,
            'hash_verified': True, 'manifest_verified': True, 'database_verified': True,
            'database_records': manifest['database_records'], 'database_tables': len(database['tables']),
            'sequences_verified': len(sequences), **file_stats,
            'files_expected': len(expected), 'missing_files': 0,
            'document_files_complete': files_complete, 'complete': True,
        }
    except service.BackupExecutionError:
        raise
    except (OSError, BadZipFile, ValueError, TypeError, KeyError, AttributeError, IndexError) as error:
        raise service.BackupExecutionError('No se pudo validar el respaldo: archivo ausente, danado o estructura invalida.') from error
    finally:
        if archive is not None:
            archive.close()
