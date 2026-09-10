# Requisito 60 — reporte de versiones

9 de septiembre de 2026. Alcance: reporte específico del historial de versiones; los reportes ejecutivo, editor y revisor se conservan.

## Uso y contenido

En Reportes del Administrador, seleccionar **Historial de versiones**. La tabla muestra documento, número de versión, autor de carga, fecha de creación, estado y comentario/cambio disponible. Permite generar y descargar PDF o XLSX por el mecanismo existente de instantáneas.

API: `GET /api/reports/?scope=versions`, opcionalmente con `document_id=<UUID>`. Generación: `POST /api/reports/generate/` con `scope: versions`, `format: PDF|XLSX` y `filters`. La respuesta mantiene `scope`, `filters`, `summary`, `options`, `rows` e `history`. Cada fila identifica una versión mediante `id` y su documento mediante `document_id`; incluye `code`, `title`, `version`, `author_id`, `author`, `created_at`, `status_code`, `status`, `comment` e `is_current`, además de área/tipo y alias de autor para los agrupamientos existentes.

Se consultan todas las versiones de documentos no eliminados de la organización autorizados mediante `reportes.generar` y el control documental existente. Orden: código/documento y número mayor/menor ascendente. Fecha filtra `creada_en` de la versión; autor filtra `creada_por_id`; estado se aplica a cada versión. El total cuenta versiones. Un documento sin versiones no aporta filas. Un comentario ausente se representa vacío en API/archivo y como «Sin comentario» en pantalla.

El estado es el guardado actualmente en cada registro de versión; no se reconstruyen transiciones históricas ni se inventan comentarios. Fechas JSON con zona horaria; pantalla en zona del navegador y exportación en zona configurada del backend, conforme a los formatos existentes.

## Prueba

MCP Neon identificó el documento existente **PRUEBA-001**, ID `7954d65d-2eb8-4dc7-aef6-74ea7c8726fe`, con dos versiones:

| Versión | Autor | Fecha UTC | Estado | Comentario |
|---|---|---|---|---|
| 1.0 | Juan Perez | 2026-08-27 06:48:25.067Z | BORRADOR | Carga de archivo |
| 2.0 | Juan Perez | 2026-08-27 06:51:54.610Z | PUBLICADO | Segunda version para probar comparacion |

`docs/verificar_reporte_versiones_60.py`: **19 comprobaciones aprobadas** contra Neon. GET 200 con ambas versiones (incluida no vigente), campos cotejados contra BD, orden, total, filtros de estado/fecha, UUID inválido 400, Lector sin permiso 403. Generación PDF/XLSX 201 y descarga 200; Excel cotejado celda por celda. PDF extraído y revisado visualmente, con las dos filas y sus comentarios completos.

Prueba de interfaz con componente real en Vite y respuestas controladas usando filas obtenidas de Neon: selector, dos versiones, seis campos y POST de generación con `scope=versions` aprobados, sin errores JavaScript. Evidencia en `docs/reporte_versiones_60_ui.png`.

Quince regresiones de formatos, historial y autorización/programaciones aprobadas; compilación frontend y comprobación Django aprobadas. La compilación usa un directorio temporal, sin reemplazar el build previo del usuario.

Datos y roles existentes; identidad suministrada mediante cliente de pruebas Django, sin ensayo de login. Reportes, eventos y escrituras de prueba revertidos; archivos temporales de almacenamiento eliminados por el contexto de prueba. Los archivos de evidencia descargados se conservan en `docs/reporte_versiones_60.pdf` y `docs/reporte_versiones_60.xlsx`. Resultado técnico en `docs/resultado_reporte_versiones_60.json`.

Backend local conectado a Neon; sin validar S3 ni despliegue en Render. Cambios pendientes de commit y despliegue. No se certifican aquí transiciones históricas completas ni otros requisitos de reportes.
