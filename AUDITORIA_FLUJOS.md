# AUDITORIA_FLUJOS — Recorridos reales de usuario contra la arquitectura real

> Base: `AUDITORIA_CONTEXTO.md` §8/§10/§23. Arquitectura real: monolito Django (`APIView` sin capa servicio; la “lógica de negocio” vive en `document_views/workflow_views + helpers`), SPA React sin router (`Login.jsx` despacha por `role.code`), auth por cookie `sd_session` + CSRF, Postgres `gestion_documental`, storage S3/B2. Recorrido adaptado: `Controlador` incluye helpers del mismo módulo; `Servicio` = helpers/servicios parciales realmente importados (no capa formal); se indica cuando no existe.
> Fecha: 2026-09-05. Sin modificar código.

Leyenda verificación: ✅ existe/coincide · ⚠️ coincide parcial/frágil · ❌ roto/ausente/diverge.

## FL01 — Auth: login → me → change (si aplica) → logout

| Paso | Evidencia |
|---|---|
| Usuario | Cualquiera en `Login.jsx:320-352` (`identity`, `password`, `remember`) |
| Interfaz | `handleLogin` → `POST /api/auth/login/` con `{identity,password,remember}` (`Login.jsx:191-208`); `me` al montar (`:180-189`); cambio con `{current,new,confirm}` (`:210-232`); logout `POST` (`:234-252`) |
| Solicitud | `apiRequest` + `GET /api/auth/csrf/` previo + `X-CSRFToken` (`api.js:14-19`) |
| Ruta/API | `POST auth/login|me|change-password|logout`, `GET auth/csrf|health` (`urls.py:15-19,111`) |
| Controlador | `LoginView/CsrfTokenView/CurrentUserView/ChangePasswordView/LogoutView` (`views.py:55-300`) |
| Servicio | No existe como capa; `LoginSerializer/ChangePasswordSerializer` + `security_policy_for()` + `hash_session_token()` |
| Regla | `DUMMY` anti-enumeración, bloqueo 5/15m, `remember?30d:policy.hours`, `must_change` bloquea resto vía `IsAuthenticatedAndPasswordCurrent` |
| DB | `usuarios (select_for_update)`, `sesiones create/update`, `bitácora SESION_*` |
| Respuesta | `{user,session.expires_at}` + cookie; `{user}`; `204` logout |
| Interfaz | `setUser(data.user)`, gate `must_change_password`, dashboards por rol (`Login.jsx:264-283`) |

Verificación: pasos existen ✅ · datos coinciden ✅ · respuestas coinciden ✅ · permisos ✅ (`AllowAny` solo login/csrf/health) · estados ✅ · errores ⚠️ (401 genérico sin redirect; `code` perdido en `errorMessage`) · completa ✅ salvo expiración en caliente (se queda en dashboard roto).

## FL02 — Editor: crear documento + primera versión 1.0 BORRADOR

| Paso | Evidencia |
|---|---|
| Usuario | EDITOR |
| Interfaz | `DocumentsView.jsx:318-348` arma `FormData` con lo que haya (`code/title/description/area_id/type_id/file`) |
| Solicitud | `POST /api/documents/` multipart |
| Ruta | `documents/` → `DocumentListCreateView.post` (`urls.py:35`, `document_views.py:535`) |
| Controlador+regla | `DocumentCreateSerializer` (`code ^[A-Z0-9_-]+$`, `title≤200`, `area_id UUID`, `type_id int≥1`) → `get_reference_or_error` (área por org+activa; **tipo global sin org**) → `ensure_area_authorized` → `exists(codigo)` → `atomic: create + save_metadata + save_document_file→1.0 BORRADOR` |
| DB | `documentos`, `documentos_metadatos`, `versiones_documento`, `historial_estados_version`, bitácora `DOCUMENTO_CREADO` |
| Respuesta | `201 {document: serialize_document(include_details)}` |
| Interfaz | `normalizeDocument(data.document)` prepend + `total+1` |

