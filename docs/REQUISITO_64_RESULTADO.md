# Requisito 64 — archivos del respaldo nuevo

Resultado: **3 versiones esperadas, 3 archivos incluidos y 0 faltantes reales**. Tamaños y SHA-256 coinciden entre los metadatos del snapshot #63, los bytes leídos de B2 y los bytes físicos del ZIP descifrado. No se ejecutó restauración.

## Fuente y alcance

Se utilizó exclusivamente el respaldo nuevo del paso anterior: `20d99ed6-f98f-433a-ade6-1d4bcff03dbd`, SHA-256 `5e3a7e6fdf369202ccb5e60d6e58b0a8c00e9600e01b9c545ef70a8a99f94368`.

Esa copia era solo BD: su manifiesto tenía cero archivos. El cotejo detectó que los tres binarios referenciados por `versiones_documento` no estaban dentro del ZIP. Por tanto, el `complete=true` del ensayo #63 no acredita cobertura documental. No se alteró el archivo fuente ni se cambió su hash.

Se creó una copia complementaria cifrada a partir del **mismo snapshot**, incorporando los tres objetos documentales desde B2. `database.json` es idéntico byte por byte al original. Los registros esperados y sus metadatos también se cotejaron mediante MCP de Neon. No se tomó un snapshot de BD nuevo ni se escribieron registros en Neon.

## Inventario comprobado

| Documento / archivo | Versión | Vigente | Bytes | SHA-256 |
|---|---|---|---:|---|
| PRUEBA-001 / PRUEBA_POLITICA_V2.pdf | 2.0 | Sí | 142 | `554f5147984d75fe7e43c6f15d08e3d52097907a122299c06613e84b3b4c8749` |
| PRUEBA-001 / PRUEBA_POLITICA_V1.pdf | 1.0 | No | 792 | `5a354f582b4636f0434b0d44b230a171ba2aa5c0bfe278fb48dc7951e1be4faa` |
| PRUEBA_PROCEDIMIENTO.pdf | 1.0 | Sí | 755 | `6ec166baeb26a705d8547db2487af1b85d1b01d944c997d7b0dc144b2fcdb3ad` |

Total documental sin comprimir: **1.689 bytes**. Todos los objetos se encontraron bajo `documentos/` en B2. El inventario JSON conserva ID de versión, ID de documento, número, vigencia, clave de storage, ruta dentro del ZIP, nombre, tamaño, MIME y hash.

Copia complementaria: `media/req64-controlado/20d99ed6-f98f-433a-ade6-1d4bcff03dbd-archivos.sdbk`.

- Tamaño físico cifrado: **65.535 bytes**.
- SHA-256: `e41f0d3ab0358fc693a934497999f54dd73f764f2112a9a85a6face2bcbb56c0`.
- `scope=database_and_document_files`, `document_files_requested=true`, `document_files_complete=true`, `complete=true`, `missing_files=[]`.
- ZIP íntegro, inventario completo y ningún binario extra fuera de él.

Conserva la clave del ensayo #63 ubicada en `media/req63-controlado/.encryption-key`. Los archivos cifrados y la clave permanecen fuera de Git. La copia complementaria es un artefacto local de validación; no se registró como otro backup del sistema ni se publicó en Render.

## Corrección limitada a archivos y creación

`documentos/backup_service.py` ahora construye el inventario desde las versiones del propio snapshot, incluyendo anteriores no vigentes. Para cada objeto compara tamaño/hash esperados y escribe el tamaño/hash físico en el manifiesto. Detecta claves vacías, objetos ausentes y desaparición entre comprobación y apertura. Los errores de acceso no se presentan como objetos inexistentes.

El manifiesto declara si el alcance es solo BD o BD con archivos, y separa `document_files_complete`. Cuando se solicitaron archivos y faltan objetos, conserva `complete=false` y el inventario de faltantes con motivo. `create_backup` guarda la copia parcial para diagnóstico, pero registra `estado=fallido`, informa cuántos objetos faltan y lanza el error; no alcanza la rama de éxito, avance de programación ni purga. Un tamaño o hash incorrecto también cancela la creación.

## Prueba negativa sin borrar objetos

Se simuló únicamente en el adaptador de lectura la ausencia de `PRUEBA_POLITICA_V2.pdf`. Se reutilizaron los mismos bytes ya leídos y el mismo snapshot. Resultado: dos archivos incluidos, un faltante `object_not_found`, `complete=false` y `document_files_complete=false`. B2 no sufrió ninguna modificación.

Artefacto negativo: `media/req64-controlado/20d99ed6-f98f-433a-ade6-1d4bcff03dbd-faltante-simulado.sdbk`. Es una muestra incompleta de prueba y no un respaldo utilizable. Una prueba unitaria adicional ejecutó `create_backup` con este tipo de resultado, usando persistencia simulada: confirmó `estado=fallido`, error con el faltante, conservación de hash/tamaño del parcial y ausencia de purga.

Pasaron **21 comprobaciones** con el snapshot #63 y objetos reales, más **20 pruebas unitarias/regresiones** seleccionadas. No se ejecutaron pruebas ni funciones de restauración. Las funciones de restauración quedaron bloqueadas por guardas en el procedimiento de validación.

Evidencia: `docs/resultado_archivos_respaldo_64.json`. Procedimiento: `docs/verificar_archivos_respaldo_64.py`. Regresiones: `documentos/test_backup_files.py` y pruebas seleccionadas de `documentos/tests.py`.

El alcance incluye exclusivamente archivos/versiones documentales; excluye binarios de reportes generados y otros artefactos ajenos. Se validó integridad binaria, no legibilidad o validez PDF. No se certifica recuperación. Cambios locales, pendientes de commit y despliegue en Render; sin cambios en configuración persistida, retención o datos del negocio.
