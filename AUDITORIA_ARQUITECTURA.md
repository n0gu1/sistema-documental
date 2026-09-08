# AUDITORIA_ARQUITECTURA — Sistema Documental

> Alcance: solo arquitectura general (separación responsabilidades, capas, acoplamiento, cohesión, circulares, tamaño, duplicación, lógica mal ubicada). No es auditoría de seguridad. Base: `AUDITORIA_CONTEXTO.md` + inspección estática de `backend/`, `documentos/`, `frontend/src/`.
> Fecha: 2026-09-05.

## 1. Arquitectura observada (real, no la declarada)

- **Monolito Django + SPA servida por Django.** Una sola app Django `documentos` (~30 módulos). Sin capas `controller/service/repository/domain`: las `*views.py` llaman directo a `models`, `default_storage`, `connection.cursor()`, a otras `*views.py` y a `record_auth_event`.
- **Capas planas:**
  - `backend/urls.py` → `documentos/urls.py` (110 lín, ~70 rutas) → `*views.py` (APIView) → `models.py` + `default_storage` + SQL crudo.
  - Servicios parciales: `backup_service.py`, `config_service.py`, `notifications.py`, `auth_utils.py`, `reader_access.py`, `file_validation.py`. No hay servicio documental/workflow/reporte/auditoría; esa lógica vive en vistas.
  - Serializadores (`serializers.py`, `document_serializers.py`) hacen validación + `sanitize_text` + `security_policy_for` (regla negocio).
  - Frontend sin router/store: `App.jsx → Login.jsx` despacha por `role.code` con `useState` y `fetch` directo.
- **Tamaños medidos (líneas):** `tests.py` 2416, `backup_service.py` ~1256, `document_views.py` 1205/1077 según conteo, `management_views.py` 916-1013, `models.py` 839, `DocumentsView.jsx` 776-790, `workflow_views.py` 659-753, `EditorDocumentsView.jsx` 557-570, `reports_views.py` 504-583, `Login.jsx` 358, `views.py` 284, `backup_views.py` 271, `reader_views.py` 259, `audit_views.py` 250-278, `config_service.py` 238-262.

## 2. Mapa de dependencias entre capas (evidencia `grep ^from .`)

```
workflow_views → document_views (get_document_or_404, record_document_event) + management_views (require_permission) + notifications + reader_access
document_views → management_views (require_permission) + audit_views (audit_timestamp_column) + reader_access + file_validation + serializers
reports_views / backup_views / settings_views → management_views (require_permission)
authentication → auth_utils (record_auth_event) + config_service (security_policy_for)
serializers → config_service (security_policy_for)
config_service → backup_service (backup_key)
notifications → config_service (get_system_config, smtp_connection_for)
management command generar_reportes_programados → reports_views (build_report_data, persist_report_snapshot) + fabrica SimpleNamespace(user) como request
```

- No hay ciclo de `import` que rompa Python, pero sí **estrella vista→vista** con `management_views` como hub y **inversión comando→vista**.
- No hay violación import circular directa; el riesgo es acoplamiento lógico y rigidez.

## 3. Tabla resumen

