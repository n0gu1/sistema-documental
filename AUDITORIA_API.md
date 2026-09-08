# AUDITORIA_API — APIs, endpoints y comunicación

> Alcance: únicamente APIs/endpoints/comunicación (REST, GraphQL, RPC, WebSockets, eventos, colas, servicios internos, integraciones externas). Sin lógica de negocio profunda (ver `AUDITORIA_BACKEND.md`). Base: `documentos/urls.py` (112 rutas), `frontend/src/api.js`, `documentApi.js`, `*View.jsx`, `documentos/*views.py`, `serializers.py`.
> Fecha: 2026-09-05.

## 1. Inventario de estilos

| Estilo | Estado | Evidencia |
|---|---|---|
| REST (DRF `APIView`) | **Único estilo real** — ~70 rutas bajo `/api/` + `admin/` Django | `documentos/urls.py:15-111` |
| GraphQL | **No existe** (sin `graphene/strawberry`, sin `/graphql`) | `grep graphql` solo en auditorías |
| RPC | **No existe** como estilo (solo `POST` estilo-RPC sobre REST, ver P02) | — |
| WebSockets | **No existe** (sin `channels`, sin `consumers/routing`, polling por `fetch`) | `grep channels/websocket` vacío en código |
| Eventos / colas | **No hay bus** (sin `celery/redis/kafka`; notificaciones síncronas en request; crons Render invocan `management/commands`) | `notifications.py:45-70` crea + `send_mail` en línea |
| Servicios internos | **Síncronos en-proceso**: `auth_utils`, `reader_access`, `config_service`, `backup_service`, `notifications` importados directo (ver arquitectura A05) | `grep ^from .` |
| Integraciones externas | **S3-compatible (Backblaze B2 via `boto3/django-storages`)** + **SMTP** + stubs `microsoft365/google_workspace/webhook` (solo test) | `settings.py:224-236`, `config_service.py:243-262`, `settings_views.py:74-136` |

**Transporte:** `fetch credentials:include` + cookie `sd_session` + `X-CSRFToken` desde `GET /api/auth/csrf/` antes de cada mutación (`api.js:14-19`). Descargas binarias vía `window.open(href)` (cookies) o `FileResponse` Django, **no** URLs prefirmadas S3. Sin `AbortController`/timeout/retry en `apiRequest`.

## 2. Tabla resumen

| ID | Severidad | Zona | Problema |
|----|-----------|------|----------|
| P01 | ALTO | Contratos A↔B | `normalizeDocument` espera `version.version/download_url/reviewer` que `serialize_document` no devuelve → `—`/null siempre |
| P02 | ALTO | Rutas/verbos | `POST` para todo lo que muta (status/lock/revoke/assign/approve/read/favorite) + duplicadas `files/` vs `versions/` |
| P03 | ALTO | Idempotencia/duplicación | `POST` no idempotentes sin `Idempotency-Key` (backups, `generate`, `submit-review`, `comments`, `restore`) + `api.js` sin retry/timeout |
| P04 | MEDIO | Formatos | 4 sobres (`{results}`, `{rows+history}`, `{backups,...}`, `{roles}`) + claves ES/EN mezcladas + `download_url` relativa vs absoluta |
| P05 | MEDIO | Errores/HTTP | Códigos correctos pero 4 formatos (`{code,detail}`, `{field:[...]}`, `{detail}`, `{valid,detail}`) + `Http404` vacío + `415` solo preview + `500` backup |
| P06 | MEDIO | Paginación/límites | `limit/offset/count/next_offset` solo en listados grandes; `roles/permissions/schedules/catalogs/dashboard` sin paginar; `limit` ignorado en silencio |
| P07 | MEDIO | Filtros/orden | Nombres distintos por recurso (`updated_from` vs `date_from`, `responsible_id` solo docs) + `ordering` desconocido cae a fecha en silencio |
| P08 | MEDIO | Parámetros/tipos | Frontend mapea por `name`→`id` (colisión) y envía nombre crudo si no encuentra; backend no valida UUID en filtros |
| P09 | MEDIO | Binarios/CSRF | `apiRequest` hace `response.json()` siempre → binarios rompen a `{}`; cada mutación paga un `GET csrf` sin caché/retry |
| P10 | MEDIO | Exposición/sensibles | Catálogo completo a lectores, `responsibles` enumera usuarios, `management_user` expone `failed_attempts`, `temporary_password` en claro, `ip/UA` en auditoría/historial |
| P11 | BAJO | Protegidos | Solo `csrf/login/health` abiertos (correcto); resto `IsAuthenticated` — sin hallazgo, vigilar `export` por `window.open` |
| P12 | BAJO | Timeouts | Sin timeout cliente ni `statement_timeout`; `gunicorn` 30s vs backups/reportes/S3 que tardan minutos → 502/wipe |
| P13 | MEJORA | Compatibilidad general | Documentar OpenAPI + alinear `code/title` vs `codigo/nombre` + unificar `snake_case` |

