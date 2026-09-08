# AUDITORIA_TESTS — Cobertura lógica de pruebas existente

> Alcance: qué se prueba, qué no, calidad de lo probado y faltantes priorizados. **No se escriben pruebas nuevas.** Base: `documentos/tests.py` (2759 lín, 119 KB, **130 `def test_` en 30 clases**, todo `SimpleTestCase`), `frontend/package.json` (sin script `test`), ausencia de `*.test.*`, `*.spec.*`, `pytest.ini/setup.cfg/pyproject.toml/coverage.xml`, `.github/` (inexistente), `.playwright-mcp/` (solo snapshots `page-*.yml`, no suite), `backend-checklist.txt:199-225` (admite gaps).
> Fecha: 2026-09-05.

## 1. Resumen ejecutivo

- **Todo el testing automatizado vive en un solo archivo:** `documentos/tests.py`. 130 tests, 30 clases, 0 DB real (100% `SimpleTestCase` + `SimpleNamespace`/`MagicMock` + `@patch`).
- **Cobertura aparente alta, real parcial:** serializers/validaciones/archivos/backup-crypto/reportes-formato bien cubiertos; vistas cubiertas con **permisos, transacciones y querysets mockeados** (se prueba el cableado, no el comportamiento).
- **Cero:** tests de integración con Postgres, tests frontend (0), e2e automatizado (0, solo checks manuales Render + Playwright puntual), CI/coverage config (0).
- **Riesgo:** regresiones silenciosas en aislamiento org/ACL, flujo crear→publicar→restaurar, restore/recovery real, lockout/sesiones, y todo el frontend.

## 2. Mapa: módulos con pruebas vs sin pruebas

| Módulo | Clases (nº tests aprox.) | Tipo real | Estado |
|---|---|---|---|
| `serializers.py`, `document_serializers.py`, `workflow serializers` | `SerializerTests` (~12) | Unitaria pura | ✅ Bien (trim, mismatch, sanidad, duplicados) |
| `security_utils.py` | 1 test (`sanitize_text`) + usos indirectos | Unitaria | ✅ Mínima pero correcta |
| `file_validation.py` | `DocumentFileValidationTests` (7: pdf/extension/mime/límite/macro/traversal/download) | Unitaria | ✅ La mejor zona |
| `management_views` usuarios/roles/permisos | `UserDeletion/Creation (4+4)`, `DeviceInventory (2)`, `PermissionManagement (2)` | Unitaria con mocks totales | ⚠️ Parcial (ver §4) |
| `reader_access.py` área/ACL | `DocumentAreaPermissionTests (3)` + `ReaderAccessTests (5)` | Unitaria con `connection` mockeado | ⚠️ Lógica ACL sí, aislamiento real no |
| `document_views` export/permisos/metadata/versiones | `DocumentExportTests`, `DocumentPermissionsTests (3)`, `Versioning/Restore (8)`, `DocumentEditing/Lifecycle (5)` | Unitaria con vistas mockeadas | ⚠️ Helpers sí, endpoints no |
| `workflow_views` transiciones/candidatos/checklist | `WorkflowTests` (~14) | Unitaria + vistas con mocks | ⚠️ Serializers/transición sí, decisiones no |
| `reports_views` formato/historial/schedules | `ReportFormat/History/Scheduled/Authorization (3+8+3+5)` | Unitaria + vistas mockeadas | ✅ Formato/snapshot bien; filtros/ACL no |
| `backup_service.py` crypto/snapshot/scope/restore | `BackupSecurity/Snapshot (4+15)` | Unitaria + `default_storage`/`atomic` mockeados | ✅ Crypto/scope bien; restore real no |
| `config_service.py` secretos/validación | `SettingsSecurityTests` (2: round-trip, límites/webhook) | Unitaria | ⚠️ Solo 2 caminos |
| `audit_views`/`auth_utils` bitácora/alertas | `AuditTests` (6: `record_access_denied`, own-events, `audit_query_parts`, alerts×2, critical) | Unitaria | ✅ Query/alertas bien; endpoints no |
| `authentication.py` sesiones | `AuthenticationTests` (5: sha256, sin cookie, actividad, inactividad, revocada) | Unitaria | ⚠️ Sin expirada/inactiva-usuario/CSRF |
| `permissions.py` | `PermissionTests` (3, con `has_permission` mockeado) | Unitaria | ⚠️ Tautológica (ver §4) |
| `views.py` login/health/401 | `AuthApiTests` (~12: CSRF, genérico, cookie, health×2, 401×6, change-token) | Unitaria + `APIClient` sin DB | ⚠️ Happy + 401; sin lockout/expiración |
| `management_views.dashboard` | `DashboardTests` (1: serializer con `SimpleNamespace`) | Unitaria | ❌ La vista (12 queries) sin test |
| `notification_views.py`/`notifications.py` | `NotificationTests` (1: create+`send_mail` mockeado) | Unitaria | ❌ List/read/read-all sin test |
| `reader_views.py` (8 endpoints) | Solo `ReaderAccessSerializer` (2) dentro de `ReaderAccessTests` | Unitaria | ❌ Endpoints lector sin test |
| `settings_views.py` (get/post/smtp-test/integration-test) | 0 | — | ❌ Sin test |
| `audit_views` endpoints (list/export/alerts) | 0 (solo helpers) | — | ❌ Sin test |
| `backup_views.py` endpoints (list/post/download/restore/recovery-test) | 0 | — | ❌ Sin test |
| `workflow_views` decisiones (submit/assign/approve/return/reject/comment/resolve/checklist/publish) | 0 endpoints (solo serializers + `transition` mockeada) | — | ❌ Sin test |
| `document_views` endpoints (detail/archive/files/versions/compare/timeline/download/preview) | Solo download (1) + export (1) + lifecycle mocks (2) | — | ❌ Casi todo sin test |
| `management_views` endpoints (list/status/lock/reset/roles/sessions/revoke) | Solo delete/create-area/create-role/update-area + inventory | — | ❌ Lock/status/reset/sessions/revoke sin test |
| `models.py` (30 modelos) | `ModelContractTests` (2: display/storage-path, sanitize) | Contrato | ❌ Sin constraints/índices/`managed` |
| `migrations/` (19) | 0 | — | ❌ Sin test de migración/drift |
| Frontend (`src/`, 70 ficheros) | 0 (sin runner; `lint: oxlint` no es test) | — | ❌ Cero |
| E2E (roles/flujo) | 0 (solo `.playwright-mcp/page-*.yml` snapshots + checks manuales Render) | — | ❌ Cero |