| ID | Severidad | Archivo(s) | Tema |
|----|-----------|------------|------|
| A01 | CRÍTICO | `documentos/document_views.py`, `workflow_views.py` | Lógica negocio + persistencia + storage + auditoría en controlador |
| A02 | ALTO | `document_views.py` (1205), `management_views.py` (~1013), `workflow_views.py` (~753) | Controladores excesivamente grandes |
| A03 | ALTO | `documentos/backup_service.py` (~1256) | Servicio excesivamente grande / múltiples responsabilidades |
| A04 | ALTO | `documentos/models.py` (839, ~30 modelos) | God file anémico, baja cohesión |
| A05 | ALTO | `workflow_views.py:13-14`, `document_views.py:20,23`, `reports/backup/settings_views` | Dependencia vista→vista, hub `management_views` |
| A06 | ALTO | `management/commands/generar_reportes_programados.py:9,32-33` | Comando depende de vista + request falso |
| A07 | MEDIO | `serializers.py:43-53`, `document_serializers.py`, `workflow_views.py:53-115` | Regla negocio en capa serialización |
| A08 | MEDIO | `document_views.py:66`, `reports_views.py:52`, `audit_views.py:62`, `reader_views.py:32` | Responsabilidades duplicadas (parse fecha/filtros) |
| A09 | MEDIO | `frontend/src/Login.jsx` (358) | Componente con demasiadas responsabilidades |
| A10 | MEDIO | `DocumentsView.jsx` (790), `EditorDocumentsView.jsx` (570), `ReaderLibraryView.jsx` (414) | Duplicación frontend listados/filtros/iconos |
| A11 | MEDIO | `config_service.py:15`, `authentication.py:10`, `serializers.py:6` | Dependencias cruzadas config↔backup, cadena auth→config→backup |
| A12 | MEDIO | `documentos/tests.py` (2416), `documentos/urls.py` (110), `admin.py` (3, vacío) | Módulo pruebas monolítico, rutas monolíticas, admin muerto |
| A13 | BAJO | `backend/urls.py:29-42` | Entrega frontend acoplada al API (I/O bloqueante, MIME manual) |
| A14 | BAJO | `auth_utils.py` (143), `reader_access.py` (130) | Utilidades con cohesión mixta (RBAC+auditoría+IP / ACL+queryset+auditoría) |
| A15 | MEJORA | transversal ORM+`connection.cursor()` | Sin capa repositorio/abstracción persistencia |

---

## 4. Hallazgos detallados

### A01 — CRÍTICO — Lógica de negocio en controlador + acceso directo a storage/DB/auditoría
- **Archivo:** `documentos/document_views.py`, `documentos/workflow_views.py`
- **Componente:** `DocumentListCreateView`, `save_document_file()`, `record_document_event()`, `transition_version()`
- **Problema:** Violación de arquitectura en capas: el controlador orquesta regla versionamiento, transacción, escritura storage, creación modelos y auditoría. No existe capa servicio/dominio documental.
- **Evidencia:**
  - `document_views.py:423-473 `save_document_file()`: `validate_uploaded_file()` + query `ProveedorAlmacenamiento/EstadoVersionCatalogo` + `transaction.atomic()` + `select_for_update()` + `default_storage.save()` + `ArchivoDocumento.objects.create()` + `HistorialEstadoVersion.objects.create()` + `default_storage.delete()` en `except`, todo en módulo vista.
  - `document_views.py:415-420 `next_version_numbers()`, `workflow_views.py:218 `transition_version()`, `document_views.py:476-488 `record_document_event()` definidas en vistas e importadas por otras vistas (`workflow_views.py:13`).
  - `document_views.py:8-10` importa `File/default_storage/connection/transaction` directo en vista.
- **Impacto:** Imposible reutilizar/testear regla versionamiento sin HTTP; cambio storage/auditoría rompe controladores; `workflow_views` queda atado a implementación `document_views`.
- **Solución recomendada:** Extraer `services/document_service.py` (`create_document`, `add_version`, `restore_version`, `transition`) + `services/audit_service.py`; vistas solo parsean request, llaman servicio, mapean response. Mover `next_version_numbers/save_document_file/transition_version/record_document_event` allí.

### A02 — ALTO — Controladores excesivamente grandes
- **Archivo:** `documentos/document_views.py` (~1205 lín, 14 vistas), `documentos/management_views.py` (~1013 lín, 16 vistas), `documentos/workflow_views.py` (~753 lín, 12 vistas)
- **Componente:** Capa API entera por dominio
- **Problema:** Cada fichero mezcla routing implícito, validación, queryset, permisos, storage, auditoría, export CSV, preview/download. Cohesión baja, fricción de merge alta.
- **Evidencia:** Conteo §1; `document_views.py:50-488` helpers + constantes (`READ_PERMISSION`, `PREVIEWABLE_MIMES`, `DIRECT_EDIT_BLOCKED_STATES`) + 14 `class *View(APIView)`; `management_views.py:1-52` imports 10 modelos + 9 serializadores + `require_permission` + dashboard + usuarios + roles + permisos en un fichero.
- **Impacto:** Curva aprendizaje alta, regresiones fáciles, tests obligados a importar vistas gigantes.
- **Solución recomendada:** Dividir por recurso: `documents/{views_list.py,views_detail.py,views_versions.py,views_files.py,views_permissions.py}`, `management/{views_users.py,views_roles.py,views_dashboard.py}` + `permissions/require_permission.py` compartido. Meta <300 lín/fichero.