---

## 3. Hallazgos detallados

### P01 — ALTO — Frontend espera A, backend devuelve B: `version/downloadUrl/reviewer` siempre vacíos
- **Archivos:** `frontend/src/documentApi.js:12-29` vs `documentos/document_views.py:234-262`
- **Componente:** `normalizeDocument()` ↔ `serialize_document()`
- **Problema:** `normalizeDocument` lee `document.version?.version`, `document.version?.download_url`, `document.reviewer?.name`, `document.type?.id`, `document.status?.code`. `serialize_document` devuelve `code/title/description/date/area{id,name}/type{id,code,name}/status{id,code,name}/responsible/created_at/updated_at/archived_at (+metadata/files si details)` — **sin** `version` objeto, **sin** `download_url`, **sin** `reviewer`. Resultado: `version:'—'`, `downloadUrl:null`, `reviewer:'—'` en `DocumentsView/EditorDashboard`.
- **Evidencia:** `documentApi.js:20 version: document.version?.version || '—'`, `:26 downloadUrl: document.version?.download_url || null`, `:28 reviewer: ... || '—'`; `document_views.py:234-256` sin esas claves. Reader sí devuelve `version{version,download_url}` (`reader_views.serialize_reader_version`) pero como `version:'1.0'` string, luego `version.version` vuelve a ser `undefined`.
- **Impacto:** Columna versión/descarga/revisor vacía en listados admin/editor; `downloadFile(null)` no hace nada; confusión con lector donde sí hay URLs.
- **Solución:** Añadir a `serialize_document`: `version{version,download_url,preview_url,is_current,id}+reviewer{name}` o cambiar frontend a `status/version` real; test de contrato (`assert document.version.version`).

### P02 — ALTO — Rutas/verbos incorrectos + operaciones duplicadas
- **Archivo:** `documentos/urls.py:23-107`
- **Componente:** Toda la API
- **Problema:** REST incorrecto pero consistente con frontend (no rompe hoy): updates via `POST` (`status/lock/reset-password/sessions/revoke/devices/revoke/assign/approve/return/reject/comments/checklist/publish/submit-review/restore/recovery-test/read/favorite`), `PATCH` solo en `document/checklist-item/role/permission/schedule`, `PUT` solo en `user-roles/document-permissions/role-permissions`. Duplicadas: `POST documents/:id/files/` y `POST documents/:id/versions/` hacen lo mismo (`save_document_file`); `GET files/:id/download` vs `GET versions/:id/download` bifurcan por `is_reader` con permisos distintos (`descargar` vs `consultar`).
- **Evidencia:** `urls.py:42-43` dos creates; `document_views.py:760-780 vs 798-818` idénticos salvo clave respuesta (`file` vs `version`).
- **Impacto:** Doble superficie que mantener, semántica confusa (`file` vs `version`), clientes eligen arbitrariamente.
- **Solución:** Unificar en `POST versions/` (alias `files/` deprecated 1 versión), usar `PUT/PATCH` para updates idempotentes, publicar tabla método→idempotente.

