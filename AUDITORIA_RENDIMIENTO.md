# AUDITORIA_RENDIMIENTO — Sin modificar código, solo impacto real

> Alcance: los 16 patrones pedidos. Método: inspección estática + conteo de queries/red/memoria por camino crítico. Sin profiling en vivo ni cambios. Se excluyen microoptimizaciones al final. Base: `documentos/reader_access.py`, `auth_utils.py`, `authentication.py`, `document/workflow/management/reports/audit/backup/notification/reader_views.py`, `backup_service.py`, `config_service.py`, `frontend/src/api.js`, `DocumentsView/Editor*/Reader*/Dashboard/AuditView/BackupsView.jsx`.
> Fecha: 2026-09-05.

## 1. Resumen: lo que sí duele (top 5)

1. **ACL por documento en Python (R01):** cada listado hace 3-5 queries **por documento** antes de paginar. 100 docs ≈ 300-500 queries.
2. **Overhead fijo por request (R02):** auth + RBAC + policy + `is_reader` (8×2 queries) + `UPDATE actividad` ≈ 15-25 queries + 1 write **en cada llamada**, sin caché.
3. **Respuestas gigantes sin paginación real (R04):** `limit=100` con serialización completa, `export 10000`, dashboard multi-agregado, catálogos completos.
4. **Jobs síncronos en el request (R05):** backup/restore/reportes/auditoría-export/SMTP bloquean el worker minutos (timeout/502) y retienen locks.
5. **Memoria O(n) en archivos (R06):** ZIP/cifrado/PDF/XLSX/CSV construidos enteros en `BytesIO` (2-3× el tamaño en RAM) + doble hash del upload.

## 2. Hallazgos (solo impacto real)

### R01 — ALTO — Consultas N+1 + repetitivas: ACL documento por documento
- **Problema:** `filter_accessible_documents(user, queryset)` itera en Python y por doc llama `has_document_permission()` → 1 cursor ACL + `get_user_roles()` (1 cursor) + `get_user_permission_codes()` (1 cursor) + a veces `get_user_roles()` otra vez + `Documento.only()` . En la práctica 3-5 roundtrips por documento, **antes** de `offset/limit`.
- **Evidencia:** `reader_access.py:32-86` (`has_document_permission` con 2 `EXISTS` + `get_user_roles` ×2 + `user_has_permission` 2 queries); usos en `document_views.py:521 (list)`, `:1171 (export)`, `reports_views.py:151-155,200-205`, `reader_views` lista, `workflow_views.py:247,262,436` (por revisor y por usuario en `ReviewCandidateListView` → N usuarios × roles query).
- **Impacto real:** `GET /documents/?limit=100` con 100 docs ≈ 300-500 queries + `serialize_document` (con `current_version` 1-2 queries más por doc si no hay prefetch) → p95 de segundos y CPU DB lineal con el tenant.
- **Solución:** Un `EXISTS` de ACL como `WHERE`/`JOIN` en el queryset + `select_related('area','tipo_documento','creado_por')` + `prefetch archivos vigentes`; paginar en DB y devolver `count` con `COUNT(*) OVER()`; test `assertNumQueries` por listado.

### R02 — ALTO — Consultas repetitivas por request: auth + RBAC + policy sin caché + write siempre
- **Problema:** Cada request autenticado paga: (a) `CookieTokenAuthentication`: 1-2 `SELECT sesion+usuario` + `security_policy_for()` → `get_system_config()` (`SELECT configuracion`) + `merge_defaults(deepcopy DEFAULTS)` + `UPDATE ultima_actividad_en` (**write siempre**); (b) `require_permission` → `user_has_permission` → `get_user_roles` + `get_user_permission_codes` (2 cursors); (c) `is_reader_user()` → **8×** `user_has_permission` → hasta 16 cursors más; (d) `serialize_user()` → otro `get_user_roles`. Lo mismo se repite en `has_area_permission`/`is_admin` dentro del mismo request.
- **Evidencia:** `authentication.py:41-86`, `auth_utils.py:20-75`, `reader_access.py:20-27`, `config_service.py:71-127`, `notifications.py:54`.
- **Impacto real:** Overhead fijo ~15-25 queries pequeñas + 1 `UPDATE` por llamada (incluso `GET` de 1 fila); contención en `sesiones` bajo carga; `deepcopy` de defaults por llamada es CPU inútil.
- **Solución:** Cache por request (`request._roles/_perms/_policy` o `cached_property` en user), una sola query roles+permisos con `JOIN`, `merge_defaults` con `lru_cache` por `(org, actualizado_en)`, `UPDATE actividad` throttled (solo si `>60s`) o async.