### A03 — ALTO — Servicio excesivamente grande
- **Archivo:** `documentos/backup_service.py` (~1256 lín)
- **Componente:** `backup_key/encrypt_archive/decrypt_archive/database_table_names/create_backup/restore/...`
- **Problema:** Un servicio hace cripto (`AESGCM`), zip (`.sdbk` `SDBK1`), introspección `information_schema`, snapshot transaccional por org (`GLOBAL_BACKUP_TABLES`, `BACKUP_RELATIONS`), validación hashes, retención, restore upsert, logging.
- **Evidencia:** `backup_service.py:1-100` constantes + `BackupExecutionError` + imports `AESGCM/ZipFile/connection/transaction/default_storage`; `backup_service.py:128-155` `backup_key/encrypt/decrypt`; `1223 create_backup()` + ~1100 lín restantes.
- **Impacto:** Cambio de cifrado o retención obliga a tocar snapshot/restore; difícil test unitario aislado.
- **Solución recomendada:** Dividir en `backups/crypto.py`, `backups/snapshot.py`, `backups/restore.py`, `backups/retention.py`, `backups/service.py` fachada. Inyectar `key_provider` y `storage`.

### A04 — ALTO — Modelo god file anémico
- **Archivo:** `documentos/models.py` (839 lín)
- **Componente:** ~30 modelos
- **Problema:** Un fichero contiene bounded contexts distintos (auth/sesiones, org/áreas, catálogos, documentos/versiones, workflow/revisiones, reportes, respaldos, config, lector, notificaciones). Modelos anémicos (solo campos + `__str__`, salvo `is_authenticated/is_active` en `UsuarioDocumental:35-44`); reglas (`versionado`, `transiciones`, `vigencia roles`) fuera del dominio.
- **Evidencia:** `models.py:12-956` clases `UsuarioDocumental/SesionDocumental/Organizacion/Area/TipoDocumento/.../Documento/Metadato/Archivo/SolicitudRevision/Reporte/Respaldo/Configuracion/Acceso/Favorito/Notificacion`; `admin.py` vacío (dominio no expuesto ni gestionado como tal).
- **Impacto:** Acoplamiento de despliegue: tocar lector obliga a recompilar auth; `managed=False` + `managed=True` mezclados oscurecen propiedad esquema.
- **Solución recomendada:** Paquete `documentos/models/{auth.py,org.py,docs.py,workflow.py,reports.py,backups.py,audit.py,reader.py,notifications.py}` + `managers.py`/`domain methods` (`document.add_version()`, `version.transition_to()`). Separar `managed=False` legacy en `legacy_models.py`.

### A05 — ALTO — Dependencias vista→vista / hub innecesario
- **Archivo:** `documentos/workflow_views.py:13-14`, `documentos/document_views.py:20,23`, `documentos/reports_views.py:23`, `backup_views.py:24`, `settings_views.py:13`
- **Componente:** `require_permission`, `get_document_or_404`, `record_document_event`, `audit_timestamp_column`
- **Problema:** Reutilización horizontal incorrecta: vistas importan funciones de otras vistas en vez de servicios compartidos. `management_views.require_permission` convierte administración en dependencia de documentos/reportes/respaldos.
- **Evidencia:** Líneas citadas en mapa §2; `document_views.py:20 from .audit_views import audit_timestamp_column`.
- **Impacto:** Cambio en `management_views` (ej. firma `require_permission`) rompe 5 módulos; ciclos lógicos latentes; test de `workflow` carga `document` + `management`.
- **Solución recomendada:** Crear `documentos/services/{permissions.py (require_permission), documents.py (get_document_or_404), audit.py (timestamp_column, record_*)}`; vistas solo importan servicios, nunca otras vistas.

