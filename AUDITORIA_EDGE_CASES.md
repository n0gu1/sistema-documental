# AUDITORIA_EDGE_CASES — Cómo responde el sistema cuando las cosas salen mal

> Alcance: solo resiliencia ante fallos (lista pedida). Estático + contratos observados; sin explotar nada. Base: `documentos/*views.py`, `serializers.py`, `file_validation.py`, `backup_service.py`, `reports_views.py`, `authentication.py`, `views.py`, `frontend/src/api.js` y vistas.
> Fecha: 2026-09-05.

## 1. Veredicto: qué sí puede romper o dejar inconsistente

**Rompen o corrompen (actuar primero):** formatos en filtros → 500; duplicados en carrera (código/usuario/versión/orden/checklist); peticiones repetidas/doble-clic sin idempotencia; timeout (sin ningún timeout configurado) con `backup en_proceso` huérfano; S3/SMTP caídos con mensajes engañosos (`400`/`404` en vez de `503`); archivo corrupto propagado por restore (copia hash sin re-hashear); errores parciales sin rollback (doc sin versión, metadata a medias, S3 huérfano, auditoría ausente); rollback incompleto storage≠DB.

**Degradan pero no rompen:** vacíos/nulos/IDs inexistentes/formatos en serializers (400/404 correctos); demasiado largos/negativos (clamp + 400); demasiado grande en subida (400); no autenticado/sin permiso/sesión expirada en backend (401/403 correctos, frontend los deja en pantalla rota); eliminados durante uso (404 correcto salvo revisor inactivo); recarga (pierde estado local, posible duplicado al repetir).

## 2. Matriz por escenario