### R03 — ALTO — Ciclos innecesarios + procesamiento repetido: filtrar/ordenar en memoria
- **Problema:** Lector (`reader_views` lista), reportes (`document_report_rows`: filtra `status_code` **después** de traer todo; `reviewer_report_rows`: ACL por review en Python), y rama reader de `DocumentListCreate` evalúan el queryset completo y luego `list[offset:offset+limit]`, `sort()` en Python. `summarize_report`/`report_options` re-iteran `rows` 3-4 veces para conteos que SQL haría en una pasada.
- **Evidencia:** `reports_views.py:151-177,198-230`; `reader_views` lista con comprehensions + `sort`; `document_views.py:501-513,522-533`.
- **Impacto real:** RAM lineal + `limit` que no limita DB (trae 10k para devolver 25); `status_code` filtra tarde desperdiciando ACL.
- **Solución:** Filtros (`status/area/tipo/fecha/search`) y `order_by` + `LIMIT/OFFSET` en DB; agregados con `GROUP BY`/`FILTER (WHERE)`.

### R04 — ALTO — Respuestas demasiado grandes + falta de paginación + datos innecesarios
- **Problema:** Frontend pide `limit=100` en casi todo (`Documents`, `EditorDashboard`, `ReaderDashboard/history`, `inbox`) y backend serializa documentos completos (con `area/tipo/responsable/versión`). Sin paginación real en: `roles/permissions/schedules/catalogs/dashboard/statuses`, `timeline` (todos los eventos), `compare` (dos versiones completas + URLs), `permissions_payload` (todos los roles × todos los permisos), `audit export limit=10000` (y `AuditView.jsx:100` lo usa), `backup list [:50]` + 2 counts + `SUM` + `restore_points [:10]` en la misma respuesta, `ReviewCandidateListView` (todos los usuarios + N roles queries).
- **Evidencia:** `management_views.py:205-294` (dashboard ~12 queries en una respuesta), `backup_views.py:109-134`, `audit_views` export, `document_views.py:283-334`, `frontend`: `limit=100` en 6 vistas, `Promise.all` de 2-3 listados al montar.
- **Impacto real:** Respuestas de MB, render lento, picos de DB por cada montaje de dashboard.
- **Solución:** Paginar todo (`cursor` en auditoría/timeline), `fields=` sparse, catálogos con `search` + `page`, dashboard con agregados únicos y caché 30-60s.

### R05 — ALTO — Operaciones síncronas costosas (bloquean worker hasta timeout)
- **Problema:** `POST /backups/` (snapshot DB + zip todos los archivos + `AESGCM` + `S3.save`), `POST .../restore|verify`, `POST /reports/generate/` (`build rows` + `openpyxl/reportlab` + `S3.save`), `GET /audit/export/`, `GET /documents/export/` (loop con `current_version()` por doc → N+1 dentro del export), `send_mail` inline en `create_notification` (bloquea `submit/approve/comment`). Sin colas: todo ocurre dentro del ciclo request/response de gunicorn (30s por defecto) → 502 con trabajo a medias (ver Edge E04).
- **Evidencia:** `backup_service.py:851-886,1149-1265`, `reports_views.py:334-419`, `document_views.py:1194-1204`, `notifications.py:54-70`, `api.js` sin timeout.
- **Impacto real:** Timeouts en tenants medianos, workers clavados, reintentos del cliente que duplican jobs (ver API P03).
- **Solución:** `202 {job_id}` + worker/cron + `GET jobs/:id`; SMTP y auditoría async (outbox); exports por streaming (`StreamingHttpResponse`, cursor server-side, S3 multipart).

### R06 — ALTO — Lectura excesiva de archivos + uso excesivo de memoria
- **Problema:** Backup construye `archive_buffer = BytesIO()` con **todos** los ficheros + `encrypt_archive(getvalue())` (copia) + `S3.save(payload)` (otra copia) → 2-3× el tamaño en RAM; verify/decrypt igual; reportes igual (`BytesIO` + `getvalue()` + `S3.save` + `len(content)`); auditoría-export arma `rows` (10k dicts) y luego CSV en memoria; upload se hashea entero 2 veces (vista valida y `save_document_file` revalida → 2× SHA + 2× scan ZIP de hasta 200MB descomprimidos).
- **Evidencia:** `backup_service.py:878-884,1149-1243,1271-1276`, `reports_views.py:356-419`, `file_validation.py:104-107`, `document_views.py:442-456`.
- **Impacto real:** OOM en workers free (512MB) con tenants de GB; GC pauses; swaps.
- **Solución:** Streaming (`ZipFile` por miembros, `AESGCM` por chunks o archivo temporal + multipart), un solo `hash` pasando `file_data`, `StreamingHttpResponse`, límites también en salidas.

### R07 — MEDIO — Bloqueos (locks retenidos + conteos redundantes)
- **Problema:** `select_for_update()` sobre `archivos`/usuario **dentro** de `transaction.atomic()` que además hace I/O S3 (`save_document_file`, restore) → lock retenido segundos; `LoginView` bloquea fila usuario por intento (contención ante stuffing); dashboard hace 5 `COUNT DISTINCT` de estados + `total` + `pending/overdue` + 3 de usuarios + sesiones + 2 de auditoría (~12 queries) en cada `GET /admin/dashboard/` sin caché.
- **Evidencia:** `document_views.py:437-442,840-848`, `views.py:82-115`, `management_views.py:224-286`.
- **Impacto real:** Contención y `p50` alto en dashboard; riesgo de deadlock bajo carga de subidas paralelas.
- **Solución:** Transacciones cortas (sin I/O dentro), un `GROUP BY estado` en vez de 5 counts, caché dashboard 30s, backoff en login.

