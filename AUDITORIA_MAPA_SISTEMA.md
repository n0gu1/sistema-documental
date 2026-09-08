# Arquitectura

Mapa estructural obtenido mediante lectura selectiva del código y la configuración. No se ejecutaron pruebas, consultas a la base de datos ni validaciones funcionales. «Encontrado» indica presencia de código y rutas, no funcionamiento comprobado.

Aplicación con frontend SPA y backend monolítico organizado en una aplicación Django (`documentos`). Las vistas REST actúan como controladores; parte de la lógica de negocio está en esas vistas y parte en servicios auxiliares. Persistencia mediante ORM Django y SQL directo sobre el esquema `gestion_documental`.

## Frontend

Tecnología: React 19, JavaScript/JSX, Vite 8 y CSS. Comunicación HTTP mediante `fetch`, cookies y token CSRF.

Carpeta: `frontend/`; código en `frontend/src/`.

Entrada: `main.jsx` → `App.jsx` → `Login.jsx`. El login selecciona los paneles por rol. La navegación observada utiliza estado React y componentes condicionales; no hay dependencia de React Router declarada.

## Backend

Tecnología: Python, Django 5.2.17 y Django REST Framework 3.18.0, según `requirements.txt`. Controladores basados en `APIView`. Entradas WSGI/ASGI; Gunicorn declarado para servir la aplicación.

Carpeta: `backend/` contiene configuración y enrutamiento global; `documentos/` contiene la aplicación de negocio.

## Base de datos

Tecnología: PostgreSQL, configurado mediante `DATABASE_URL` o variables `DB_*`; controlador `psycopg2`. Modelos y SQL apuntan al esquema `gestion_documental`.

Existen modelos administrados por Django y modelos con `managed = False`. Las migraciones están en `documentos/migrations/`. Hay un `db.sqlite3` en la raíz, pero la configuración revisada selecciona PostgreSQL; no se determinó el uso de ese archivo SQLite ni el estado de la base desplegada.

## Autenticación

Descripción breve: autenticación documental propia con `UsuarioDocumental` y `SesionDocumental`. El login usa verificadores de contraseña de Django y entrega un token de sesión mediante cookie `sd_session`, HttpOnly y SameSite=Lax. `CookieTokenAuthentication` busca su hash SHA-256 en la base y comprueba vigencia, revocación, usuario activo e inactividad; aplica CSRF. Hay endpoints de sesión actual, cierre de sesión y cambio de contraseña, además de control de intentos y bloqueo. Django Admin dispone de su infraestructura de autenticación Django por separado.

## Autorización

Descripción breve: permisos por código mediante roles (RBAC), con relaciones usuario–rol y rol–permiso. `user_has_permission` contempla privilegio general para `ADMINISTRADOR`. Se encuentran controles por organización, área y documento, además de restricciones del flujo de revisión. `IsAuthenticatedAndPasswordCurrent` exige autenticación y cambio de contraseña pendiente resuelto; `HasDocumentalPermission` y helpers aplican permisos específicos.

Roles identificados en la interfaz: administrador, editor, revisor y lector. La administración permite gestionar roles y permisos. Los permisos particulares de documentos utilizan la tabla `documentos_roles_permisos`, accedida mediante SQL. No se evaluó la cobertura de estos controles.

## Estructura principal de carpetas

```text
backend/                    Configuración Django, URLs, WSGI y ASGI
documentos/                 Modelos, controladores REST y servicios
  migrations/               Migraciones y evolución del esquema
  management/commands/      Reportes y respaldos programados
frontend/
  src/                      Componentes, paneles, clientes API y estilos
  public/                   Recursos públicos
  dist/                     Compilación del frontend
docs/diagrams/              Documentación gráfica
```

La raíz contiene `manage.py`, `requirements.txt`, `render.yaml`, `build.sh` y scripts de inicio. No se revisaron dependencias instaladas, artefactos compilados ni auditorías anteriores.

## Rutas principales

Enrutamiento global: `backend/urls.py`. Todas las rutas de negocio se declaran en `documentos/urls.py` bajo `/api/`. Los identificadores de entidades en las rutas son UUID.

