# Requisito 62 — reporte integral de trazabilidad

9 de septiembre de 2026. Implementación exclusiva del nuevo reporte `traceability`. Los otros scopes mantienen su construcción y sus exportadores.

## Consulta y exportación

En Reportes, abrir **Reporte integral de trazabilidad**, elegir explícitamente un documento y pulsar Consultar trazabilidad. La selección se conserva en la exportación y al cambiar documento se limpian los resultados y el enlace anteriores. El selector carga las páginas del listado, incluidos documentos archivados.

- `GET /api/reports/?scope=traceability&document_id=<UUID>`: documento, inventario de versiones, cronología, resumen de fuentes, notas e historial de reportes de ese documento.
- `POST /api/reports/generate/`: `scope=traceability`, `format=PDF|XLSX`, `filters.document_id`. Usa el mecanismo existente de instantáneas e integridad.
- Descarga mediante la URL devuelta. Vuelve a comprobar acceso al documento, además del permiso del reporte y la bitácora.
- Requiere `reportes.generar` y el acceso existente a bitácora integral (Administrador), junto al aislamiento por organización y autorización documental. Falta de documento: 400; documento inexistente/no accesible: 404; rol no autorizado: 403.

## Fuentes y relaciones

| Fuente | Evidencia incorporada |
|---|---|
| Documento | Creación, actor, fecha y archivo lógico si existe. |
| Versiones | Todas las versiones conservadas, número, autor, fecha, comentario y estado actual en inventario separado. |
| Solicitudes | Envío a revisión, solicitante, fecha, versión y revisor guardado; resolución, estado y comentario cuando existen. |
| Historial de estados | Estado anterior/posterior, actor, fecha y comentario. Identifica publicación mediante transición a PUBLICADO. |
| Auditoría | Eventos vinculados por recurso al documento, sus versiones o sus solicitudes; incluye éxitos y fallos, actores, fechas, acción y detalles documentales pertinentes. |
| Restauración | Evento VERSION_RESTAURADA, versión destino y vínculo a versión origen del mismo documento cuando existe source_version_id. |

Cada fila mantiene `source` e `source_id`, además de documento, versión, actor, fecha y solicitud/revisor cuando corresponde. Las referencias permiten relacionar evidencias sin fusionarlas por proximidad temporal. El total cuenta **registros de evidencia**, no acciones únicas: una operación puede tener solicitud, cambio de estado y evento de auditoría.

No se inventa un actor para `resuelta_en`: puede corresponder a un cierre automático; el revisor asignado se presenta por separado. Tampoco se presenta el estado actual de una versión como estado en la fecha de creación. Los datos históricos ausentes no se reconstruyen; los nombres y metadatos son los conservados actualmente. Solo se incorpora auditoría con recurso relacionado de forma directa; no se incluyen sesiones o eventos ajenos por compartir usuario o fecha.

PDF exporta la cronología completa, sin el límite de 1.000 filas del constructor genérico. Cada evidencia se mantiene agrupada al paginar cuando cabe en una página. XLSX incluye Documento, Versiones y Cronología, con todas las referencias, texto ajustado y celdas literales para no ejecutar comentarios como fórmulas. No se modifica el formato de otros reportes.

## Prueba con un documento conocido

Documento existente **PRUEBA-001**, ID `7954d65d-2eb8-4dc7-aef6-74ea7c8726fe`. MCP Neon confirmó **dos versiones, una solicitud y cinco cambios de estado**. La consulta devuelve **53 evidencias existentes**, incluidas las versiones 1.0/2.0, envío a revisión, resolución aprobada, publicación y auditoría documental.

Sobre ese mismo documento, el ensayo agrega exclusivamente dentro de una transacción tres eventos controlados para verificar relaciones adicionales: restauración 1.0 → 2.0, rechazo vinculado a la solicitud y acceso denegado. Son fixtures de prueba, no operaciones históricas reales del documento. Un cuarto evento referido a un recurso ajeno se excluye. La exportación de prueba contiene 56 registros. No se creó ni modificó otro documento.

Resultados de `docs/verificar_trazabilidad_62.py`:

- **81 comprobaciones aprobadas**, incluido cotejo de todas las filas/campos de Excel y referencias de fuente de PDF.
- Consulta **HTTP 200**, generación PDF/XLSX **201**, descarga **200**.
- Lector: consulta y descarga **403**.
- Orden cronológico, IDs únicos de fuente, publicación, vínculo origen/destino de restauración, solicitud/revisor/actor y successful=false comprobados.
- Datos y reportes revertidos. MCP confirmó cero eventos del marcador final `d20db8d7-c060-4077-aa85-7030868c654b`, cero reportes traceability de prueba y las dos versiones originales conservadas.

Prueba UI con componente real y API controlada a partir del resultado Neon: selección explícita, 56 filas, consulta/exportación del mismo documento, publicación/restauración y limpieza al cambiar selección, sin errores JavaScript. Quince regresiones de reportes aprobadas, comprobación Django y build frontend correctos; `git diff --check` sin errores. PDF revisado visualmente; el ejemplar final tiene ocho páginas.

Evidencia: `docs/resultado_trazabilidad_62.json`, `docs/trazabilidad_62_ui.png`. Los archivos `docs/trazabilidad_62.pdf` y `docs/trazabilidad_62.xlsx` son **ejemplares de prueba con los tres eventos controlados**; no deben confundirse con el historial original de 53 registros.

Backend local conectado a Neon, con identidad suministrada por el cliente de pruebas Django. Almacenamiento temporal local, sin validar S3 ni login por navegador. Cambios locales pendientes de commit y despliegue en Render. Se conserva el trabajo previo del espacio de trabajo.