### P03 — ALTO — Sin timeouts/reintentos/idempotencia → duplicación ante retry
- **Archivos:** `frontend/src/api.js:9-30`, `documentos/backup_views.py:137-155`, `reports_views.py:456-479`, `workflow_views.py:321-384`
- **Problema:** `apiRequest` sin `AbortController`, sin timeout, sin retry, sin `Idempotency-Key`. Cada mutación hace antes `GET /api/auth/csrf/` (doble fallo posible, sin reintento del original). Backend `POST /backups/`, `POST /reports/generate/`, `POST .../submit-review/`, `POST .../comments/`, `POST .../restore/` crean filas siempre → doble click / timeout+retry = duplicados (doble respaldo `.sdbk`, doble reporte, doble `PENDIENTE`, doble comentario).
- **Evidencia:** `api.js` sin `signal/timeout`; `BackupsView.jsx:78 POST /backups/` con solo flag `saving` local.
- **Impacto:** Costo S3/DB, revisiones fantasma (ver B04/B05), cobro Render.
- **Solución:** `AbortController` (15s lecturas, 120s subidas), retry solo en `GET`/idempotentes, `Idempotency-Key: uuid` en `POST` con tabla `idempotency_keys(key, response)` 24h.

### P04 — MEDIO — Formatos inconsistentes + bilingüe ES/EN
- **Archivos:** `document_views.py:511-533,793-796`, `reports_views.py:443-450`, `backup_views.py:113-133`, `management_views.py:330-336,710`, `reports_views.py:287-300`
- **Problema:** Listados grandes → `{count,next_offset,results}`; reportes → `{scope,filters,summary,options,rows + history}` (sin `count`); backups → `{backups,restore_points,alerts,config,destinations,recovery_plan,metrics}`; roles/permissions/schedules/catalogs → `{roles}/{permissions}/{schedules}/{areas,types,...}}` sin paginar. Claves mezcladas: backend `codigo/nombre` vs frontend `code/title/name`; `RolesView.jsx:66-69` hace `role.nombre||role.name`, `permission.module||modulo` como parche. `download_url` relativa (`/api/reports/:id/download/`) vs absoluta (`build_absolute_uri` en documentos/lector).
- **Impacto:** Cada vista necesita adaptador; `||` oculta qué contrato manda.
- **Solución:** Envolvente única `{data,meta:{count,next_offset}}` + `snake_case` + URLs absolutas (o todas relativas); OpenAPI `drf-spectacular`.

### P05 — MEDIO — Códigos HTTP bien, formatos de error dispares, `404` mudo
- **Archivos:** `document_views.py:545,669,1154`, `backup_views.py:152,272,294`, `management_views.py:400`
- **Problema:** Aciertos: `201` creates, `204` deletes/logout, `409` conflictos, `422` verify, `415` preview. Dispersión: `409 {code,detail}` vs `400 {field:[msg]}` (DRF) vs `404 {detail}` plano (sin `code`, p. ej. `Usuario no encontrado`) vs `422 {valid,detail}`. `Http404` sin cuerpo en `get_document_or_404`/`get_review_or_404` (intencional anti-oráculo, pero cliente no distingue “no existe” de “sin permiso”). `api.js:errorMessage` solo lee `detail` string o primer array → **pierde `code`** (`PASSWORD_CHANGE_REQUIRED`, `REVIEW_NOT_PENDING`, `CHECKLIST_INCOMPLETE` nunca ramifican UI).
- **Evidencia:** `api.js:1-7`; `Login.jsx` nunca bifurca por `code`.
- **Solución:** Error único `{code,detail,fields?,trace_id?}` + `404 {code:'NOT_FOUND'}` + frontend `ApiError{code}` con ramas.

### P06 — MEDIO — Paginación a medias + límites ignorados en silencio
- **Archivos:** `document_views.py:122-131`, `management_views.py:297-303`, `RolesView.jsx:79`, `ReportsView.jsx:58-59`
- **Problema:** `limit 1..100 default 25` + `offset` + `count/next_offset` solo donde hay volumen. `GET /admin/roles/?limit=100`, `/admin/permissions/?limit=100`, `/reports/schedules/?scope=`, `/documents/catalogs/`, `/admin/dashboard/` **ignoran** `limit` sin `400` ni aviso. Frontend pide `limit=1` para “primero” (`EditorVersionsView`, `ReaderDocumentView`, `VersionsView`, `ReviewerDocumentReviewView`) asumiendo orden estable que el backend no garantiza sin `ordering` explícito.
- **Evidencia:** `RoleListCreate.get` sin `get_pagination`; `UsersView.jsx:79` envía `limit` fantasma.
- **Solución:** Paginar todo lo listado o `400 UNKNOWN_PARAM` con `strict`; documentar `default ordering`; cursor para auditoría.