| Familia | Rutas principales |
|---|---|
| Frontend y administración Django | `/` y fallback SPA; `/admin/` |
| Autenticación | `/api/auth/csrf/`, `login/`, `me/`, `logout/`, `change-password/` |
| Administración | `/api/admin/dashboard/`, `/api/admin/users/`, `/api/admin/roles/`, `/api/admin/permissions/` |
| Usuarios y sesiones | Subrutas de usuario: `status/`, `lock/`, `reset-password/`, `roles/`, `sessions/`; revocación de sesiones y dispositivos |
| Documentos | `/api/documents/`, `catalogs/`, `export/`, `<document_id>/`; subrutas `permissions/`, `archive/`, `unarchive/`, `files/` |
| Versiones | `/api/documents/<document_id>/versions/`; comparación, restauración, descarga; `timeline/` en el documento |
| Revisión | `/api/reviews/inbox/`, `reviewers/`, `<review_id>/`; asignación, aprobación, devolución, rechazo, comentarios y checklist |
| Envío y publicación | `/api/documents/<document_id>/versions/<version_id>/submit-review/` y `publish/` |
| Lectura | `/api/reader/documents/`, `/api/reader/history/`, `/api/reader/favorites/`; lectura, favoritos, descarga y vista previa |
| Notificaciones | `/api/notifications/`, marcado individual y `read-all/` |
| Bitácora | `/api/audit/`, `export/`, `alerts/` |
| Reportes | `/api/reports/`, `generate/`, `<report_id>/download/`, `schedules/` |
| Respaldos | `/api/backups/`, `config/`, `<backup_id>/download/`, `<backup_id>/restore/`, `recovery-test/` |
| Configuración y salud | `/api/settings/`, pruebas SMTP e integraciones; `/api/health/` |

## Middleware

Registrado en `backend/settings.py`, en orden: `SecurityMiddleware`, `WhiteNoiseMiddleware`, `SessionMiddleware`, `CorsMiddleware`, `CommonMiddleware`, `CsrfViewMiddleware`, `AuthenticationMiddleware`, `MessageMiddleware` y `XFrameOptionsMiddleware`.

La autenticación documental personalizada pertenece a DRF, no a esta cadena de middleware. WhiteNoise gestiona estáticos; Django sirve el frontend compilado y contempla `/media/` en modo DEBUG. Vite redirige `/api` a Django durante desarrollo.

## Gestión de archivos

Almacenamiento configurable mediante Django Storage: filesystem (`MEDIA_ROOT`) en desarrollo o S3 mediante `django-storages`/`boto3`; la configuración exige S3 fuera de DEBUG. No se comprobó qué almacenamiento está activo en ejecución.

`ArchivoDocumento` representa versiones en la tabla `versiones_documento`: guarda clave de almacenamiento, proveedor, nombre original, MIME, tamaño, SHA-256, numeración y estado. `Documento` mantiene la referencia de versión vigente. Las cargas se validan en `file_validation.py`; los endpoints de documentos y lector atienden descargas y vistas previas. Reportes y respaldos también tienen persistencia de archivos.

## Modelos/entidades

Definidos en `documentos/models.py`:

| Dominio | Entidades principales |
|---|---|
| Identidad | `UsuarioDocumental`, `SesionDocumental`, `Organizacion`, `Area` |
| Roles y permisos | `RolDocumental`, `PermisoDocumental`, `UsuarioRolDocumental`, `RolPermisoDocumental` |
| Documentos | `Documento`, `MetadatoDocumento`, `ArchivoDocumento`, `ProveedorAlmacenamiento` |
| Catálogos | `TipoDocumento`, `ClasificacionDocumento`, `EstadoDocumento`, `TipoDocumentoCatalogo`, `AreaCatalogo`, `EstadoVersionCatalogo`, `EstadoRevisionCatalogo` |
| Revisión | `SolicitudRevision`, `HistorialEstadoVersion`, `DetalleSolicitudRevision`, `ElementoChecklistRevision`, `ComentarioRevision` |
| Lectura y avisos | `RegistroAccesoDocumento`, `FavoritoDocumento`, `Notificacion` |
| Reportes | `ReporteGenerado`, `ProgramacionReporte` |
| Respaldos y configuración | `Respaldo`, `ConfiguracionRespaldo`, `ConfiguracionSistema` |
| Auditoría | `AccionAuditoria`, `TipoRecursoAuditoria`; eventos en `bitacora_auditoria` mediante SQL directo |

## Servicios principales

| Archivo en `documentos/` | Responsabilidad identificada |
|---|---|
| `auth_utils.py` | Roles, permisos, serialización del usuario y registro de eventos |
| `config_service.py` | Configuración por organización, políticas de seguridad/carga, secretos y SMTP |
| `backup_service.py` | Creación, cifrado, verificación, retención y restauración de respaldos de datos/archivos |
| `reader_access.py` | Acceso por área/documento y selección de publicaciones para lectores |
| `notifications.py` | Creación de avisos y notificaciones del flujo documental |
| `file_validation.py` | Validación de archivos cargados |

La lógica de documentos/versiones, transiciones de revisión y generación de reportes también reside en `document_views.py`, `workflow_views.py` y `reports_views.py`, respectivamente; no hay una capa de servicios separada para todo el sistema.

# Módulos encontrados

