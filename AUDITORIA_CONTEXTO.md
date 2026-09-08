# AUDITORIA_CONTEXTO — Sistema Documental (Consultoría Alexandria)

> Solo contexto arquitectónico. No corrige errores. Generado 2026-09-05 por inspección estática (sin ejecutar todo el código).

## 1. Tipo de sistema
Sistema de **gestión documental institucional multitenant (por `organizacion_id`)**: CRUD documental + versionamiento inmutable + workflow revisión/aprobación/publicación + biblioteca lector + auditoría/bitácora + reportes + respaldos cifrados + notificaciones + configuración por organización + dashboard admin. Marca UI: `Consultoría Alexandria`. Idioma: `es-ES` / `America/Bogota`.

## 2. Lenguajes
- **Python 3** (backend Django).
- **JavaScript/JSX + CSS + HTML** (frontend React SPA).
- **SQL crudo (PostgreSQL)** vía `django.db.connection.cursor()` para RBAC/auditoría/ACL.
- **Bash/Batch** para build/arranque (`build.sh`, `iniciar.bat`, `iniciar-unificado.bat`).

## 3. Frameworks
- Backend: **Django 5.2.17 + DRF 3.18.0**.
- Frontend: **React 19.2.8 + react-dom 19.2.8 + Vite 8.2.2 + @vitejs/plugin-react 6.1.0**.
- Servidor prod: **gunicorn 23.0.0** (`backend.wsgi:application`).
- Estáticos prod: **WhiteNoise 6.9.0 `CompressedManifestStaticFilesStorage`**.

## 4. Librerías principales (`requirements.txt` + `frontend/package.json`)
- `django-cors-headers 4.9.0`, `psycopg2-binary 2.9.10`, `python-dotenv 1.1.1`.
- Archivos/S3: `django-storages 1.14.6 + boto3 1.40.18`.
- Reportes: `openpyxl 3.1.5` (XLSX), `reportlab 4.4.3` (PDF).
- Cripto: `cryptography 46.0.7` (`AESGCM` para respaldos `.sdbk` y secretos SMTP `CFG1`).
- Frontend deps: solo `react`, `react-dom`. Dev: `vite`, `oxlint 1.79.0`, `@types/react*`. Sin router, sin axios, sin state manager, sin tests.

## 5. Arquitectura
**Monolito modular Django que sirve la SPA construida.** Sin microservicios.
- Backend: app única `documentos` (~30 módulos) organizada por dominio: `views.py` (auth/health), `document_views.py`, `workflow_views.py`, `reader_views.py`, `management_views.py`, `audit_views.py`, `reports_views.py`, `backup_views.py`, `notification_views.py`, `settings_views.py` + servicios `auth_utils.py`, `authentication.py`, `permissions.py`, `reader_access.py`, `file_validation.py`, `security_utils.py`, `config_service.py`, `notifications.py`, `backup_service.py` (~1376 líneas).
- API REST con `APIView` explícitas, sin `ViewSet/Router`. Prefijo `/api/` (ver §10).
- Frontend SPA sin `react-router`: `App.jsx -> Login.jsx` despacha por `user.roles[].code` a `Dashboard` (admin), `EditorDashboard`, `ReviewerDashboard`, `ReaderDashboard` + shells `Reader*Shell`.
- Patrón **DB-first/legacy**: esquema `gestion_documental` en Postgres, mayoría de modelos `managed=False` (tablas externas). Migraciones Django (19 ficheros `0001..0019`) solo cubren parte.
- Multitenencia lógica: filtrado por `organizacion_id` + ACL área/documento. `ADMINISTRADOR` hace bypass global.
- Almacenamiento conmutable: `filesystem` (solo dev) / `s3` (obligatorio en prod).