| Escenario | Comportamiento observado | ¿Rompe / inconsistente? | Sev. |
|---|---|---|---|
| datos vacíos | `search ''` → sin filtro; `description/comment` `allow_blank=True` ok; `metadata={}` **borra todas** (`exclude(clave__in=[])`); archivo 0B → `400 contenido no coincide` | **Parcial:** `metadata:{}` vacía como borrado total sin confirmación | MEDIO |
| datos nulos | `date/area?/comment` con `allow_null`/ausente ok; `metadata:null` → early-return (no borra); `file` ausente → crea doc sin versión (huérfano funcional) | **Parcial:** doc sin versión permitido | BAJO |
| IDs inexistentes | `.first()` → `404 {detail}` / listas vacías; `parse_version_id` inválido → `400` | No rompe (correcto) | BAJO |
| formatos incorrectos | Serializers (fecha/UUID/email/choices) → `400`; **pero filtros `type_id/area_id` crudos al ORM sin validar** → `ValueError` → 500 | **Sí rompe** | ALTO |
| demasiado largos | DRF `max_length` (64/200/1000/2000/5000/128) → `400`; clave metadata ≤100 + charset; filename 255 **sin check previo** → `IntegrityError` enmascarado a `400` genérico | No rompe (ruido) | BAJO |
| valores negativos | `limit/offset` clamp (`max(1)/max(0)`), `retention 1..3650`, `duration 0..86400`, `page≥1` → corrección silenciosa, no 400 | Inconsistente (silencioso) | BAJO |
| duplicados | `codigo/usuario/correo` → `409` en hilo único; `reviewer_ids/roles/perms` dedup → `400`; **sin constraint DB** → carrera duplica (código, usuario, `orden_version`, `es_vigente` doble, checklist `orden=count()`) | **Sí rompe** | ALTO |
| peticiones repetidas | Sin `Idempotency-Key`; `submit` 2ª vez → `409` (bien secuencial); backups/`generate`/`comments`/`restore` duplican siempre | **Sí rompe** | ALTO |
| pérdida conexión (cliente) | `fetch` sin timeout/retry/offline; CSRF previo duplica superficie (`/csrf/` falla → mutación ni se intenta, mensaje engañoso); cada vista solo `setError` | Degrada (cuelgue + reintento manual duplica) | MEDIO |
| DB no disponible | `Health` → `503 degraded` (bien); resto `OperationalError` no capturado → 500; `record_auth_event` traga excepción → **operación 200 sin auditoría** | **Inconsistente** | ALTO |
| API externa no disponible (SMTP/S3) | SMTP: notif creada + `error_correo`, workflow sigue (degradado bien); `SmtpTest` → `502 str(error)` (oracle); S3: `save/open` sin retry → `400` engañoso o `404` como “no existe” | **Parcial/inconsistente** | MEDIO |
| timeout | **Ninguno configurado**: `fetch` infinito, `boto3/smtplib` defaults, sin `statement_timeout`, gunicorn 30s mata backups/reportes/restores → fila `en_proceso` eterna | **Sí rompe** | ALTO |
| archivo inexistente | `open_stored_file` `FileNotFound/OSError` → `404`; backup `exists()` → `404`; reporte sin clave → regenera o `410` (inconsistente, ver B07) | Parcial (reporte) | MEDIO |
| archivo corrupto | Subida: magic+zip+hash → `400` (bien); descarga: sirve bytes tal cual (bien); backup: valida MAGIC/nonce/sha/manifiesto → `422` (bien); **restore copia `sha/tamaño` sin re-hashear** → corrupto certificado válido | **Sí (propaga)** | ALTO |
| archivo demasiado grande | Subida: `400` vs política org (bien); **salidas sin límite**: XLSX todo, PDF trunca 1000 en silencio, auditoría-export 10k en memoria, backup ZIP en `BytesIO` → OOM; frontend sin pre-check (sube para luego fallar) | **Sí (OOM)** | ALTO |
| no autenticado | Default `IsAuthenticated...`, `AllowAny` solo `csrf/login/health` → 401/403; `me catch→null` muestra login (bien); `window.open export` sin header pero con cookie → 401 JSON en pestaña (confuso) | No rompe | BAJO |
| sin permiso | `require_permission` → `403 {code,detail}` (bien); frontend solo toast, deja botones muertos | Degrada (UX) | BAJO |
| sesión expirada | Backend revoca + `401` diferenciada (bien); frontend **no auto-logout**: queda en dashboard roto; cambio clave infiere `remember` mal + hereda expiración vieja (B15); logout sin `Secure` (H05) | **Inconsistente** | MEDIO |
| eliminados durante uso | Doc archivado → `404` (bien); versión nunca se borra; rol/permiso desactivado → denegado al instante (bien); **revisor desactivado puede seguir decidiendo** (no re-chequea `activo`); área desactivada legible | Parcial | MEDIO |
| operaciones simultáneas | `select_for_update` en archivos/login/cambio clave (bien) pero sin lock de `Documento`, sin unique, sin retry `SERIALIZABLE`; `assign_roles/RolePermissions/permisos-doc` con carreras; dashboard lee 12 queries no atómicas | **Sí rompe** | ALTO |
| doble clic | Con `disabled={saving}` (backups/roles/some) bien; **sin pending**: `saveDraft`, `toggleFavorite`, `generateReport`, `createUser`, `decide` (comparte estado) → duplicados/toggle invertido | **Sí rompe** | MEDIO |
| recarga página | SPA sin router: pierde vista/filtros/página/selección/borrador/archivo en `useState`; `/me` re-autentica (bien); mutación en vuelo abortada puede haber creado → repetir duplica | **Pérdida + duplicado** | MEDIO |
| errores parciales | Doc creado + metadata/file fallan → huérfano; `save_metadata` delete+recreate sin atomic con `save`; notif sin correo inadvertido; backup `purge` fallido marca `fallido` pese a éxito; `restaurado_en` igual en files/full | **Sí (inconsistente)** | ALTO |
| rollback incompleto | Storage fuera de `atomic` → huérfanos S3 / DB sin fichero; auditoría fuera → éxito sin traza; S3 dentro de `SERIALIZABLE` en restore → archivos sin rollback; kill/timeout entre ambos deja divergencia sin GC | **Sí** | ALTO |

## 3. Detalle con evidencia (solo lo que rompe)