**Tipos:** unitarias ≈130/130. Integración con DB real: **0** (todo `SimpleTestCase`; `transaction.atomic` se sustituye por `nullcontext`). E2E: **0**. Seguridad dedicada: **parcial** (archivos, sanitize, 401, audit-own; sin IDOR fuzz, throttle, CSRF negativo, XSS almacenado). Casos límite: **parcial** (negativos serializer, 1 MB, macro/traversal; sin paginación/filtros inválidos, 0 filas, 10k export, concurrencia).

## 3. Calidad: las 7 trampas pedidas (con evidencia)

### 3.1. Pasan sin comprobar nada útil
- `tests.py:697` `test_pdf_has_valid_signature`: solo `assertTrue(build_pdf(data).startswith(b'%PDF-'))` con **1 fila** — no valida contenido, paginación 1000, ni `scope reviewer`.
- `tests.py:2756-2759` `DashboardTests`: construye `SimpleNamespace` a mano y aserta `code/status/version/responsible` — prueba el fixture, no la vista (la vista con 12 queries no se ejecuta).
- `tests.py:1661-1665` transiciones: aserta el **dict constante** `VERSION_TRANSITIONS`, no que `transition_version` rechace `BORRADOR→PUBLICADO` (ese camino no se prueba).

### 3.2. Dependen demasiado de mocks (testean el mock)
- Patrón dominante: `@patch(transaction.atomic → nullcontext) + @patch(require_permission) + @patch(queryset...) + @patch(record_*event)` y luego `assert_called_once`. Ejemplos:
  - `tests.py:2490-2530` PUT permisos: mockea `atomic`, `connection`, `require_permission`, `validate_*`, `payload` — verifica strings SQL y llamadas, **cero efecto DB** (un `executemany` roto pasaría igual si el string coincide).
  - `tests.py:1710-1738` `ReviewDocumentListView`: `SolicitudRevision.objects` es `MagicMock` con `__iter__` prefabricado — no prueba filtros `solicitada_por`, orden ni `prefetch`.
  - `tests.py:2326-2350` change-password: `select_for_update`, `filter`, `atomic`, `check/make_password`, `serialize_user`, `record_auth_event` todo mockeado — solo comprueba `cookies['sd_session']` y `len(hash)==64`.
- Consecuencia: N+1, `ordering`, `distinct`, constraints e `IntegrityError` son **invisibles** para la suite.