Verificación: pasos ✅ · datos ⚠️ (create nunca manda `metadata/file_comment`; comentario queda `'Carga de archivo'`; `type_id` global vs área por org — B10) · respuestas ⚠️ (sin `version/download_url/reviewer` — P01, la UI pinta `—`/null) · permisos ✅ (`gestionar`) · estados ✅ · errores ✅ (400/409) · completa ⚠️ (doc sin archivo queda huérfano funcional válido).

## FL03 — Editor: subir nueva versión minor/major

| Paso | Evidencia |
|---|---|
| Interfaz | `EditorDocumentEditView.jsx:200-218` (`FormData{file,comment,version_type}`) |
| Ruta | `POST /documents/:id/versions/` → `DocumentVersionListView.post` (`urls.py:43`, `document_views.py:798`) — duplicada con `POST /files/` (`:760`, P02) |
| Controlador+regla | `DocumentFileSerializer{file,comment≤1000,version_type minor|major}` → `save_document_file`: valida, `select_for_update archivos`, `next_version_numbers` (1.0→1.1 / 2.0), apaga vigentes, guarda S3, crea + historial |
| DB/Respuesta | `versiones_documento` + `201 {version}` |
| Interfaz | `GET refreshed document` y `onAction` |

Verificación: datos ✅ · respuestas ✅ (`{version}`) salvo alias `files/` devuelve `{file}` ❌ (P02) · permisos ✅ · estados ⚠️ (carrera doble `orden/vigente` — B04; storage dentro del `atomic` — B03) · errores ✅ · completa ✅.

## FL04 — Editor: enviar a revisión + revisores + reasignar

| Paso | Evidencia |
|---|---|
| Interfaz | `submitReview` (`EditorDocumentEditView.jsx:164-189`) con `{reviewer_ids,deadline?,priority,comment,checklist[]}`; `assignReview` (`:144-162`) con `{reviewer_id,deadline?,priority}`; candidatos `GET /reviews/reviewers/` |
| Ruta | `POST /documents/:id/versions/:vid/submit-review/` → `ReviewSubmitView.post` (`urls.py:47-51`, `workflow_views.py:321`); `POST /reviews/:id/assign/` → `ReviewAssignmentView.post` (`:466`) |
| Regla | Solo `BORRADOR`; revisores activos con rol REVISOR/ADMIN + acceso área/doc; `deadline` futura; `PENDIENTE` único por versión (check sin lock); crea `Solicitud+Detalle+checklist+comentario OBSERVACION`; notifica |
| DB/Respuesta | `solicitudes_revision(+detalle/checklist/comentarios)`, versión→`EN_REVISION`, `201 {reviews}` |
| Interfaz | Refresca doc + reviews, cierra modal |

Verificación: datos ⚠️ (`deadline` `datetime-local` sin TZ → deriva 5h; `priority` sin `URGENTE` en UI aunque el modelo lo admite) · respuestas ✅ · permisos ✅ (`enviar`) · estados ⚠️ (doble submit en carrera crea doble `PENDIENTE` — B04) · errores ✅ (400/409) · completa ✅.

## FL05 — Revisor: checklist → comentarios → resolve → approve/return/reject → publish

| Paso | Evidencia |
|---|---|
| Interfaz | `ReviewerDocumentReviewView.jsx:85-120`: `PATCH /reviews/checklist/:id/ {completed}`, `POST /reviews/:id/comments/ {content,type}`, `POST /reviews/:id/{approve,return,reject}/ {comment}`; `VersionsView.jsx:52-60` publica con `{comment}` |
| Ruta | `workflow_views.py:596,632,673,698,514-591,724` |
| Regla | Checklist solo asignado + `PENDIENTE`; comentarios bloqueados si resuelta; `return/reject` exigen observación; approve exige checklist completa (**solo de esa review**); `transition_version` por `VERSION_TRANSITIONS`; publish `APROBADO→PUBLICADO` + switch `es_vigente` |
| DB/Respuesta | `estado_revision`, `comentario_resolucion/resuelta_en`, `historial_estados_version`, eventos `APROBADO/RECHAZADO/DEVUELTA/PUBLICADO`, notifs (solo a solicitante) |

