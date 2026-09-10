# Requisitos 58–59: corrección lista/QuerySet

9 de septiembre de 2026. Únicamente se corrige la ordenación en `document_report_rows`: se ejecuta `order_by('-actualizado_en', 'codigo')` sobre el QuerySet antes de pasarlo a `filter_accessible_documents`; después se itera la lista devuelta. Se mantienen permisos, filtros, campos, indicadores y alcance de los reportes.

## Prueba con datos existentes

Backend local corregido conectado a Neon, mediante cliente HTTP de Django y `force_authenticate` con usuarios existentes; permisos y datos reales, sin crear documentos ni cambiar roles. No es una prueba del despliegue en Render ni del login.

| GET | Usuario | HTTP | Filas | summary.total | history |
|---|---|---|---|---|---|
| `/api/reports/?scope=executive` | prueba.admin@test.local | 200 | 15 | 15 | 2 |
| `/api/reports/?scope=editor` | prueba.editor@test.local | 200 | 7 | 7 | 0 |

Ambas respuestas conservan `scope` (string), `filters`, `summary` y `options` (objetos), `rows` e `history` (listas). Cada fila contiene `id`, `code`, `title`, `area_id`, `area`, `type_id`, `type`, `responsible_id`, `responsible`, `status_code`, `status`, `version` y `updated_at`.

Se verificaron filas no vacías, coincidencia del total, orden descendente de actualización y código ascendente para empates. Todas las filas del Editor conservan su creador como responsable. MCP Neon confirmó siete documentos no eliminados creados por la cuenta Editor. Las consultas generan los eventos de auditoría normales del endpoint.

Prueba reproducible: `docs/verificar_reportes_58_59.py`; evidencia: `docs/resultado_reportes_58_59.json`. Nueve pruebas existentes de formato/historial aprobadas y `manage.py check` sin problemas. `git diff --check` aprobado.

Sin rediseño de reportes ni validación de nuevas exportaciones. Cambios locales pendientes de commit y despliegue; los cambios anteriores se conservan.