### P07 — MEDIO — Filtros/orden con nombres distintos + fallback silencioso
- **Archivos:** `document_views.py:78-119`, `reader_views.py:103-131`, `audit_views.py:74-119`, `reports_views` `clean_filters`, `documentApi.js:32-47`
- **Problema:** Docs: `search/type_id/area_id/responsible_id/date_from/date_to(status? no, fecha_documento)/status_code/updated_from/updated_to/ordering`; lector: `search/type_id/area_id/status_code/date_from/date_to/favorite/ordering` (sin `responsible`, `date_` = `actualizado_en` no `fecha_documento`); auditoría: `user_id/action/module/result/ip/search/critical/date_from/date_to`; reviews: `status/overdue`. `ordering` desconocido cae a `actualizado_en` (`ordering_fields.get(..., 'actualizado_en')`) sin error → cliente cree orden por `code` y recibe fecha.
- **Evidencia:** `document_views.py:116-118`; `DocumentsView.jsx:229 ordering: classification` (variable mal nombrada).
- **Solución:** Catálogo `?ordering=` validado con `400 INVALID_ORDERING` + spec por recurso + test.

### P08 — MEDIO — Parámetros/tipos frágiles: `name`→`id` en cliente, sin validación UUID en servidor
- **Archivos:** `documentApi.js:36-43`, `document_views.py:88-93`
- **Problema:** `buildDocumentQuery` resuelve `catalogs.*.find(name===type).id || type` (case exacto, primera coincidencia). Con nombres duplicados elige mal; si no encuentra envía el **nombre crudo** como `type_id/area_id` → backend lo pasa a `filter(tipo_documento_id='Manual')` (UUID/SmallInt esperado) → `ValueError/ValidationError` 500/400 tardío en vez de `400 INVALID_FILTER`. Backend no valida formato UUID/int de filtros.
- **Evidencia:** Líneas citadas; sin `parse_uuid` en `apply_document_filters`.
- **Solución:** Frontend envía siempre `*_id` (select por `id`, muestra `name`); backend valida `UUID/int` → `400` temprano.

### P09 — MEDIO — Binarios rompen `apiRequest` + CSRF duplica latencia
- **Archivos:** `api.js:27`, `document_views.py:1117-1158,1190-1204`, `backup_views.py:241`
- **Problema:** `apiRequest` hace `response.json().catch(()=>({}))` siempre (salvo `204`). En `FileResponse` (PDF/imagen/CSV/`.sdbk`/XLSX) el `json()` falla → `{}` y el llamante cree éxito vacío; errores binarios (p. ej. `415/404` con JSON) se pierden igual. Export/descargas reales usan `window.open/href` (bien), pero cualquier futuro `apiRequest(download)` romperá. Además cada `POST/PATCH/PUT/DELETE` paga `GET /api/auth/csrf/` previo sin caché (doble RTT, doble punto de fallo, sin refresh ante `403 CSRF`).
- **Evidencia:** `api.js:14-19,27`; `DocumentsView.jsx:304 window.open(export)` (parche correcto) vs ningún `blob()` centralizado.
- **Solución:** `apiClient.request(..., {response:'json|blob|text'})` + `ensureCsrf()` con caché de pestaña + reintento único ante `403 CSRF`.

### P10 — MEDIO — Exposición excesiva + sensibles en respuestas
- **Archivos:** `document_views.py:581-604`, `management_views.py:55-68,559-565`, `audit_views.py:132-162`, `reader_views.py:188-230`
- **Problema:** `GET /documents/catalogs/` (cualquiera con `consultar`, incluido lector) devuelve `responsibles` (todos los usuarios activos `id+nombre`) + áreas/tipos/estados → enumeración. `serialize_management_user` expone `failed_attempts/locked_until/last_access/disabled_at` a `consultar`. `POST reset-password` devuelve `temporary_password` en claro (y `UsersView.jsx:123` lo pinta en `notice`). Auditoría/historial devuelven `ip/user_agent/details` íntegros. `href=backup.download_url` expone `.sdbk` (DB completa) a quien tenga `usuarios.gestionar` (ver H02).
- **Evidencia:** Líneas citadas; `BackupsView.jsx:137 href={backup.download_url}`.
- **Solución:** Catálogo lector mínimo, `responsibles` solo con `usuarios.consultar`, minimizar `management_user` por permiso, `reset` por canal seguro + una sola vista, enmascarar `ip/24` + UA familia.