### 3.3. No validan resultados (solo llamadas)
- `tests.py:722-730` historial personal: solo `filter_reports.assert_called_once_with(...)` — no aserta ni una fila devuelta.
- `tests.py:2636-2644` `record_access_denied`: solo `assert_called_once` + 3 kwargs — no verifica `organizacion_id/user_id/session_id` reales ni el `INSERT`.
- `tests.py:2602-2631` notificación: `create` y `send_mail` mockeados; `notification.save.assert_called_once_with(update_fields=['correo_enviado_en'])` — el `except` (fallo SMTP → `error_correo`) **nunca se ejecuta**.

### 3.4. Datos incorrectos / irreales
- `SimpleNamespace` sin campos que el código sí usa (`area_id`, `organizacion_id`, `debe_cambiar_contrasena`, `activo`) → ramas `if not getattr(...)` nunca se ejercitan como en prod.
- `tests.py:2316-2321` sesión con `expira_en=+12h` fija; nunca `expirada`, `revocada` ni `inactiva`.
- `tests.py:692` hace `__import__('openpyxl')` dentro del test (estilo + oculta dependencia).
- Fechas fijas `2026-08-28` en fixtures de reportes; zonas horarias `America/Bogota` vs `UTC` no variadas.

### 3.5. No prueban errores
- Sin tests para: `409` código/usuario duplicado en carrera, `400` filtros UUID inválidos, `400` `ordering` desconocido, `400` metadata no-dict profunda, `415` preview no disponible, `410` snapshot corrupto (solo 1 de 3 caminos: `826` modificado, falta `None→regenerar`), `422` backup-verify, `500` `BackupExecutionError`, `503` health degradado sí (1, bien) pero no el resto, `S3 open/save` fallando (solo 2 con `BytesIO(b'bad!')`), SMTP caído, DB caída en vistas (solo health + `record_auth_event`).
- `save_document_file`/`save_metadata`/`persist_report_snapshot` con storage roto: **0 tests**.

### 3.6. No prueban permisos
- Solo 2 tests de `HasDocumentalPermission` **con `user_has_permission` mockeado** (`2091-2125`): tautológicos.
- `require_permission` se mockea en **casi todas** las pruebas de vistas → un endpoint sin la llamada pasaría igual.
- Faltan (el propio checklist lo admite `backend-checklist.txt:202`): aislamiento cross-org en listados/export/reportes, ACL documento en list/export, `ADMINISTRADOR` bypass real, `is_reader_user` con los 8 permisos, `allow_own_events` con `user_id` ajeno (solo 1 test propio), `creator vs admin` en schedules (sí hay 5, bien), `revisor asignado vs otro` en checklist/comments/resolve/publish.

### 3.7. No prueban casos extremos
- Paginación: `limit=0/-1/101/abc`, `offset` negativo, `limit=1` + orden inestable (F02 frontend) — 0 tests (solo `INVALID_PAGINATION` con string).
- Vacío: 0 documentos/versiones/revisiones/favoritos/historial/timeline/export-cero/report-0-filas — 0 tests (salvo `DashboardTests` con 1 doc fabricado).
- Límites: archivo exactamente 50 MB / 50 MB+1, 0 bytes, mayúsculas `.PDF`, sin extensión, doble extensión `pdf.exe`, 2000/2001 entries ZIP, 200 MB descomprimidos — 0 tests (solo 1 MB override).
- Concurrencia: doble submit, doble versión (`orden`/`es_vigente`), doble checklist `orden`, doble approve — 0 tests.
- Tiempo: `deadline` pasada/futura-límite, `vigente_hasta` expirado (solo query mockeada), sesión `expira_en==now`, inactividad exacta — 0 tests.

## 4. Lista priorizada de pruebas faltantes (no escribirlas aún)

### P0 — Seguridad y flujo crítico (regresión = incidente o pérdida)
1. Aislamiento cross-org: crear doc en org A → `GET` desde org B espera 404 (docs, versiones, revisiones, reportes, respaldos, auditoría, notificaciones).
2. ACL documento: doc restringido por `documentos_roles_permisos` niega a rol global con permiso pero sin grant; `ADMINISTRADOR` sí entra.
3. `is_reader_user` real (sin mock): lector solo ve `PUBLICADO` y es bloqueado de `export`; editor no.
4. Auth: lockout tras N fallos + desbloqueo por tiempo; inactivo no entra; ` Stahl` expirada/inactiva/revocada → 401 + evento `SESION_INVALIDA`; `debe_cambiar_contrasena` bloquea `documents` pero permite `change-password`.
5. Flujo punta a punta (con DB real): crear → subir versión → submit → checklist → approve → publish → lector la ve + timeline contiene los 5 eventos.
6. Restore/recovery real en entorno aislado: `create_backup` → corromper 1 archivo → `verify` falla → `restore_files` lo reemplaza + `restaurado_en` solo entonces (hoy `verify` no lo marca: test `1168` bien, falta el caso restore).
7. Reset password: temporal débil rechazada por política org; reutilización del temporal tras cambio; sesiones ajenas revocadas y la actual rotada.