### E01 — Formatos en filtros → 500 (ALTO)
- **Evidencia:** `document_views.py:88-93` pasa `params['type_id'/...]` directo a `filter()` sin `parse_uuid/int`; `buildDocumentQuery` puede enviar nombre crudo si no halla en catálogo.
- **Impacto:** `500` en listados por typo; rompe monitorización (5xx) en vez de `400 INVALID_FILTER`.
- **Solución:** Validar `UUID/int` por filtro → `400`; test `type_id=Manual`.

### E02 — Duplicados en carrera (ALTO)
- **Evidencia:** `exists()`+`create` sin unique (`Documento.codigo`, usuario/correo, `orden_version`, `es_vigente`, `checklist.orden=count()`); `assign_roles` revive en vez de historiar.
- **Impacto:** Doble vigente, doble pendiente, códigos gemelos (ver B04/D02).
- **Solución:** Constraints parciales + `IntegrityError→409` + `FOR UPDATE OF documentos`.

### E03 — Reintentos/doble-clic sin idempotencia (ALTO)
- **Evidencia:** `api.js` sin `Idempotency-Key`/timeout; `BackupsView execute/save/restore`, `Reports generate`, `submit-review`, `comments`, `toggleFavorite`, `saveDraft`, `createUser` sin/dispar `pending`.
- **Impacto:** Doble respaldo/reporte/revisión/comentario/favorito invertido.
- **Solución:** `Idempotency-Key` 24h en `POST` + `pending` por botón + deshabilitar.

### E04 — DB/S3/SMTP caídos y timeouts (ALTO)
- **Evidencia:** Sin `statement_timeout`, `boto3/smtp/fetch` defaults; `CONN_MAX_AGE 600`; gunicorn 30s vs jobs de minutos; `except → 400/404` engañosos; `en_proceso` sin sweeper; `record_auth_event` traga fallo.
- **Impacto:** 500s, estados colgados, éxito sin auditoría, factura S3 huérfana.
- **Solución:** Timeouts (15s/120s), `503` con `Retry-After`, outbox auditoría, jobs async `202+poll`, sweeper `en_proceso>30m→fallido`.

### E05 — Archivos: corrupto propagado + salidas OOM (ALTO)
- **Evidencia:** Restore `:861-862` copia hash; XLSX sin corte vs PDF `[:1000]`; export auditoría 10k en memoria; backup `BytesIO` entero.
- **Impacto:** “Válido” corrupto; OOM workers; PDF que miente `filas`.
- **Solución:** Re-hashear tras copiar; un `row_limit` + `truncated`; streaming (`StreamingHttpResponse`/cursor/S3 multipart).

### E06 — Parciales/rollback (ALTO)
- **Evidencia:** Create `doc→metadata→file` secuencial sin un `atomic` único; storage dentro/fuera según path; auditoría post-commit; restore DB+S3 acoplados.
- **Impacto:** Huérfanos funcionales y divergencia DB↔S3↔bitácora.
- **Solución:** Un `atomic` para DB + outbox + GC huérfanos por `clave` sin referencia; separar `restore_db`/`restore_files` con estados propios.

### E07 — Sesión/recarga/concurrencia UX (MEDIO)
- **Evidencia:** `authentication.py` revoca bien; `Login.jsx` no redirige en 401; `EditorDocumentEditView` pierde `title/description/archivo` al recargar; `VersionsView limit=1` elige otro doc tras recarga.
- **Impacto:** Pantalla rota que parece viva; operar sobre registro equivocado (F02).
- **Solución:** Interceptor 401→logout+`?expired=1`, persistir borrador en `localStorage` (solo texto, no tokens), exigir `id` por ruta.

## 4. Lo que sí está bien (no tocar sin motivo)

- Vacíos/nulos/IDs/formatos en serializers (400/404), largos/negativos (clamp+400), subida grande (400), no-auth/sin-permiso (401/403), archivados (404), `BadZipFile`/MAGIC/sha/manifiesto (400/422/410), SMTP degradado sin tumbar workflow.
