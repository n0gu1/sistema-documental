# Publicación y lectura autorizada — #31 y #49

9 de septiembre de 2026. Alcance: APROBADO → PUBLICAR → Lector autorizado.

La acción existente de Administrador en Gestión de versiones se conserva. Solo admite APROBADO; ahora bloquea documento y versión dentro de la transacción antes de validar el estado y hacer vigente la publicación. Elimina el evento de aprobación duplicado al publicar. El mensaje confirma número e ID publicados.

El Lector selecciona la versión PUBLICADO vigente, o la publicación de mayor orden si la vigente interna no está publicada. Antes se seleccionaba siempre la de mayor orden, incluso después de publicar explícitamente otra anterior. El historial lector usa el ID de publicación del detalle. Se conservan las publicaciones históricas y sus descargas explícitas. La fecha de publicación procede de la transición, no de la fecha de carga.

Las descargas lectoras incluyen X-Document-Version-Id, X-Document-Version y X-Content-SHA256; Cache-Control private, no-store evita almacenar esa respuesta. El archivo entregado se verifica por sus bytes, no solo por la cabecera.

## Evidencia

`verificar_publicacion_31_49.py`: 23 comprobaciones aprobadas mediante vistas Django reales y usuarios existentes en Neon. Preparación transaccional de versiones 1.0 y 1.1 APROBADO y 1.2 BORRADOR; archivos temporales distintos. No simula las decisiones de permisos ni el endpoint de publicación.

- Antes: biblioteca sin documento, detalle y descargas de 1.1 responden 404.
- Lector no publica (403); BORRADOR no publica (400).
- Administrador publica 1.1: biblioteca y detalle visibles, descarga lectora y general 200, bytes SHA-256 coincidentes.
- Publicación repetida rechazada. Publicar después la 1.0 aprobada hace que el detalle lector entregue 1.0, aun existiendo 1.1 publicada.
- Misma cuenta Lector con ACL DENEGAR de consulta y descarga: no aparece, ambos detalles 404 y ambas descargas 403 sin abrir almacenamiento.

Versión descargada en el ensayo: **1.1**, ID `c11f0da9-36d5-41a4-b51d-30aa0d8756b5`, SHA-256 `41a76ebc54e463266c77f74aac468539d5d44037459ed9034f0ae7b45efc6b2d`.

Resultado completo: `resultado_publicacion_31_49.json`. MCP Neon confirmó cero documentos con ID de ensayo `57e451cc-8690-485d-83b5-3cc45c1191f7` después del rollback. No se dejan documentos ni ACL de prueba persistidos.

Build y lint aprobados con advertencias preexistentes. No se valida UI de extremo a extremo, login, almacenamiento S3 ni despliegue Render. El catálogo de recurso ARCHIVO sigue provocando avisos de bitácora preexistentes; no se cierra el bloque de auditoría. La prueba demuestra backend local conectado a Neon, no el sitio desplegado. Pendiente confirmación del workspace que exige el MCP de Render. Sin commit ni despliegue.