## 6. Estructura de carpetas
```
manage.py (DJANGO_SETTINGS_MODULE=backend.settings)
backend/{settings.py,urls.py,wsgi.py,asgi.py}
documentos/{models.py(961 lín, ~30 modelos),urls.py(112 rutas),views.py,
 document_views.py,workflow_views.py,reader_views.py,management_views.py,
 audit_views.py,reports_views.py,backup_views.py,notification_views.py,
 settings_views.py,serializers.py,document_serializers.py,authentication.py,
 permissions.py,auth_utils.py,reader_access.py,file_validation.py,
 security_utils.py,config_service.py,notifications.py,backup_service.py,
 admin.py(vacío),apps.py,management/commands/{generar_respaldos_programados.py,
 generar_reportes_programados.py},migrations/0001..0019,tests.py(~2700 lín)}
frontend/{package.json,vite.config.js(base:'/static/',proxy /api->127.0.0.1:8000),
 index.html,src/{main.jsx,App.jsx,Login.jsx(394 lín),api.js,documentApi.js,
 Dashboard.jsx,Editor*.jsx,Reviewer*.jsx,Reader*.jsx,Roles/Users/Reports/
 Backups/Audit/Settings/Versions/Documents*.jsx + *.css},dist/(build servido),
 public/}
docs/diagrams/{erd-*.png,infraestructura-*.png,generar_erd.py}
documentos/ (raíz, legacy/carpetas locales), media/ (gitignored), staticfiles/ (build),
db.sqlite3 (residual, gitignored; prod usa Postgres), .env (gitignored) + .env.example,
render.yaml, build.sh, requirements.txt, backend-checklist.txt (290 lín, estado verificado),
iniciar.bat, iniciar-unificado.bat, .playwright-mcp/
```

## 7. Componentes principales
- `backend/settings.py` (310 lín): env helpers `env_bool/env_list`, CORS/CSRF, DB `DATABASE_URL|DB_*`, `CookieTokenAuthentication` por defecto + `IsAuthenticatedAndPasswordCurrent`, throttles `login:10/min`, `change_password:5/hour`, `STORAGES`, hardening prod, `LOGGING`.
- `backend/urls.py`: `admin/`, `api/` (`documentos.urls`), `static MEDIA` solo DEBUG, fallback `re_path(r'^(?!api/|static/).*$', serve_react)` que sirve `frontend/dist` con `MIME_TYPES` manual.
- `documentos/models.py`: `UsuarioDocumental`, `SesionDocumental` (unmanaged), `Organizacion`, `Area`, `TipoDocumento`, `ClasificacionDocumento`, `EstadoDocumento`, `AccionAuditoria`, `TipoRecursoAuditoria`, `RolDocumental`, `PermisoDocumental`, `UsuarioRolDocumental`, `RolPermisoDocumental`, catálogos `TipoDocumentoCatalogo/AreaCatalogo/EstadoVersionCatalogo/ProveedorAlmacenamiento`, `Documento`, `MetadatoDocumento`, `ArchivoDocumento` (`versiones_documento`, `orden_version`, `numero_mayor/menor`, `sha256`), `EstadoRevisionCatalogo`, `SolicitudRevision`, `HistorialEstadoVersion`, `DetalleSolicitudRevision`, `ElementoChecklistRevision`, `ComentarioRevision`, `ReporteGenerado`, `ProgramacionReporte`, `Respaldo`, `ConfiguracionRespaldo`, `ConfiguracionSistema` (JSONB por sección), `RegistroAccesoDocumento`, `FavoritoDocumento`, `Notificacion`. PKs UUID. `document_file_upload_to`: `{org}/{doc}/{uuid}{ext}`.
- `authentication.py:CookieTokenAuthentication`: cookie `sd_session` httponly (`AUTH_COOKIE_NAME`), `SHA256(token)==sesiones.hash_token`, controla revocación/expiración/inactividad (`security_policy_for`), `ultima_actividad_en` update, `enforce_csrf()`, audita `SESION_INVALIDA`.
- `permissions.py`: `IsAuthenticatedAndPasswordCurrent` (bloquea si `debe_cambiar_contrasena` → `PASSWORD_CHANGE_REQUIRED`) + `HasDocumentalPermission(permission_code)` → `INSUFFICIENT_PERMISSIONS`.
- `auth_utils.py`: `get_user_roles/get_user_permission_codes` (SQL), `user_has_permission` (ADMIN bypass), `serialize_user`, `record_auth_event` (`INSERT ... SELECT` catálogos → `bitacora_auditoria`, `logger.critical AUDITORIA_NO_REGISTRADA` si falla), `record_access_denied`, `get_client_ip` (X-Forwarded-For).
- `reader_access.py`: `MANAGEMENT_PERMISSIONS` (8 códigos que distinguen lector), `is_reader_user`, `has_area_permission`, `has_document_permission` (ACL explícita `documentos_roles_permisos` prevalece; admin bypass), `published_document_queryset/version`, `record_reader_access` (CONSULTA/LECTURA/DESCARGA/VISTA_PREVIA → evento auditoría).
- `file_validation.py`: whitelist ext+MIME+magic bytes (`pdf,docx,xlsx,pptx,jpg,jpeg,png`), anti-zip-bomb OOXML (2000 entries, 200MB, no `..`, no `vbaproject.bin`, no `.exe/.dll/.ps1...`), `SHA256`, límites por org o `MAX_UPLOAD_SIZE_MB=50`.
- `config_service.py`: `DEFAULTS{general,security,smtp,carga,apariencia,notificaciones,integraciones}`, `merge_defaults/get_system_config/security_policy_for/upload_policy_for`, `encrypt_secret/decrypt_secret` (AESGCM con `SHA256(backup_key()+b'config')`), `validate_section/update_system_config`, `smtp_connection_for`.
- `notifications.py`: `serialize_notification/create_notification` (in-app siempre, email si `notificaciones.email_enabled|NOTIFICATIONS_EMAIL_ENABLED` + `smtp_connection_for`), `notify_review_assignment/*` helpers.
- `backup_service.py`: snapshot transaccional por organización (`GLOBAL_BACKUP_TABLES` 7 + `BACKUP_RELATIONS` grafo FK), valida hashes/tamaños, zip → `AESGCM(backup_key()).encrypt` → `.sdbk` (`SDBK1`, `sistema-documental-backup-v2`), retención `DEFAULT_RETENTION_DAYS=30`, restore upsert no destructivo + `restaurado_en` solo en restore.
- Frontend `api.js`: `apiRequest(path,{method,body})` con `fetch credentials:include`, `GET /api/auth/csrf/` previo a mutaciones → `X-CSRFToken`, `FormData` vs JSON, `formatDate(es-ES)`. `documentApi.js`: `normalizeDocument/buildDocumentQuery(ordering,search,type_id,area_id,status_code,responsible_id,updated_from/to,limit/offset)` + helpers revisor/lector.

