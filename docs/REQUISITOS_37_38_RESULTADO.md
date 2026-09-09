# Requisitos 37 y 38: selección e historial

Fecha: 8 de septiembre de 2026.

Se revisaron las filas 37 y 38 de AUDITORIA_FINAL.md. El Administrador ya recibía el ID seleccionado; se conectó su botón «Ver versión» a `preview_url` de esa fila y se desactiva cuando el formato no tiene preview disponible.

Editor ahora ofrece «Historial» por fila, pasa el ID a EditorVersionsView y lo conserva al entrar en Versiones desde el menú. Sin selección se solicita elegir un documento y se ofrece volver al listado. Se elimina la consulta `limit=1`.

Detalle e historial del Lector también dejan de elegir automáticamente el primer documento. Sus contenedores se reinician al cambiar el ID, evitando conservar resultados del documento anterior. La navegación lectora existente ya conserva el ID entre detalle e historial.

Prueba reproducible: `docs/verificar_historial_seleccion_ui.cjs`, con componentes reales en Vite y respuestas API controladas. Documento A tiene 1.0/1.1 y B tiene 2.0/2.1/2.2, con comentarios y previews exclusivos. Se alternó B → A → B en Administrador, Editor y Lector. Se verificaron número de filas, ausencia del historial ajeno, evento del Administrador, URL de la versión histórica y contenido servido en una pestaña de preview. Nueve recorridos aprobados; ningún acceso `limit=1` ni error JavaScript. Editor recorre su Dashboard y el botón real de cada fila; Administrador/Lector reciben la selección desde el montaje de prueba.

También pasaron las 21 comprobaciones de regresión de vigencia, oxlint y compilación de producción. Se conserva la advertencia de Vite sobre tamaño del paquete.

Neon MCP, solo lectura, confirmó historiales persistidos de distinta longitud: documento `7954d65d-2eb8-4dc7-aef6-74ea7c8726fe` con dos versiones y `2009f338-660e-4bcb-babb-d427620a6479` con una; cada uno tiene una vigente. Esta consulta no equivale a probar sus objetos S3: los previews de la prueba UI son controlados. No se modificó Neon ni se desplegó en Render.

Resultados: `docs/resultado_historial_seleccion_ui.json`. No se cambia backend, visibilidad lectora de versiones publicadas, permisos, reconstrucción de eventos históricos ni restauración. Cambios locales pendientes de commit y despliegue.