### P1 — Errores, permisos y bordes (regresión = 500/409/UX rota)
8. `400` filtros inválidos (`type_id=Manual`, `ordering=foo`, `limit=abc`, `date_from=32/13`).
9. `409` duplicados reales con DB: código doc, `usuario/correo`, doble `submit` secuencial, restore de vigente.
10. `404` vs `403` no oracle: doc/revisión/backup/reporte ajeno → 404, no 403 ni 500.
11. Archivos: 0 bytes, 50 MB exacto/+1, `.PDF` mayúsculas, sin extensión, MIME↔ext cruzados (6×6), ZIP 2001 entries / 201 MB / `..` / `vbaProject.bin` / `.exe` interno (3 ya existen, faltan límites).
12. Revisiones: `return/reject` sin observación → 400; approve con checklist incompleto → 400; comentario en revisión resuelta → 409; `parent_id` de otra revisión → 400; resolve de `RESPUESTA` → 400.
13. Reportes: `scope` inválido, `format` minúsculas, schedule `next_run` pasado, `download` con snapshot `None` → 410 (no regenerar en silencio), `editor` no descarga reporte ajeno.
14. Paginación: `limit=0/101`, `offset=-5`, página vacía (`results:[]`, `count` correcto, `next_offset:null`).
15. Auditoría: `user_id` ajeno como no-admin → 403 + evento; `export` 10k no OOM (streaming o job); `search` con `%_` no rompe `ILIKE`.

### P2 — Integración real + frontend + e2e (hoy 0)
16. Cambiar `SimpleTestCase`→`TestCase` con Postgres efímero para: constraints (`uq`, `orden_version`, `es_vigente` parcial), `managed` vs unmanaged, `select_for_update`, `atomic` real (quitar `nullcontext`).
17. Contratos API (snapshot): `serialize_document/reader/review/report/backup` con `assertDictEqual` de claves (engancha P01 API: `version/download_url`).
18. Frontend (nuevo runner `vitest`): `normalizeDocument` nulos, `buildDocumentQuery` `name→id`, `Login` por rol (4 roles + multi-rol + `must_change`), `DocumentsView` primer-elemento (F02), formularios requeridos, `api.js` 401→logout y binarios.
19. E2E Playwright (4 recorridos): Admin crea usuario→asigna rol; Editor crea→versiona→envía; Revisor aprueba→publica; Lector lee→favorito→descarga. Reutilizar `.playwright-mcp/` como semillas, no como suite.
20. Carga/humo: listado 100 docs con `assertNumQueries`, export 1k filas sin OOM, backup con 50 archivos ficticios.

### P3 — Endurecimiento (cuando P0-P2 estén verdes)
21. Throttle/CSRF: `10/min` login (11º → 429), `change-password` 6º → 429, `POST` sin CSRF → 403.
22. XSS almacenado: resolución con `<script>` → guardada escapada y render sin ejecución (test + CSP).
23. IDOR fuzz: permutar los 70 UUIDs de rutas con usuario B (esperar 404/403, nunca 200 ni 500).
24. Migraciones: `migrate` en limpio + `constraints/indexes` presentes + datos semilla `PUBLICADO/PENDIENTE`.
25. Configuración: `DEBUG=False` exige `SECRET_KEY`; `CORS *` con credenciales arranca en error; `filesystem` en prod arranca en error.

## 5. Recomendación de harness (mínima, sin código)

- Backend: `TestCase` + Postgres de CI, `coverage>=90` en `documentos/{views,workflow,reader,backup,auth}*`, prohibir `nullcontext` para `atomic` y `require_permission` mockeado en tests de vistas (regla de lint de tests).
- Frontend: añadir `vitest + testing-library` (`test` script) y `playwright` con los 4 e2e de P2; `oxlint` ya existe, mantener.
- CI: workflow `backend (migrate+test+coverage)` + `frontend (lint+test+build)`; `.playwright-mcp/` no sustituye suite.