## 8. Módulos funcionales
1. **Auth/sesiones** (`views.py:CsrfToken/Login/CurrentUser/Logout/ChangePassword/Health`): login por `identity` (usuario|correo) con `select_for_update`, `DUMMY_PASSWORD_HASH` anti-enumeración, bloqueo `AUTH_MAX_FAILED_ATTEMPTS=5/AUTH_LOCK_MINUTES=15`, sesión `AUTH_SESSION_HOURS=12/REMEMBER_DAYS=30`, cookie `sd_session`.
2. **Admin** (`management_views.py` 16 vistas): `AdminDashboard` (contadores BORRADOR/EN_REVISION/APROBADO/PUBLICADO/ARCHIVADO, recientes, cola revisiones), CRUD usuarios (DELETE=baja lógica + revoca sesiones, no auto-baja), status/lock/reset-password/roles/sessions/device-revoke/session-revoke, CRUD roles/permisos + `RolePermissions`.
3. **Documentos** (`document_views.py` 14 vistas): list/create con filtros `search/type_id/area_id/status_code/responsible_id/updated_from/to/ordering/limit/offset`, catálogos, export, detail, `DocumentPermissionsView` GET/PUT transaccional (valida roles/permisos activos misma org), archive/unarchive (baja lógica), files (upload `version_type=minor|major`), versions, restore (nueva versión BORRADOR con `origen restauración`), compare (SHA256+metadatos), timeline (versiones+auditoría; lector solo `PUBLIC_ACCIONES`), download/preview autorizadas. `DIRECT_EDIT_BLOCKED_STATES={EN_REVISION,APROBADO,PUBLICADO}`.
4. **Versionamiento**: `orden_version` incremental, `1.0` inicial, `minor→1.1`, `major→2.0` (`next_version_numbers/save_document_file`), inmutable (sin update/delete endpoints), `es_vigente`.
5. **Workflow** (`workflow_views.py` 12 vistas): `VERSION_TRANSITIONS: BORRADOR->{EN_REVISION}, EN_REVISION->{APROBADO,BORRADOR,RECHAZADO}, APROBADO->{PUBLICADO}, PUBLICADO->{}`; submit/inbox/candidates/by-document/detail/assign/approve/return/reject (+`ReviewDecisionView` base que exige observación en return/reject), comments+replies/resolve, checklist (solo asignado, bloqueado si resuelta), publish (APROBADO→PUBLICADO).
6. **Lector** (`reader_views.py` 8 vistas): solo `estado_version=PUBLICADO` + ACL, detail/read (registra LECTURA), history, favorites CRUD, version download/preview.
7. **Notificaciones**: tipos `REVISION_ASIGNADA/COMENTARIO/APROBACION/DEVOLUCION/RECHAZO...`, bandeja + `read/read-all`.
8. **Auditoría** (`audit_views.py` 3 vistas): `AuditList` (filtros acción/resultado/criticidad/fecha + paginación), `AuditExport` CSV, `AuditAlerts` (fallidos, denegaciones RBAC/ACL, sesiones inválidas).
9. **Reportes** (`reports_views.py` 5 vistas): ejecutivos/editor/revisor filtrados, genera PDF/XLSX inmutable en S3 (`hash SHA256`), historial + download con verificación, `ReportSchedule` CRUD restringido creador|admin + `generar_reportes_programados`.
10. **Respaldos** (`backup_views.py` 5 vistas): list/config/download/restore (`restore` valida snapshot y reemplaza faltantes/corruptos por SHA256/tamaño)/`recovery-test` (solo integridad, no rebuild DB), `generar_respaldos_programados`, `.sdbk` cifrado.
11. **Configuración** (`settings_views.py` 3 vistas): `SystemSettings` (7 secciones), `SmtpTest`, `IntegrationTest` (microsoft365/google_workspace/webhook/storage_s3/smtp; solo test, sin OAuth real).
12. **Dashboard**: indicadores reales, recientes, cola revisiones, actividad por usuario.