Verificación: pasos ✅ · datos ✅ · respuestas ✅ · permisos ⚠️ (UI no pre-exige comentario en return ni asignado en checklist; backend sí → 400/403 tardíos) · **estados ❌ (I01)**: approve marca la review `APROBADA` pero si quedan otras `PENDIENTE` la versión **sigue `EN_REVISION`** (`workflow_views.py:547-551`); return/reject **cierra masivamente** las ajenas con texto genérico sin avisarles (`:555-559`) · publish ❌ duplica `APROBADO+PUBLICADO` y puede coronar una versión vieja no-vigente (B08) · errores ⚠️ (`code` perdido) · completa ⚠️.

## FL06 — Lector: biblioteca → detalle → read/favorite/history → download/preview

| Paso | Evidencia |
|---|---|
| Interfaz | `ReaderLibraryView` (`GET /reader/documents/?query`), `ReaderDocumentView` (fallback `limit=1` si no hay id + `POST read {}` fire-and-forget + `POST|DELETE favorite`), history/favorites con `limit=100` |
| Ruta | `reader_views.py:103,149,159,188,236,260,284` |
| Regla | Solo `PUBLICADO` + ACL; `read` registra `LECTURA`; `download` exige `documentos.descargar`, `preview` solo `consultar` + MIME whitelist |
| DB/Respuesta | `documentos_accesos/favoritos` + bitácora; `{document/version/favorite/reading}` |

Verificación: pasos ✅ · datos ⚠️ (biblioteca llama a **catálogo general** `/documents/catalogs/` y aprende taxonomía no publicada — P10) · respuestas ✅ · permisos ✅ · estados ✅ · errores ❌ (fallback `limit=1` abre **otro** documento si falta id — F02; `read` tragado con `catch(()=>{})`) · completa ✅.

## FL07 — Versiones: compare + timeline + restore

| Paso | Evidencia |
|---|---|
| Interfaz | `VersionsView/EditorVersionsView` (`GET versions/`, `GET compare?from&to`, `GET timeline/`, `POST versions/:id/restore/ {comment,version_type}`) |
| Ruta | `document_views.py:787,824,915,1077` |
| Regla | Compare por SHA+metadatos; timeline = versiones + auditoría (lector solo `PUBLIC_*`); restore crea **nueva BORRADOR** copiando bytes, preserva historial |

Verificación: pasos ✅ · datos ⚠️ (restore copia `sha/tamaño` sin re-hashear — B17; compare `same_content` compatible con `changed_fields≠[]`) · respuestas ❌ (`timeline` hace `KeyError` con acciones fuera del dict — B02; UI marca local `PUBLICADO` sin recargar timeline) · permisos ✅ · estados ✅ · errores ⚠️ · completa ⚠️.

## FL08 — Reportes: generar → descargar → programar → cron

| Paso | Evidencia |
|---|---|
| Interfaz | `ReportsView.jsx:81-110` (`POST generate {scope,format,filters}` → `history.unshift`; `POST schedules/ {scope,format,frequency,filters,name}`; `a[href=download_url]`) |
| Ruta | `reports_views.py:456,485,529,562` + comando `generar_reportes_programados` (fabrica `SimpleNamespace(user)` y llama a la vista — A06) |
| Regla | `scope executive|editor|reviewer` + `REPORT_DOCUMENT_PERMISSIONS`; snapshot S3 + `sha`; `editor/reviewer` solo propios; schedules solo creador|admin |
| DB/Respuesta | `reportes_generados_v2/programaciones`, `201 {report}`, `download` binario o `410` |

Verificación: pasos ✅ · datos ✅ · respuestas ❌ (si falta snapshot **regenera con datos actuales** devolviendo 200 en vez de 410 — B07; XLSX completo vs PDF `[:1000]` silencioso) · permisos ✅ · estados ✅ · errores ⚠️ · completa ⚠️ (cron depende de `SimpleNamespace`, sin perms reales).

## FL09 — Respaldos: config → manual → download → restore → recovery-test

| Paso | Evidencia |
|---|---|
| Interfaz | `BackupsView.jsx:75-121` (`POST /backups/`, `POST /backups/config/ {active,frequency,retention_days,destination,include_files}`, `POST /backups/:id/restore/ {mode:'restore'}`, `POST /recovery-test/`, `a[href=download_url]`) |
| Ruta | `backup_views.py:105,137,161,178,232,250,285` |
| Regla | `usuarios.gestionar` (excesivo — H02); `mode verify|restore|restore_files` (default `verify`); `.sdbk AES-GCM`; `verify` no marca, `restore*` sí (indistinguible en campo) |