### A06 — ALTO — Acceso incorrecto entre capas: comando → vista
- **Archivo:** `documentos/management/commands/generar_reportes_programados.py`
- **Componente:** `Command.handle()`
- **Problema:** Capa infraestructura (cron) depende de capa presentación (vista). Fabrica `SimpleNamespace(user=user)` para fingir `request` y llama `build_report_data(request,...)` / `persist_report_snapshot()` definidos en `reports_views.py`.
- **Evidencia:** `generar_reportes_programados.py:9 from documentos.reports_views import build_report_data, persist_report_snapshot`; `:32-33 request = SimpleNamespace(user=user); data = build_report_data(request, schedule.alcance, schedule.filtros)`.
- **Impacto:** No se puede cambiar firma HTTP sin romper cron; imposible ejecutar reportes sin cargar DRF; `request` falso oculta dependencias reales (org, permisos, filtros).
- **Solución recomendada:** Mover `build_report_data/persist_report_snapshot` a `services/report_service.py` con firma `(organization_id, user_id, scope, filters)`; vista y comando llaman al servicio.

### A07 — MEDIO — Lógica negocio en serializadores
- **Archivo:** `documentos/serializers.py:21-55`, `documentos/document_serializers.py:3,22-50`, `documentos/workflow_views.py:53-115`
- **Componente:** `ChangePasswordSerializer.validate()`, `DocumentCreate/Update/FileSerializer`
- **Problema:** Serialización (transporte) decide política (`security_policy_for`, `min_length`, `complexity high` exige mayús/min/num/símbolo) además de `validate_password` Django. Duplica fuente de verdad con `config_service.DEFAULTS`.
- **Evidencia:** `serializers.py:43 policy = security_policy_for(...); 45-53 checks longitud/complejidad`; `document_serializers.py:3 from .security_utils import sanitize_text` + `validate_* → sanitize_text`.
- **Impacto:** Cambiar política exige tocar serializadores; uso programático (comando, tests) salta regla o la duplica.
- **Solución recomendada:** `services/password_policy.py::assert_valid(user, new_password)`; serializador solo delega. Centralizar `sanitize_text` en un `fields.SanitizedCharField`.

### A08 — MEDIO — Responsabilidades duplicadas (fechas/filtros/sanitización)
- **Archivo:** `documentos/document_views.py:66,78`, `reports_views.py:52`, `audit_views.py:62`, `reader_views.py:32`, `serializers.py:80-197`, `workflow_views.py:77-115`
- **Componente:** `parse_*_datetime`, `apply_document_filters`, `validate_* → sanitize_text`
- **Problema:** 4 parsers ISO (`parse_filter_date`, `parse_report_datetime`, `parse_audit_datetime`, `parse_reader_date`) idénticos salvo nombre; 15+ `validate_*` solo hacen `return sanitize_text(value)`.
- **Evidencia:** `grep sanitize_text` 20+ hits; `grep def parse_.*date` 4 hits con mismo `datetime.fromisoformat + make_aware`.
- **Impacto:** Bug de zona horaria se corrige 4 veces; inconsistencias filtros lector vs docs vs reportes.
- **Solución recomendada:** `common/dates.py::parse_iso_range(value, field)` + `common/serializers.py::SanitizedCharField`; `documents/filters.py` único reutilizado por lector/reportes.

### A09 — MEDIO — Frontend: componente con demasiadas responsabilidades
- **Archivo:** `frontend/src/Login.jsx` (358 lín)
- **Componente:** `Login` + `Brand/LockIcon/ShieldIcon/DocumentIcon/DocumentIllustration`
- **Problema:** Un componente hace auth (`/auth/me|login|logout|change-password`), gate `must_change_password`, routing por roles (`isAdministrator/isEditor/isReviewer/isReader`), y navegación lector (`libraryOpen/documentOpen/historyOpen/readingOpen/favoritesOpen` + `openReaderView`). Sin router.
- **Evidencia:** `Login.jsx:180-283` efectos + 3 handlers + 4 flags rol + 5 flags vista + render condicional anidado; `App.jsx:3 return <Login/>` (toda la app cuelga de Login).
- **Impacto:** Cambio de navegación rompe login; imposible deep-link/bookmark; test requiere montar auth+dashboards.
- **Solución recomendada:** Introducir `react-router` (o `wouter`) + `AuthContext` + `ProtectedRoute per role` + `ReaderLayout`; `Login.jsx` solo formulario.