## 9. Frontend (detalle)
- Entry: `main.jsx (StrictMode) -> App.jsx (<Login/>) -> Login.jsx` (auth/me al montar, login/logout/change-password, `must_change_password` gate, routing por roles `ADMINISTRADOR/EDITOR/REVISOR|REVIEWER/LECTOR` con prioridad admin>editor>reviewer>reader).
- ~35 vistas: `Dashboard` (muestra 4 users/4 roles/21 permisos), `Documents/Versions/Audit/Backups/Reports/Roles/Users/Settings`, `Editor*` (dashboard/documents/edit/versions/basic-reports/activity-log), `Reviewer*` (dashboard/inbox/review/comparison/personal-log/basic-reports), `Reader*` (dashboard/library/document/version-history/reading-history/favorites).
- Sin paginación remota completa en varias vistas (piden `limit=100` + filtros al backend; checklist marca mocks/restos y bundle >500KB, `oxlint` warnings pendientes).
- `vite.config.js`: `base:'/static/'`, `proxy /api->127.0.0.1:8000`.

## 10. Backend + APIs
- Base: `/api/` + `admin/` Django. Todas (salvo `auth/csrf,auth/login,health`) exigen `CookieTokenAuthentication` + `IsAuthenticatedAndPasswordCurrent`.
- Auth: `auth/csrf|login|me|logout|change-password`.
- Admin: `admin/dashboard`, `admin/users[/<uuid>/[status|lock|reset-password|roles|sessions|devices/<dev>/revoke]]`, `admin/sessions/<uuid>/revoke`, `admin/roles[/<uuid>/[/permissions]]`, `admin/permissions[/<uuid>/]`.
- Docs: `documents[/catalogs|export|/<id>/[/permissions|archive|unarchive|files|versions|timeline|files/<fid>/download|files/<fid>/preview|versions/<vid>/download|versions/<vid>/restore|versions/compare|versions/<vid>/submit-review|versions/<vid>/publish|reviews]]`.
- Reviews: `reviews/inbox|reviewers|<id>/[assign|approve|return|reject|comments|checklist]`, `reviews/checklist/<item>/`, `reviews/comments/<cid>/resolve`.
- Lector: `reader/documents[/<id>/[/read|favorite|versions/<vid>/download|versions/<vid>/preview]]`, `reader/history|favorites`.
- Otros: `notifications[/read-all|<id>/read]`, `audit[/export|alerts]`, `reports[/generate|<id>/download|schedules[/<id>/]]`, `backups[/config|<id>/download|<id>/restore|recovery-test]`, `settings[/smtp/test|integrations/<prov>/test]`, `health/` (DB check).