### R08 — MEDIO — Carga innecesaria del frontend + llamadas y red repetidas
- **Problema:** `GET /documents/catalogs/` se pide en `DocumentsView`, `EditorDocumentsView` y `ReaderLibraryView` (3× mismos datos, sin caché compartida); `EditorDocumentEditView` monta `GET document` + `GET reviews` aunque el padre ya tiene el doc, y tras cada `PATCH/POST` hace `GET refreshed` (+2× por acción); `ReviewerDocumentReviewView` hace `inbox?limit=1 → review → document` en serie; `Reader*` hace `list?limit=1` fallback + `detail` + `read` fire-and-forget; cada mutación paga `GET /auth/csrf/` previo (2× red por escritura); `Promise.all` de 2-3 listados en cada dashboard al montar + refetch al cambiar tab.
- **Evidencia:** `frontend/src/*View.jsx` (`apiRequest("/api/documents/catalogs/")` ×3, `?limit=100` ×6, `Promise.all([...])` en Dashboard/Reviewer/Reader), `api.js:14-19`.
- **Impacto real:** 2-4× requests, waterfall (serie en vez de paralelo), TTI alto en 3G.
- **Solución:** Caché compartida (SWR: catálogos 5m, doc por id), paralelizar independientes, reutilizar CSRF cookie (no refetch), invalidar en vez de refetch-total.

### R09 — MEDIO — Caché inexistente donde sería claramente útil
- **Problema:** Cero caché backend (sin `locmem/redis`, sin `lru_cache`): `audit_timestamp_column()` consulta `information_schema` **por request**; `security/upload_policy_for()` + `merge_defaults(deepcopy)` por request (2-3×); `destination_options()`, `report_options()`, `dashboard` y `fetch_security_alerts` se recalculan siempre.
- **Evidencia:** `audit_views` (introspección por llamada), `config_service.py:71-127`, `management_views.py:239-242`.
- **Impacto real:** Queries estáticas repetidas (catálogos de auditoría, policies, destinos) en el 100% del tráfico.
- **Solución:** `lru_cache` para metadatos estáticos + caché 60s por org para policies/catálogos/dashboard (invalidar en `save`), `Cache-Control: private, max-age=60` en catálogos.

## 3. Cobertura pedida (trazabilidad)

| Pedido | Estado | Dónde |
|---|---|---|
| consultas repetitivas | **R02** (roles/perms/policy/timestamp por request) | auth/config/auditoría |
| consultas N+1 | **R01** (ACL por doc, serialize, candidatos) | listados/reportes/lector |
| ciclos innecesarios | **R03** (filtros en memoria, re-conteos) | lector/reportes |
| procesamiento repetido | **R02/R09** (`deepcopy`, doble hash upload) | config/file |
| lectura excesiva archivos | **R06** (backup/verify/report/zip enteros) | storage |
| respuestas demasiado grandes | **R04** (100 rows completas, export 10k, dashboard) | API |
| datos innecesarios | **R04** (`permissions_payload` total, `responsibles` a lectores, `details` íntegros) | API |
| falta paginación | **R04** (roles/perms/schedules/catálogos/timeline) | API |
| carga innecesaria frontend | **R08** (catálogos ×3, refetch-all, `limit=100` base) | UI |
| llamadas repetidas | **R08** (+ CSRF ×2 por escritura) | red |
| bloqueos | **R07** (`select_for_update` + I/O, login) | DB |
| operaciones síncronas costosas | **R05** (backup/restore/report/export/SMTP) | workers |
| uso excesivo memoria | **R06** (`BytesIO` ×2-3, listas 10k) | workers |
| creación innecesaria objetos | **R06/R09** (`deepcopy`, dicts 10k, `getvalue()` copias) | CPU/RAM |
| red repetida | **R08** | frontend |
| caché inexistente | **R09** | backend+frontend |

## 4. Explícitamente NO son problema (microoptimizaciones descartadas)

- `hashlib.sha256` por permiso, `formatDate`, concatenar strings de búsqueda, SVG inline de iconos, `slice(0,5)` del dashboard, `Math.ceil` de paginación, ordenar 25-100 filas en cliente **una vez paginado en servidor**, `useDeferredValue` ya existente. Nada de esto mueve p95; no actuar.

## 5. Prioridad (solo impacto real)

1. **R01+R02** (ACL + overhead por request con caché/request-scope) — mayor retorno, toca todos los endpoints.
2. **R05+R06** (async/streaming + un hash) — elimina timeouts/OOM.
3. **R04+R03** (paginación DB + filtros SQL + respuestas recortadas).
4. **R07+R08+R09** (locks cortos, SWR/CSRF, `lru_cache` + dashboard cacheado).
