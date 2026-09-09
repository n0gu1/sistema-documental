# Requisito 35: vigente y selección independientes

Fecha: 8 de septiembre de 2026.

Se revisó primero la fila 35 de AUDITORIA_FINAL.md y el contrato de versiones. `GET /api/documents/{id}/versions/` devuelve `current_version_id` desde `es_vigente`. Una consulta de solo lectura por MCP de Neon confirmó que este último es un booleano persistido en `gestion_documental.versiones_documento`.

En VersionsView y EditorVersionsView, `currentVersionId` identifica la vigente recibida del servidor y `selectedVersionId` controla la comparación. El encabezado y la marca «Vigente» del historial usan exclusivamente la primera. Sin vigente se muestra «Sin versión vigente», sin asumir que la primera fila lo sea. Las operaciones existentes de publicación/carga actualizan la vigente después de su respuesta exitosa; seleccionar o intercambiar no lo hace.

Validación local con los componentes reales montados en Vite y Playwright, usando respuestas API controladas:

- Seleccionar y comparar 1.0, 1.1 y 1.2 mantiene 1.2 vigente en ambas vistas.
- Repetir con 1.1 vigente, aunque 1.2 aparezca primero, mantiene 1.1.
- Sin vigente, ninguna selección inventa una marca de vigencia.
- Intercambiar versiones en Administrador conserva la vigente.
- La petición de comparación usa el ID seleccionado y todas las solicitudes son GET; sin errores JavaScript.

Resultado: 21 comprobaciones aprobadas, compilación de producción y oxlint aprobados. Vite mantiene la advertencia de tamaño del paquete mayor de 500 kB.

Evidencia: [script](verificar_vigencia_ui.cjs), [resultados](resultado_vigencia_ui.json), [Administrador](vigencia_admin_ui.png), [Editor](vigencia_editor_ui.png). El montaje de pruebas está en `frontend/tests/versions-selection.html` y no forma parte de la entrada de producción.

Estas pruebas aíslan la selección de UI; no constituyen una prueba desplegada en Render ni modifican datos en Neon. Este requisito no cambia backend, política de versionado ni restauración. Pendiente commit y despliegue.