### A10 — MEDIO — Duplicación frontend y cohesión baja
- **Archivo:** `frontend/src/DocumentsView.jsx` (790), `EditorDocumentsView.jsx` (570), `ReaderLibraryView.jsx` (414), `documentApi.js`
- **Componente:** Listados documentales + iconos SVG
- **Problema:** Tres listados reimplementan búsqueda/filtros/orden/paginación (`PAGE_SIZE 25 vs 10`), `typeTones`, `*Icon()` SVG inline duplicados. Solo `buildDocumentQuery/normalizeDocument` está compartido.
- **Evidencia:** `DocumentsView.jsx:1-80` y `EditorDocumentsView.jsx:14-60` definen `*Icon({name})` casi idénticos; ambos importan `buildDocumentQuery` pero mantienen `PAGE_SIZE` y estados filtro propios.
- **Impacto:** Fix UI/filtro se triplica; bundle >500KB (nota checklist) por no compartir/lazy-load.
- **Solución recomendada:** `components/DocumentTable.jsx` + `components/DocumentFilters.jsx` + `components/icons.jsx`; prop `mode={admin|editor|reader}`; `React.lazy()` por dashboard.

### A11 — MEDIO — Componentes innecesariamente dependientes (cadena config)
- **Archivo:** `documentos/config_service.py:15`, `documentos/authentication.py:10`, `documentos/serializers.py:6`, `documentos/notifications.py:9`
- **Componente:** `security_policy_for / backup_key / smtp_connection_for`
- **Problema:** `config_service` (infra/config) importa `backup_key` de `backup_service` (dominio respaldo). Luego `authentication`, `serializers`, `views` dependen de `config_service`. Resultado: autenticar requiere cargar cripto de respaldos; cambiar cifrado respaldos riesgo en login.
- **Evidencia:** `config_service.py:15 from .backup_service import backup_key`; `authentication.py:10 from .config_service import security_policy_for`; `serializers.py:6` igual.
- **Impacto:** Acoplamiento transversal, ciclos conceptuales, tests auth cargan backup.
- **Solución recomendada:** `core/crypto.py::backup_key()` + `core/config.py`; `backup_service` y `config_service` dependen de `core`, no entre sí. Inyectar `policy_provider` en `CookieTokenAuthentication`.

### A12 — MEDIO — Módulos infraestructura monolíticos / muertos
- **Archivo:** `documentos/tests.py` (2416 lín), `documentos/urls.py` (110 lín), `documentos/admin.py` (3 lín)
- **Componente:** Suite pruebas, routing, admin Django
- **Problema:** `tests.py` único mezcla auth/docs/workflow/lector/reportes/respaldos (baja cohesión, colisiones); `urls.py` concentra ~70 rutas una app (deberían ser routers por dominio); `admin.py` vacío desperdicia inspección/debug Django.
- **Evidencia:** Conteos §1; `urls.py:3-12 from . import views, management_views, ... (10 módulos)` + `14-111 urlpatterns`; `admin.py:1-3` solo comentario.
- **Impacto:** CI lento/frágil, rutas difíciles de auditar por dominio, sin backoffice emergencia.
- **Solución recomendada:** `tests/{test_auth.py,test_docs.py,test_workflow.py,...}`; `documentos/urls/{auth.py,documents.py,workflow.py,...}` + `include()`; registrar al menos `Organizacion/Documento` en `admin.py` read-only.

