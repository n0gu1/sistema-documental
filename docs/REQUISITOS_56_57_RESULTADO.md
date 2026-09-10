# Requisitos 56–57: denegaciones con actor identificable

9 de septiembre de 2026. Alcance exclusivo: registro común de denegaciones.

El middleware existente registra respuestas 401/403 cuando el request contiene un usuario documental identificable o una sesión resuelta en la base de datos. El helper conserva los motivos y recursos específicos existentes, añade `path` y `method` y evita repetir el registro en la misma solicitud. No incluye query strings, cookies ni credenciales.

La autenticación conserva una referencia interna a la sesión reconocida antes de comprobar expiración, revocación, cuenta activa, CSRF e inactividad. No convierte esa referencia en una autenticación válida. Sin cookie o con token desconocido no se inventa usuario ni organización. Los eventos `SESION_INVALIDA` existentes se conservan.

Campos: `usuario_id`, `detalles.path`, `detalles.method`, `ocurrido_en` (default `now()` confirmado mediante MCP Neon), `detalles.reason` y `exitoso=false` (API: `successful=false`). La consulta existente por `ACCESO_DENEGADO` continúa disponible. No se implementa un canal anónimo ni se cambian umbrales de alertas.

## Verificación

- `docs/verificar_denegaciones_56_57.py`: 17 comprobaciones aprobadas con backend local y SQL real contra Neon. Incluye `HasDocumentalPermission` sin registro específico, 403 del Lector al consultar auditoría sin duplicado, CSRF con sesión identificada, sesiones expiradas/revocadas y 401 sin cookie/token desconocido sin eventos atribuidos.
- Las sesiones temporales y sus eventos se revierten. Se conserva un 403 por permisos de la ejecución final: evento **575**, confirmado independientemente por MCP Neon: `prueba.lector@test.local`, `2026-09-09T22:52:14.190Z`, `GET /api/audit/`, `AUDIT_ACCESS_REQUIRED`, `successful=false`. La ejecución previa dejó también el evento de prueba 567.
- 13 pruebas de regresión aprobadas (`documentos.test_audit_reliability` y `documentos.tests.AuditTests`), `manage.py check` y `git diff --check` sin errores.

Resultado reproducible en `docs/resultado_denegaciones_56_57.json`. Las pruebas usan el cliente HTTP de Django; el caso persistido fuerza la identidad del Lector y consulta sus permisos reales. No se afirma un login por navegador ni un despliegue en Render. Se mantiene la política de fallos observables del requisito 50.

Cambios locales, pendientes de commit y despliegue. Se conservan los cambios previos del espacio de trabajo y la matriz histórica de auditoría.