| Módulo | Estado |
|---|---|
| Login | ✅ Encontrado |
| Usuarios | ✅ Encontrado |
| Roles | ✅ Encontrado |
| Permisos | ✅ Encontrado |
| Documentos | ✅ Encontrado |
| Versiones | ✅ Encontrado |
| Revisión | ✅ Encontrado |
| Bitácora | ✅ Encontrado |
| Reportes | ✅ Encontrado |
| Respaldos | ✅ Encontrado |

Otros módulos encontrados: paneles por rol, biblioteca del lector, favoritos, historial de lectura, notificaciones y configuración del sistema.

# Archivos importantes

Referencias relativas a la raíz. Rutas comunes: `backend/urls.py` y `documentos/urls.py`. Modelos comunes: `documentos/models.py`.

| Módulo | Controladores principales | Servicios / contratos | Frontend en `frontend/src/` |
|---|---|---|---|
| Login | `documentos/views.py`: `LoginView`, `CurrentUserView`, `LogoutView`, `ChangePasswordView` | `documentos/authentication.py`, `auth_utils.py`, `serializers.py` | `Login.jsx`, `api.js` |
| Usuarios | `documentos/management_views.py`: `UserListCreateView`, `UserDetailView`, `UserRolesView`, vistas de sesiones | `documentos/serializers.py`, `auth_utils.py` | `UsersView.jsx` |
| Roles y permisos | `documentos/management_views.py`: `RoleListCreateView`, `RoleDetailView`, `RolePermissionsView`, `PermissionListView`, `PermissionDetailView` | `documentos/permissions.py`, `auth_utils.py`, `serializers.py` | `RolesView.jsx` |
| Documentos | `documentos/document_views.py`: `DocumentListCreateView`, `DocumentDetailView`, `DocumentPermissionsView`, `DocumentFileListCreateView` | `documentos/document_serializers.py`, `file_validation.py`, `reader_access.py` | `DocumentsView.jsx`, `EditorDocumentsView.jsx`, `EditorDocumentEditView.jsx`, `DocumentPermissionsPanel.jsx`, `documentApi.js` |
| Versiones | `documentos/document_views.py`: `DocumentVersionListView`, `DocumentVersionRestoreView`, `DocumentVersionCompareView`, `DocumentVersionTimelineView` | `documentos/document_serializers.py` | `VersionsView.jsx`, `EditorVersionsView.jsx`, `ReviewerVersionComparisonView.jsx` |
| Revisión | `documentos/workflow_views.py`: `ReviewSubmitView`, `ReviewInboxView`, `ReviewAssignmentView`, `ReviewDecisionView`, `VersionPublishView` | Serializadores y transiciones en el mismo archivo; `documentos/notifications.py` | `ReviewerReviewInboxView.jsx`, `ReviewerDocumentReviewView.jsx` |
| Bitácora | `documentos/audit_views.py`: `AuditListView`, `AuditExportView`, `AuditAlertsView` | `documentos/auth_utils.py` | `AuditView.jsx`, `EditorActivityLogView.jsx`, `ReviewerPersonalLogView.jsx` |
| Reportes | `documentos/reports_views.py`: `ReportListView`, `ReportGenerateView`, `ReportDownloadView`, vistas de programación | Generadores en el mismo archivo; `documentos/management/commands/generar_reportes_programados.py` | `ReportsView.jsx`, `EditorBasicReportsView.jsx`, `ReviewerBasicReportsView.jsx` |
| Respaldos | `documentos/backup_views.py` | `documentos/backup_service.py`, `documentos/management/commands/generar_respaldos_programados.py` | `BackupsView.jsx` |
| Lectura | `documentos/reader_views.py` | `documentos/reader_access.py` | `ReaderDashboard.jsx`, `ReaderLibraryView.jsx`, `ReaderDocumentView.jsx`, `ReaderFavoritesView.jsx`, `ReaderReadingHistoryView.jsx`, `ReaderVersionHistoryView.jsx` |
| Notificaciones | `documentos/notification_views.py` | `documentos/notifications.py` | Paneles por rol |
| Configuración | `documentos/settings_views.py` | `documentos/config_service.py` | `SettingsView.jsx` |

Puntos de entrada y configuración para próximas etapas: `backend/settings.py`, `requirements.txt`, `frontend/package.json`, `frontend/vite.config.js`, `frontend/src/App.jsx`, `frontend/src/Login.jsx` y los paneles `Dashboard.jsx`, `EditorDashboard.jsx`, `ReviewerDashboard.jsx`, `ReaderDashboard.jsx`. Evolución de datos: `documentos/migrations/`.

Fin de la etapa: mapa arquitectónico. La corrección funcional y la seguridad de cada operación quedan sin evaluar.