Verificación: pasos ✅ · datos ⚠️ (UI siempre `mode:'restore'` full; `verify` solo vía recovery-test) · respuestas ⚠️ (`restaurado_en` igual en files/full; claves `database_rows_restored/files_replaced` solo en full) · permisos ❌ (excesivo) · estados ⚠️ (DB `SERIALIZABLE` + S3 acoplados — B06; `en_proceso` sin sweeper ante timeout) · errores ✅ (422/409) · completa ⚠️.

## FL10 — Admin: usuarios/roles/permisos/sesiones + dashboard + auditoría + settings + notifs

| Paso | Evidencia |
|---|---|
| Interfaz | `UsersView` (CRUD + `status/lock?/reset/sessions/devices/revoke` — **sin UI de lock**), `RolesView` (CRUD + `PUT permissions {permission_ids}`), `Dashboard` (métricas), `AuditView` (`GET audit/ + alerts/`, `window.open export`), `SettingsView` (`POST settings/ {[section]:payload}`, `smtp/test`, `integrations/:provider/test`), inbox bell (`GET notifications/?limit=4`) |
| Ruta | `management_views` (16 vistas), `audit_views` (3), `settings_views` (3), `notification_views` (3) |
| Regla | Org-scoped + `usuarios/roles.gestionar`; baja lógica + revoca sesiones (no auto-baja); `assign_roles` revive expiradas; `RolePermissions` borra+recrea; auditoría `admin o propios`; SMTP B01-crítico (nunca rota) |

Verificación: pasos ⚠️ (lock, unarchive, schedule edit/delete existen sin botón — F12; notifs sin pantalla propia, solo bell) · datos ⚠️ (`PUT permissions` manda **todos** los roles incl. vacíos → apertura silenciosa — B19; settings `backups` redirige) · respuestas ✅ · permisos ⚠️ (backend bien, UI oculta) · estados ✅ · errores ✅ · completa ⚠️.

## Integración: lo que por separado parece bien y junto falla (priorizado)

| # | Ruptura | Dónde se ve | Severidad |
|---|---|---|---|
| I01 | Aprobación que no aprueba + cierre masivo silencioso | B05 + FL05 | **CRÍTICO** |
| I02 | Listados sin `version/downloadUrl/reviewer` + fallback a primer registro | P01 + F02 + FL02/FL06/FL07 | **ALTO** |
| I03 | Restore/timeline/publicación optimistas sin recargar | B08/B17 + FL07 | ALTO |
| I04 | Reporte “inmutable” que regenera + PDF/XLSX divergentes | B07 + FL08 | ALTO |
| I05 | Restore full/verify indistinguibles + timeout sin sweeper | B06 + FL09 | ALTO |
| I06 | Permisos explícitos que se pisan entre admins | B19 + FL10 | MEDIO |
| I07 | Notifs solo al solicitante + bell que abre review equivocado | B16 + F02 + FL05 | MEDIO |
| I08 | `deadline` sin TZ (deriva 5h) + `URGENTE` sin opción UI | FL04 | MEDIO |
| I09 | Create sin `metadata/file_comment` + `type` global vs `area` por org | B10 + FL02 | MEDIO |
| I10 | `must_change`/401 sin redirect + `code` perdido | FL01 | MEDIO |
| I11 | SMTP que nunca rota (B01) + `str(error)` oracle (S05/S10) | FL10 | MEDIO |
| I12 | Export `window.open` con 401-JSON en pestaña + conteos de página | P11 + F07 | BAJO |

## Qué sí integra bien (no tocar)

Auth feliz (login→me→dashboard por rol→logout), validaciones serializer↔UI en upload (50 MB, MIME, ZIP), CSRF doble, `404` anti-oráculo en objetos, `409` duplicado secuencial, `410` snapshot corrupto (cuando no regenera), baja lógica con sesiones revocadas, `allow_own` auditoría, `dry_run` SMTP.
