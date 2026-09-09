# Requisitos 34 y 36: creación secuencial de versiones

Fecha: 8 de septiembre de 2026. Alcance limitado a creación secuencial y conservación de versiones, después de revisar `AUDITORIA_FINAL.md`.

## Corrección de carrera

`save_document_file` bloqueaba la última versión. Sin versiones, no había fila que bloquear; una consulta iniciada antes de esperar tampoco garantizaba seleccionar la nueva versión insertada por otra transacción.

Ahora bloquea primero la fila del documento mediante `SELECT FOR UPDATE` dentro de la transacción. Después consulta el último número, calcula el siguiente y guarda el archivo y su fila, cambiando la vigencia anterior. Así todas las cargas por `files/` y `versions/` del mismo documento se serializan, incluida la primera. Se conservan los índices únicos existentes como protección adicional. No se modifican restauración ni la política de versionado del requisito 33.

## Verificación

[Script reproducible](verificar_versiones_secuenciales.py) y [resultado: siete comprobaciones aprobadas](resultado_versiones_secuenciales.json).

1. Alta con archivo por Editor: 1.0.
2. Carga menor por Administrador en `versions/`: 1.1.
3. Carga menor por Editor en `files/`: 1.2.
4. Persisten las filas, UUID, claves, hashes, bytes e historial de 1.0 y 1.1; solo cambia su indicador de vigencia.
5. Solo 1.2 queda vigente; orden de versiones 1, 2, 3 y consulta posterior 1.2, 1.1, 1.0.
6. Autores corresponden a cada petición; fechas presentes, dentro de la ejecución y ordenadas. La API devuelve autor y fecha.
7. Un fallo controlado de almacenamiento revierte los cambios, conserva la vigente y no consume un número.

Se verificó además el bloqueo real entre dos conexiones de PostgreSQL: una mantiene bloqueado un documento de ensayo existente sin versiones y una petición de carga espera, confirmado mediante `pg_blocking_pids`. Al liberar el bloqueo, la petición crea 1.0 dentro de su transacción de ensayo y la revierte. Esta prueba verifica el mecanismo de exclusión; no es una prueba de dos cargas simultáneas confirmadas.

Todas las versiones de ensayo se revirtieron; la ficha existente usada para el bloqueo quedó intacta. [MCP de Neon](resultado_versiones_secuenciales_neon.json) confirma que no permanecen el documento ni las versiones de la secuencia y registra los índices únicos actuales.

Almacenamiento temporal real `FileSystemStorage`, con comparación de bytes; no se prueba S3. Se observa el aviso preexistente del catálogo de auditoría `ARCHIVO_CARGADO`/`ARCHIVO`, fuera de este alcance. `git diff --check` aprobado. Cambios locales pendientes de commit, push y despliegue.