## 11. Base de datos
- **PostgreSQL** obligatorio (`DATABASE_URL postgres|postgresql` o `DB_NAME/USER/PASSWORD/HOST/PORT`), `CONN_MAX_AGE=600`, `CONN_HEALTH_CHECKS=True`, `sslmode=require` en prod. `db.sqlite3` solo residuo local gitignored.
- Esquema `gestion_documental.*` (ver §7), UUID PKs, constraints `uq_*/ck_*`, índices implícitos FK.
- `migrations/0001..0019`: auth unmanaged → catálogos → roles/permisos → documentos → áreas/estados → revisiones → lector → notificaciones → auditoría → reportes(+v2+snapshot) → respaldos_v2 → config_v2 → exportado → timeline → restauración → sesiones inválidas/alertas.

## 12. ORM / acceso datos
- **Django ORM** (`select_related/select_for_update/transaction.atomic`, `only/order_by/distinct`) + **SQL crudo** para RBAC/auditoría/ACL/restauración (`connection.cursor`, `INSERT ... SELECT`, `upsert`, orden dependencias `BACKUP_RELATIONS`).

## 13. Autenticación
- Cookie `sd_session` (`httponly`, `Secure=!DEBUG`, `SameSite=Lax`, `max_age` si `remember`), hash SHA256 en DB, expiración absoluta + inactividad por org (`inactivity_minutes` default 30, `max_session_hours` 8), revocación individual/por dispositivo, CSRF doble (`ensure_csrf_cookie` + `csrf_protect` + header), throttling, `check_password/make_password` (pbkdf2), `AUTH_PASSWORD_VALIDATORS` Django, `debe_cambiar_contrasena` bloqueante. Sin MFA (pendiente checklist).

## 14. Autorización / Roles y permisos
- Global: `HasDocumentalPermission.permission_code` por vista + `user_has_permission` (ADMIN bypass).
- Alcance área: si `usuario.area_id` seteado y no admin → solo misma `area_id` o creados propios.
- Alcance documento: `documentos_roles_permisos` transaccional; si existen filas → solo roles concedidos (admin bypass); si no → permiso global + área.
- Lector: `is_reader_user` (sin ningún `MANAGEMENT_PERMISSIONS`) + solo `PUBLICADO`.
- Roles: `ADMINISTRADOR` (todo), `EDITOR` (crear/editar/enviar/versiones), `REVISOR` (bandeja/checklist/comentarios/aprobar/devolver/rechazar), `LECTOR` (biblioteca/lectura/favoritos). Asignación `usuarios_roles` con `vigente_hasta`, validada misma org + activa. 21 permisos administrables.

## 15. Servicios internos
`auth_utils` (RBAC/auditoría), `reader_access` (ACL/publicados), `file_validation` + `security_utils.sanitize_text` (strip_tags/control chars), `config_service` (políticas/límites/secretos), `notifications` (in-app+email), `backup_service` (snapshot/restore/retención/cifrado), `document_views.save_document_file/next_version_numbers/transition_version`, `workflow` transiciones, `reports` builders XLSX/PDF.

## 16. Servicios externos
- **Backblaze B2 S3-compatible** (`AWS_S3_ENDPOINT_URL=https://s3.us-east-005.backblazeb2.com`, `AWS_S3_REGION_NAME=us-east-005`, `AWS_STORAGE_BUCKET_NAME/*KEY*`, `AWS_LOCATION=documentos`, `AWS_QUERYSTRING_AUTH=True`, `S3Storage`, `S3_FILE_OVERWRITE=False`).
- **SMTP genérico** (host/port/user/pass TLS/SSL, `DEFAULT_FROM_EMAIL`, `NOTIFICATIONS_EMAIL_ENABLED=false` por defecto + flag por org).
- **Render**: Postgres + Web + 2 Cron (ver §20). `SECURE_PROXY_SSL_HEADER`, `CSRF_TRUSTED_ORIGINS`.
- **Stubs**: `microsoft365/google_workspace/webhook(storage_s3/smtp)` solo config/test HTTPS, sin sync real.