### A13 — BAJO — Acceso incorrecto entrega/API
- **Archivo:** `backend/urls.py:12-42`
- **Componente:** `serve_react()`
- **Problema:** Django API hace también de servidor estático con I/O bloqueante por request (`open(...,'rb').read()`), `MIME_TYPES` manual, `os.path.isfile` sin caché ni `WhiteNoise`/`static()` para `frontend/dist`. Mezcla entrega SPA con API.
- **Evidencia:** `urls.py:33-36 with open(file_path,'rb') as f: return HttpResponse(f.read(),...)`; `re_path(r'^(?!api/|static/).*$', serve_react)`.
- **Impacto:** Latencia y memoria bajo carga; MIME desactualizado rompe assets; confunde `STATICFILES_DIRS` + `TEMPLATES DIRS` + vista manual (3 mecanismos).
- **Solución recomendada:** Servir `dist` vía `WhiteNoise`/`STATICFILES` o CDN/Render Static; dejar Django solo `/api/` + `/admin/`; o usar `django.views.static.serve` con caché en dev y CDN en prod.

### A14 — BAJO — Utilidades con cohesión mixta
- **Archivo:** `documentos/auth_utils.py` (143 lín), `documentos/reader_access.py` (130 lín)
- **Componente:** `get_user_roles/user_has_permission/record_auth_event/get_client_ip`, `has_*_permission/published_*_queryset/record_reader_access`
- **Problema:** Cada fichero mezcla 3 ejes: RBAC + auditoría + red (`get_client_ip`), o ACL + queryset + auditoría. Cohesión funcional media-baja.
- **Evidencia:** `auth_utils.py:10 get_client_ip + :20 get_user_roles + :78 record_auth_event + :146 record_access_denied`; `reader_access.py:89 published_document_queryset + :32 has_document_permission (SQL ACL) + :119 record_reader_access (crea Acceso + evento)`.
- **Impacto:** Reuso parcial arrastra dependencias (importar permiso trae logging/IP); tests necesitan DB+request.
- **Solución recomendada:** `rbac.py`, `audit_log.py`, `http.py` separados; `reader/permissions.py` vs `reader/querysets.py` vs `reader/tracking.py`.

### A15 — MEJORA — Sin abstracción persistencia
- **Archivo:** transversal `documentos/*views.py`, `auth_utils.py`, `reader_access.py`, `audit_views.py`, `backup_service.py`
- **Componente:** `Documento.objects.*` + `connection.cursor()` SQL (`gestion_documental.*`)
- **Problema:** SQL crudo (RBAC, bitácora, ACL, `audit_timestamp_column` vía `information_schema`) entremezclado con ORM en vistas. Sin repositorio/DAO; esquema `managed=False` filtra a capas altas.
- **Evidencia:** `auth_utils.py:21-54` SQL `usuarios_roles/roles_permisos`; `reader_access.py:35-60` SQL `documentos_roles_permisos`; `audit_views.py:36-50` SQL `information_schema`; `models.py` mezcla `managed`/`unmanaged`.
- **Impacto:** Cambiar esquema/ORM exige tocar vistas; mock DB en tests costoso; `audit_timestamp_column` introspección por request.
- **Solución recomendada:** `repositories/{rbac_repo.py,audit_repo.py,document_repo.py}` con interfaz; vistas/servicios dependen de interfaz; cachear `audit_timestamp_column` con `@lru_cache`.

## 5. Veredicto global

- **Separación responsabilidades: DÉBIL.** Controladores hacen servicio+repositorio+infra; serializadores hacen política; comandos llaman vistas; frontend mezcla auth+routing.
- **Acoplamiento: ALTO** (estrella a `management_views` + `document_views` + `config/backup`). **Cohesión: MEDIA-BAJA** (ficheros >500 lín con 3-5 ejes).
- **Circulares import: NO** (no rompería arranque), pero **circulares lógicas SÍ** (vista↔vista vía helpers, config↔backup conceptual).
- **Violación principal:** arquitectura en capas anunciada (DRF+React+Postgres) implementada como **monolito plano transaccional-script** (Transaction Script en vistas + modelo anémico).
- **Prioridad:** A01→A06→A02/A03/A04→A07/A08→A09/A10→resto. Sin esto, cualquier auditoría seguridad o escalado multiplicará costo.