### P11 — BAJO — Endpoints no protegidos: correcto (allowlist mínima)
- **Archivos:** `documentos/urls.py`, `views.py:56-68,303-311`, `backend/settings.py:REST_FRAMEWORK`
- **Problema:** **No hay hallazgo**: solo `GET auth/csrf`, `POST auth/login`, `GET health` son `AllowAny` (necesarios); default `IsAuthenticatedAndPasswordCurrent` cubre el resto. `GET export` por `window.open` lleva cookies (no necesita header) y exige `consultar` + bloquea lector con `403 READER_ENDPOINT_REQUIRED` (correcto).
- **Evidencia:** `grep AllowAny` solo esos tres.
- **Solución (mejora):** Test que falla si una ruta nueva no declara `permission_classes` (fail-closed).

### P12 — BAJO — Timeouts: cliente infinito, servidor corto para jobs largos
- **Archivos:** `api.js`, `backup_service.create_backup`, `reports_views.persist/build_*`, `render.yaml`/`gunicorn` defaults
- **Problema:** Sin `timeout` cliente ni `statement_timeout`; `POST /backups/` (zip+S3+cifrado), `POST /reports/generate/` (PDF/Excel), `POST .../restore/` y `GET /audit/export/` (10k) superan 30s de `gunicorn`/proxy → `502` con operación a medio hacer (ver B03/B06). Lector `POST read` con `{}` y `favorite DELETE` sin body están bien.
- **Evidencia:** Ausencia `AbortController`; `BackupListView.post` síncrono.
- **Solución:** Jobs async (`202 {job_id}` + `GET jobs/:id`) o al menos `timeout: 15000/120000` + `Retry-After`.

### P13 — MEJORA — Matriz de compatibilidad mínima para cerrar el loop
| # | Frontend espera | Backend devuelve | Veredicto |
|---|---|---|---|
| C01 | `data.results/count/next_offset` (listados) | Igual en docs/reader/audit/users/notifications/history/favorites/inbox | **OK** |
| C02 | `data.document` (`GET/PATCH /documents/:id/`) | `{document}` | **OK** |
| C03 | `data.version` en `POST versions/` | `{version}` | **OK**, pero `POST files/` devuelve `{file}` (P02) |
| C04 | `data.review` (`GET /reviews/:id/`, decide, assign) | `{review}` | **OK** |
| C05 | `data.comment` (`POST comments/`) | `{comment}` | **OK** |
| C06 | `report.download_url` relativo | Relativo | **OK pero inconsistente** con absolutas (P04) |
| C07 | `result.report` (`POST generate/`) | `{report}` | **OK** |
| C08 | `result.temporary_password` | Igual | **OK pero sensible** (P10) |
| C09 | `result.revoked_sessions` | Igual | **OK** |
| C10 | `result.settings/changes` | Igual | **OK** |
| C11 | `data.version.version/download_url` | **Ausente** (P01) | **ROTO** |
| C12 | `deadline` `datetime-local` sin TZ | `DateTimeField` (asume TZ) | **Frágil** — normalizar a ISO con offset |
| C13 | `role_ids:[first]` | `role_ids:[]` múltiple | **Limitado** — UI solo asigna uno |

## 4. Veredicto

- **REST:** funcional pero no canónico (P02); **GraphQL/RPC/WS/colas:** inexistentes por diseño (polling + cron) — no es hallazgo, pero impide realtime/notificaciones push.
- **Rutas/parámetros/tipos:** usables, con fricción en filtros/ordering/UUID (P07/P08).
- **Errores/paginación/formatos:** mayor deuda (P04-P06); `code` se pierde en cliente.
- **Límites/timeouts/reintentos/idempotencia:** deuda alta (P03/P12); duplicación real ante retry.
- **Protegidos/sensibles:** bien cerrados, demasiado anchos en datos (P10/P11).
- **Prioridad:** P01→P03→P04/P05→P09/P12→P06-P08→P10→P13 (OpenAPI primero para congelar contratos).
