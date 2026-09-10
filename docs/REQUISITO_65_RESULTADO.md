# Requisito 65 — únicamente mode=verify

Resultado: **HTTP 200**, `valid=true`, `complete=true` al verificar la copia nueva #63 complementada con los archivos en #64. Se validaron formato, manifiesto, SHA-256, BD, archivos y completitud. No se ejecutó restauración.

## Corrección

- El validador de relaciones respetó la semántica PostgreSQL `MATCH SIMPLE`: una FK compuesta con algún componente nulo no exige referencia. Antes rechazaba `usuarios.area_id=NULL` junto con `organizacion_id` informado. MCP de Neon confirmó esa definición real. `MATCH FULL` sigue rechazando una clave parcialmente nula y las claves no nulas siguen requiriendo una referencia existente.
- `mode=verify` tiene una ruta de solo lectura que exige SHA-256 del registro, descifrado correcto, formato v2 y ZIP íntegro sin entradas duplicadas. Normaliza fallos de apertura, ZIP, JSON y estructura como errores de validación HTTP 422.
- Comprueba artefactos y organizaciones, tablas, columnas, filas, campos obligatorios, PK, FK, aislamiento por organización, conteos y coherencia de secuencias. La validación se realiza sobre los datos del archivo, sin ejecutar SQL de reconstrucción.
- Coteja el inventario documental con las versiones de `database.json`, detecta versiones omitidas/duplicadas/ajenas, rutas y metadatos contradictorios, comprueba tamaño/hash de cada binario y exige completitud real. Un parcial nunca devuelve `valid=true`.
- La verificación puede diagnosticar una copia marcada fallida. La restricción de estado exitoso se conserva para los modos de restauración. No se ejecutaron esos modos.

Archivos de implementación: `documentos/backup_verification.py`, despacho de verify y corrección de FK en `documentos/backup_service.py`, condición de modo en `documentos/backup_views.py`. No se cambiaron creación, archivos documentales, retención ni programación en este requisito.

## Prueba HTTP y estructura

Petición local: `POST /api/backups/20d99ed6-f98f-433a-ade6-1d4bcff03dbd/restore/` con `{"mode":"verify"}`.

Copia comprobada: `media/req64-controlado/20d99ed6-f98f-433a-ade6-1d4bcff03dbd-archivos.sdbk`.

SHA-256: `e41f0d3ab0358fc693a934497999f54dd73f764f2112a9a85a6face2bcbb56c0`.

Respuesta HTTP 200 con estructura `backup` y `result`. Campos principales de `result`:

```json
{
  "valid": true,
  "mode": "verify",
  "format": "sistema-documental-backup-v2",
  "scope": "database_and_document_files",
  "hash_verified": true,
  "manifest_verified": true,
  "database_verified": true,
  "database_records": 777,
  "database_tables": 43,
  "sequences_verified": 10,
  "files_verified": 3,
  "files_expected": 3,
  "files_restored": 0,
  "files_replaced": 0,
  "files_skipped": 0,
  "missing_files": 0,
  "document_files_complete": true,
  "complete": true
}
```

Los **18 casos negativos** devolvieron HTTP **422**, con `{"valid":false,"detail":"..."}` y motivo: hash externo, cabecera, ZIP, JSON, formato, artefacto de esquema, conteo BD, organización, FK, archivo físico, hash documental, tamaño, inventario omitido, completitud de tipo inválido, copia parcial, parcial marcado fallido, original sin cobertura documental declarada y respaldo inaccesible. Ningún caso devolvió HTTP 500. Las alteraciones se hicieron en memoria, sin modificar las copias conservadas.

Pasaron **42 comprobaciones en 19 casos HTTP** y **27 pruebas unitarias/regresiones**. Incluyen `MATCH SIMPLE`, `MATCH FULL`, FK ausente, alcance solo BD explícito y guardas contra escrituras/restauración. `git diff --check` sin errores en los archivos de código modificados.

## Alcance de la evidencia

Ensayo desde el backend local mediante Django APIClient y administrador `force_authenticate`, conectado a Neon. Como #64 produjo una copia complementaria local sin crear otro registro del sistema, la búsqueda del registro se redirigió **solo en memoria** a esa copia y su hash/tamaño. Se ejercitó la vista real y el validador real; esos metadatos no se persistieron. La auditoría del ensayo se revirtió en una transacción. No acredita despliegue, login, UI ni acceso a storage desde Render.

MCP confirmó que el registro original #63 continúa intacto: SHA-256 `5e3a7e6fdf369202ccb5e60d6e58b0a8c00e9600e01b9c545ef70a8a99f94368`, 63.455 bytes, cero archivos, 777 registros y `restaurado_en=NULL`. Los archivos originales y complementarios conservan sus hashes.

El original #63, creado antes de declarar alcance explícito y sin archivos, devuelve 422 por inventario documental incompleto; no se lo presenta como una copia integral válida. Los nuevos respaldos con `scope=database_only` pueden validar su alcance de BD y devuelven `document_files_complete=false`. Formatos antiguos sin artefactos suficientes para comprobar BD, como v1, se rechazan con 422 en esta validación; no se usaron respaldos históricos como prueba.

No se escribieron filas de negocio, archivos ni fechas de restauración. Validación correcta no certifica recuperación: no se restauró en producción ni en otro destino. Cambios locales pendientes de commit y despliegue.

Evidencia: `docs/resultado_validacion_respaldo_65.json`. Procedimiento: `docs/verificar_validacion_respaldo_65.py`. Regresiones: `documentos/test_backup_verification.py` y pruebas seleccionadas existentes.
