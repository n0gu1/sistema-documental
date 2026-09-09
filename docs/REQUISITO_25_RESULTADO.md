# Requisito 25: autorización de descarga

Fecha: 8 de septiembre de 2026. Alcance: únicamente autorización de descarga, según la solicitud posterior a revisar `AUDITORIA_FINAL.md`.

## Corrección

Se centralizó la autorización en `get_download_document`, utilizada por las descargas generales de archivo/versión y la descarga dedicada del lector. Las rutas generales ya exigían el permiso global; la ruta dedicada dependía del acceso documental y respondía 404 ante una denegación. Ahora todas exigen explícitamente `documentos.descargar` y verifican también ese permiso en la política del documento.

- Sin permiso global de descarga: 403, antes de acceder al almacenamiento.
- Permiso global presente pero descarga denegada por la política documental: 403.
- Documento inexistente, de otra organización o archivado: 404.
- Archivo/versión que no pertenece al documento autorizado: 404.
- Lector: solo puede descargar la versión publicada solicitada.

La descarga por ID de versión general reutiliza la misma implementación que la descarga por ID de archivo. La búsqueda de la versión permanece acotada a `document.archivos`, nunca se resuelve un archivo por su ID global sin comprobar su documento.

Consultar y previsualizar conservan sus reglas actuales. Esta corrección no modifica URLs de listados, UI, políticas de versiones ni almacenamiento S3. La parte histórica de la fila #25 referida a URLs del Editor queda fuera de este alcance.

## Prueba reproducible

[Script de autorización](verificar_autorizacion_descarga.py): usuarios reales Editor y Lector, tres rutas de descarga y consulta por ambas rutas. El permiso se habilita/deshabilita únicamente dentro de una transacción de prueba en Neon que siempre se revierte; el cambio no se confirma ni queda visible para otras conexiones.

Con consulta sin descarga se espera consulta 200 y descarga 403. Con ambos permisos se espera 200 y se comparan los bytes recibidos de un archivo temporal real mediante `FileSystemStorage`. Los rechazos verifican que no se abrió el almacenamiento. También se prueba una versión de otro documento, una política documental DENEGAR y versiones no publicadas para lector.

La prueba de almacenamiento es local y no acredita conectividad S3. Los registros de ensayo y cambios de permiso se revierten. Cambios locales pendientes de commit y despliegue.

**25 comprobaciones aprobadas:** [resultado completo](resultado_autorizacion_descarga.json). Una [consulta independiente mediante MCP de Neon](resultado_descarga_neon.json) confirmó al terminar que consultar y descargar permanecen activos tras revertir la transacción de ensayo. `git diff --check` sin errores.

Durante las pruebas aparece el aviso preexistente `AUDITORIA_NO_REGISTRADA` para `ARCHIVO_DESCARGADO`/`ARCHIVO`, por falta de coincidencia en el catálogo de auditoría. No se modifica ese catálogo en esta corrección de autorización; no se afirma que la auditoría de descarga esté validada.