## 17. Manejo de archivos
Límites/env (`MAX_UPLOAD_SIZE_MB=50`, `MAX_REQUEST_SIZE_MB=250`, `ALLOWED_UPLOAD_EXTENSIONS=.pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png`, sobreescribibles por org), validación §7, `FileSystemStorage(MEDIA_ROOT/media,MEDIA_URL=/media/)` dev vs `S3Storage` prod, URLs firmadas, preview/descarga autorizadas, sin borrado físico (baja lógica `eliminado_en/archivado`), versiones conservadas, restore = nueva versión.

## 18. Configuración / Variables entorno
- `.env.example` (33 lín, sin secretos): `ENVIRONMENT,DEBUG,SECRET_KEY,ALLOWED_HOSTS,DATABASE_URL,DB_NAME/USER/PASSWORD/HOST/PORT/SSLMODE/CONN_MAX_AGE,CORS_ALLOWED_ORIGINS,CSRF_TRUSTED_ORIGINS,CORS_ALLOW_CREDENTIALS,MAX_UPLOAD_SIZE_MB,MAX_REQUEST_SIZE_MB,ALLOWED_UPLOAD_EXTENSIONS,STORAGE_BACKEND,MEDIA_ROOT,AWS_STORAGE_BUCKET_NAME/ACCESS_KEY_ID/SECRET_ACCESS_KEY/S3_REGION_NAME/S3_ENDPOINT_URL/LOCATION` + en `settings/render.yaml`: `AUTH_COOKIE_SECURE/SESSION_HOURS/REMEMBER_DAYS/MAX_FAILED_ATTEMPTS/LOCK_MINUTES,BACKUP_ENCRYPTION_KEY (base64 32B),NOTIFICATIONS_EMAIL_ENABLED,EMAIL_HOST/PORT/USE_TLS/USE_SSL/HOST_USER/HOST_PASSWORD/DEFAULT_FROM_EMAIL,RENDER_EXTERNAL_HOSTNAME,PORT`.
- `ConfiguracionSistema` por org: `general/security/smtp/carga/apariencia/notificaciones/integraciones` (ver defaults §7).

## 19. Logs / Errores
- `LOGGING`: `formatter operational '{levelname} {asctime} {name} {message}'`, `StreamHandler console` (stderr → Render), `django.request:ERROR`, `documentos:INFO`, `disable_existing_loggers=False`. Sin Sentry/APM.
- Críticos: `AUDITORIA_NO_REGISTRADA` (fallo persistencia/catálogo), `logger.warning/exception` backup/notifs. Health: `/api/health/` 200 con DB operativa. Errores API en español con `code/detail` (`PASSWORD_CHANGE_REQUIRED`, `INSUFFICIENT_PERMISSIONS`, `ValidationError {file:...}`). `ImproperlyConfigured` en prod si falta `SECRET_KEY/ALLOWED_HOSTS/DB/S3` o `filesystem` en prod o `CORS *` con credenciales. Frontend `errorMessage(data.detail|data[field][0])`.

## 20. Pruebas
- Backend: `documentos/tests.py` (~113 tests 2026-08-28, 37 admin): modelos, endpoints, carga/descarga, auditoría (incl. `AUDITORIA_NO_REGISTRADA`), permisos/ACL, versionado/restore/compare/timeline, workflow completo, lector, notifs SMTP mock, backup/restore/verify, reportes. Comandos: `python manage.py check`, `check --deploy` (prod), `test documentos`.
- Frontend: sin tests (`lint: oxlint src`, bundle >500KB pendiente split, sin e2e; `backend-checklist.txt` documenta verificaciones manuales Render + Playwright prod puntual).
- Pendientes checklist: aislamiento multiorg e2e, ACL en exports/reportes, recovery completa aislada, aceptación.

## 21. Build / Despliegue
- Build (`build.sh` + `render.yaml:buildCommand`): `npm ci --prefix frontend --include=dev && npm run build --prefix frontend && pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`.
- Start web: `gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT`, `healthCheckPath:/api/health/`, `region:oregon`, `plan:free`.
- DB: `sistema-documental-db (free, databaseName:sistema_documental)`, `DATABASE_URL fromDatabase`.
- Cron: `sistema-documental-respaldos (0 2 * * * → generar_respaldos_programados, starter)`, `sistema-documental-reportes (0 3 * * * → generar_reportes_programados, starter)` — requieren conectar Blueprint + facturación.
- Local: `iniciar-unificado.bat/iniciar.bat → python manage.py runserver` (http://localhost:8000 unificado; dev Vite proxy `/api`).
- Hardening prod: `SECURE_SSL_REDIRECT/HSTS 31536000/HSTS_INCLUDE/PRELOAD/CONTENT_TYPE_NOSNIFF/REFERRER same-origin/X_FRAME DENY`, `CSRF/SESSION_COOKIE_SECURE`.

## 22. Puntos de entrada
- `manage.py`, `backend/wsgi.py/asgi.py`, `backend/urls.py`, `documentos/urls.py`, `frontend/src/main.jsx→App.jsx→Login.jsx`, `documentos/management/commands/generar_{respaldos,reportes}_programados.py`, `backend/settings.py`.

## 23. Flujos principales
1. **Auth**: `GET auth/csrf → POST auth/login → GET auth/me (roles) → dashboard por rol → POST auth/change-password si `must_change_password` → POST auth/logout`.
2. **Documental editor**: `POST documents (+metadatos+file) → 1.0 BORRADOR → POST :id/files (minor/major) → PUT :id (solo BORRADOR) → POST :vid/submit-review (revisor,deadline,prioridad,checklist) → PUT reviews/:id/assign → PATCH checklist/comments/resolve → POST approve|return|reject → POST :vid/publish → PUBLICADO → archive/unarchive/delete(lógico)`.
3. **Revisor**: `GET reviews/inbox → GET reviews/:id → PUT checklist/:item → POST comments → POST comments/:cid/resolve → POST approve/return/reject`.
4. **Lector**: `GET reader/documents?search/type_id/area_id/... → GET :id → POST :id/read|favorite → GET history|favorites → GET versions/:vid/preview|download`.
5. **Reportes**: `POST reports/generate (filtros fecha/area/tipo/estado/responsable, formato pdf|xlsx) → snapshot S3 + ReporteGenerado → GET reports → GET :id/download (verifica SHA) → schedules CRUD + cron`.
6. **Respaldos**: `PUT backups/config (política/retención) → POST backups (manual, .sdbk AES-GCM→S3) → GET backups → GET :id/download → POST :id/restore (verify|files|full) → POST recovery-test`.
7. **Admin/auditoría**: `GET admin/dashboard → CRUD admin/users|roles|permissions → GET audit?... → GET audit/export|alerts`.

## 24. Integraciones externas
B2/S3 archivos+respaldos+reportes, Render Web/Postgres/Cron, SMTP, stubs M365/Google/Webhook. Sin Oracle/MTV (tesis desalineada según checklist §16), sin MFA, sin webhooks activos.

## 25. Archivos especialmente importantes
`backend/settings.py`, `backend/urls.py`, `documentos/models.py`, `documentos/urls.py`, `documentos/authentication.py|permissions.py|auth_utils.py|reader_access.py|file_validation.py|config_service.py|backup_service.py|notifications.py`, `documentos/{document,workflow,reader,management,audit,reports,backup,settings,notification}_views.py`, `documentos/views.py`, `documentos/management/commands/*`, `documentos/migrations/`, `documentos/tests.py`, `frontend/src/Login.jsx|api.js|documentApi.js|*Dashboard.jsx|Reader*Shell.jsx`, `frontend/{package.json,vite.config.js}`, `.env.example`, `render.yaml`, `build.sh`, `requirements.txt`, `manage.py`, `backend-checklist.txt`, `docs/diagrams/*`, `iniciar-unificado.bat`.
