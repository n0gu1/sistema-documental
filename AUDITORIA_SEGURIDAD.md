# AUDITORIA_SEGURIDAD — Específica (repositorio, sin explotación externa)

> Alcance: vulnerabilidades en el repo y su funcionamiento (lista pedida). **Sin explotar sistemas externos; sin leer `.env` (solo `.env.example`, `settings.py`, `render.yaml`, `.gitignore`); sin ejecutar payloads.** Base: `AUDITORIA_CONTEXTO.md`, `AUDITORIA_AUTH.md` (H01-H13), `AUDITORIA_API.md` (P01-P13), `AUDITORIA_DATABASE.md` (D01-D14) + verificación estática de `backend/settings.py`, `backend/urls.py`, `documentos/views.py`, `authentication.py`, `management/document/workflow/reader/audit/reports/backup/settings/notification_views.py`, `serializers.py`, `file_validation.py`, `security_utils.py`, `config_service.py`, `backup_service.py`, `frontend/src/*.jsx`, `requirements.txt`, `package.json`, `.env.example`, `render.yaml`.
> Fecha: 2026-09-05.

## 1. Veredicto

- **CRÍTICO explotable sin credenciales: no hallado.** No hay bypass de auth, RCE, SQLi, ni exfiltración anónima.
- **Riesgo real concentrado en cuentas con `usuarios.gestionar` + secretos débiles + subida/descarga.** Un `ADMINISTRADOR` (o gestor) comprometido escala a volcado total (`.sdbk`), SMTP/SSRF y restore.
- Prioridad: S01→S02→S03→S04→S05/S10→S06-S09→resto.

## 2. Tabla resumen

| ID | Severidad | Categorías | Problema |
|----|-----------|------------|----------|
| S01 | ALTO | autorización, control acceso, endpoints administrativos | `usuarios.gestionar` gobierna respaldos+config+SMTP → exfil `.sdbk` + persistencia |
| S02 | ALTO | secretos, credenciales, env, tokens, criptografía, almacenamiento contraseñas | Fallback `SHA256(SECRET_KEY)`, reuso backup/config, temporal en claro |
| S03 | ALTO | subida/descarga archivos, headers, path traversal (parcial) | Whitelist fuerte pero restore no re-hashea + `Content-Disposition` solo quita `"` (CRLF) |
| S04 | ALTO | autorización, control acceso, IDOR | Login sin org (DoS), sin-área bypass, catálogo lector excesivo; resto UUID+org+404 correcto |
| S05 | MEDIO | SSRF, validación entradas, exposición errores | SMTP host configurable + `str(error)` oracle; webhook/logo solo latentes (sin fetch servidor) |
| S06 | MEDIO | XSS | Almacenado mitigado; gap: resolución sin `sanitize` + `logo_url` sin esquema + `details` crudo en UI |
| S07 | MEDIO | autenticación, tokens, cookies, sesiones, CSRF, CORS | Base sólida; gaps: logout sin `Secure`, remember 30d, `SHA256` sin HMAC, throttle IP, sin MFA |
| S08 | MEDIO | path traversal | `serve_react` sin `normpath`; ZipSlip mitigado; storage keys seguras |
| S09 | MEDIO | criptografía, almacenamiento contraseñas | `PBKDF2`+`AESGCM` bien; falta pepper/HKDF/rotación |
| S10 | MEDIO | logs, exposición errores, info sensible | `str(error)` SMTP/verify al cliente; IP/UA retenidos; `error_correo` 2000 chars |
| S11 | MEDIO | validación entradas, serialización | DRF+filtros bien salvo UUID/filtros, `ordering` silencioso, logo solo longitud |
| S12 | BAJO | inyección SQL | **No hallado** (todo `%s`, allowlist columnas) |
| S13 | BAJO | command injection, ejecución código | **No hallado** (sin shell/`eval`/`pickle`/`yaml-unsafe`) |
| S14 | BAJO | headers, CORS, configuraciones inseguras | HSTS/NOSNIFF/REFERRER/DENY bien; falta CSP; `DEBUG` dev por defecto; `/admin/` expuesto |
| S15 | BAJO | dependencias peligrosas | Pinneadas y recientes; sin `pip-audit`; uso seguro `openpyxl/reportlab` |
| S16 | BAJO | serialización/deserialización | Solo JSON + `ZipFile` acotado (2000/200MB, no `..`, no macros/ejecutables) |
| S17 | BAJO | permisos archivos, variables entorno | S3 privado (`ACL None`, `QUERYSTRING_AUTH`, `OVERWRITE False`); `filesystem` solo `DEBUG`; `.env` ignorado |

---

## 3. Hallazgos detallados

### S01 — ALTO — Autorización / control de acceso / endpoints administrativos: privilegio excesivo
- **Archivo:** `documentos/backup_views.py:29,106-286`, `documentos/settings_views.py:17-18,51-136`
- **Componente:** `BACKUP_PERMISSION='usuarios.gestionar'`, `SystemSettings/SmtpTest/IntegrationTest`
- **Problema:** Crear/descargar/restaurar `.sdbk` (volcado DB+archivos), cambiar seguridad/carga/SMTP/integraciones y probar SMTP exigen el mismo permiso que gestionar usuarios. Un gestor de usuarios obtiene exfiltración total y persistencia (SMTP propio, `restore` lógico).
- **Evidencia:** `BACKUP_PERMISSION='usuarios.gestionar'` + 7 `require_permission`; `READ/WRITE='usuarios.consultar/gestionar'` en settings; detalle en `AUDITORIA_AUTH.md:H02`.
- **Impacto:** Takeover de org con una sola cuenta no-admin; robo `.sdbk` atacable offline si S02.
- **Solución:** Permisos `respaldos.gestionar`, `configuracion.gestionar/consultar`; denegar `download/restore` sin MFA/step-up; auditar asignaciones.

### S02 — ALTO — Secretos / credenciales / env / tokens / almacenamiento contraseñas
- **Archivo:** `documentos/backup_service.py:128-138`, `documentos/config_service.py:132,141,243-262`, `documentos/management_views.py:545-565`, `backend/settings.py:33-36,216`, `render.yaml:9-109`
- **Componente:** `backup_key()`, `encrypt/decrypt_secret`, `UserResetPasswordView`, `.env`
- **Problema:** (a) Sin `BACKUP_ENCRYPTION_KEY`, `backup_key()=SHA256(SECRET_KEY)` sin salt/KDF; SMTP deriva `SHA256(key+b'config')` (reuso con suffix). Sin rotación (checklist pendiente). (b) Reset devuelve `temporary_password=token_urlsafe(12)` en JSON y la UI lo pinta en `notice` (queda en proxy/historial). Política débil en creación vs fuerte en cambio (ver `H03`). (c) Sesiones `SHA256(token)` sin HMAC/pepper (entropía 48B salva, pero sin defensa en profundidad).
- **Evidencia:** `return hashlib.sha256(settings.SECRET_KEY...).digest()`; `AESGCM(hashlib.sha256(backup_key()+b'config')...)`; `return {...'temporary_password':...}`; `.env.example` limpio + `.env` ignorado (`AUDITORIA_AUTH.md:H03/H07`).
- **Impacto:** Fuga `SECRET_KEY`→descifra respaldos+SMTP; interceptación del temporal→takeover hasta cambio.
- **Solución:** Exigir `BACKUP_ENCRYPTION_KEY` 32B en prod (fail-fast), `HKDF` separada por dominio, no devolver secreto (flujo una-sola-vista + expiración), `HMAC` tokens, rotación versionada. **No se leyó `.env`.**

### S03 — ALTO — Subida / descarga archivos + headers
- **Archivo:** `documentos/file_validation.py:9-113`, `documentos/document_views.py:423-473,849-862,1117-1158`, `documentos/backup_service.py:875-960`
- **Componente:** `validate_uploaded_file`, `save/restore`, `FileResponse`
- **Problema (positivo + gaps):** Whitelist ext+MIME+magic bytes, anti-zip-bomb (2000/200MB, no `..`, no `vbaproject.bin`, no `.bat/.exe/.js/...`), `SHA256`, límites por org — **sólido**. Gaps: (a) restore copia `tamano/sha256` del origen sin re-hashear el objeto copiado → hash miente si S3 corrompe; (b) `Content-Disposition: attachment/inline; filename="{original.replace('"','')}"` solo quita `"` — no filtra `\r\n` (inyección cabecera teórica; Django valida gran parte, pero no confiar); (c) preview `inline` con `content_type` de DB (de la whitelist, bien) pero sin `X-Content-Type-Options` por respuesta (global sí) ni `Content-Security-Policy: sandbox`.
- **Evidencia:** Líneas citadas; `PREVIEWABLE_MIMES={pdf,jpeg,png}` (sin HTML) — bien.
- **Impacto:** Hash falso rompe `compare`/`verify`; CRLF→respuesta dividida en proxies viejos; `inline` sin sandbox amplía XSS si un día entra HTML/SVG.
- **Solución:** Re-hashear tras copiar; `filename*=UTF-8''+quote()` (RFC5987) + strip `[\r\n]`; `Content-Security-Policy: sandbox` en preview + `X-Content-Type-Options: nosniff` por respuesta.

### S04 — ALTO — Autorización / IDOR (residual; base correcta)
- **Archivo:** `documentos/views.py:82-89`, `documentos/reader_access.py:24-79`, `documentos/document_views.py:265-280`, `workflow_views.py:191-208`, `frontend/src/ReaderLibraryView.jsx:82`
- **Componente:** Login multi-tenant, área, objetos UUID
- **Problema:** Base correcta (UUID no secuenciales, `organizacion_id` en casi todo + `404` anti-oráculo). Restos: login sin `organizacion_id` (colisión cross-org→DoS, `H01`); sin `area_id`→bypass área (`H04`); lector llama `GET /documents/catalogs/` general y aprende taxonomía/usuarios (`P10`).
- **Evidencia:** Ver `AUDITORIA_AUTH.md:H01/H04/H12`, `AUDITORIA_API.md:P10`.
- **Impacto:** DoS selectivo, horizontal silencioso, enumeración interna.
- **Solución:** Org en login, `area_id` obligatoria o exención explícita, catálogo lector mínimo.

### S05 — MEDIO — SSRF / validación entradas (servidor no hace fetch salvo SMTP)
- **Archivo:** `documentos/settings_views.py:77-110`, `documentos/config_service.py:192-208`, `documentos/notifications.py:54-70`
- **Componente:** `SmtpTestView`, `webhook/logo/client_id`
- **Problema:** Único fetch servidor real: SMTP (`host:port` configurable por `usuarios.gestionar` + `message.send()` a `recipient` validado). Permite sondear red interna (conexión/tiempo) y el `str(error)` devuelve el oracle al cliente (ver S10). `webhook.url` exige `https` pero no se fetchea hoy; `logo/favicon_url` solo longitud (500) y no se renderizan como `<img>` hoy (preview usa icono) → latentes, no activos. `S3_ENDPOINT` solo por env, no por usuario — bien.
- **Evidencia:** `EmailMessage(...to=[recipient], connection=...).send()`; `except Exception as error: ... {'detail': f'No fue posible...: {error}'}, 502`.
- **Impacto:** SSRF autenticada (privilegiada) + enumeración red/DNS vía tiempo/error.
- **Solución:** Allowlist/denylist SMTP (bloquear `169.254.0.0/16,10/8,172.16/12,192.168/16,::1`, puerto 25/587/465 solo), timeout 5s, throttling `smtp/test`, mensaje genérico al cliente + detalle en log.

### S06 — MEDIO — XSS (almacenado/reflejado)
- **Archivo:** `documentos/security_utils.py:1-12`, `serializers.py`, `workflow_views.py:657-659`, `frontend/src/*.jsx`
- **Componente:** `sanitize_text(strip_tags)`, comentarios, `logo_url`, auditoría
- **Problema (mayoría mitigado):** Títulos/descripciones/comentarios/checklist pasan `strip_tags` + React escapa por defecto; **no hay `dangerouslySetInnerHTML`** en frontend (verificado); preview sin HTML. Gaps: resolución de comentario (`request.data['content']`) entra **sin** `sanitize_text` (inconsistente con creación); `logo_url/favicon_url` sin validación de esquema (hoy no se renderizan, riesgo futuro); `AuditView` hace `JSON.stringify(details)` en celda (React lo escapa, bien, pero `details` puede traer HTML guardado pre-sanitize).
- **Evidencia:** `grep dangerouslySetInnerHTML` vacío; `workflow_views.py:657 resolution=request.data.get(...)` sin sanitize vs `:107 validate_content→sanitize`.
- **Impacto:** XSS almacenado vía resolución (se muestra en `Observaciones`), futuro via branding.
- **Solución:** Sanitizar resolución igual, validar `logo/favicon` con `http(s)` + allowlist dominios, CSP (ver S14).

### S07 — MEDIO — Autenticación / tokens / cookies / sesiones / CSRF / CORS
- **Archivo:** `documentos/views.py:42-52,225-227`, `authentication.py:33-89`, `backend/settings.py:74-87,182-199,252-256`
- **Componente:** `sd_session`, `CookieTokenAuthentication`, throttles, MFA ausente
- **Problema:** Base sólida (`HttpOnly`, `Secure=!DEBUG`, `SameSite=Lax`, `enforce_csrf`, `pbkdf2`, `DUMMY` anti-enumeración, CORS bloquea `*` con credenciales). Gaps ya probados: logout sin `Secure` (H05), remember 30d sin rotación + inferencia frágil (H06), `SHA256` sin HMAC (H07), throttle `10/min` solo IP burlable con `X-Forwarded-For` (IP también usada para auditoría), sin MFA (H09), sesiones ilimitadas sin pinning (H10).
- **Evidencia:** Ver `AUDITORIA_AUTH.md:H05-H10`.
- **Impacto:** Fijación/ventana robo larga, DoS bloqueo, stuffing lento.
- **Solución:** Ver H05-H10 (delete con `Secure`, `remember` persistido+rotado, `HMAC`, throttle por cuenta, TOTP admin, no confiar `XFF` salvo proxy conocido).

### S08 — MEDIO — Path traversal
- **Archivo:** `backend/urls.py:29-42`, `documentos/file_validation.py:54-57`, `document_views.py:434,846`, `backup_service.py:944-960`
- **Componente:** `serve_react`, OOXML, storage keys
- **Problema:** `serve_react` hace `os.path.join(REACT_DIST, path)` + `isfile` sin `normpath`/contención → `../` teórico (mitigado por normalización URL de Django/Gunicorn, pero sin chequeo explícito). Contrapesos verificados: OOXML rechaza `..`/absolutas, storage keys son `{org}/{doc}/{uuid}{ext}` (no input), descargas usan `clave_almacenamiento` de DB (no input), restore valida columnas/PK.
- **Evidencia:** `file_path=os.path.join(REACT_DIST,path)` sin `commonpath`; `if '..' in parts` en zip — bien.
- **Solución:** `normpath` + `commonpath==REACT_DIST` else `404`; test `/%2e%2e/backend/settings.py`.

### S09 — MEDIO — Criptografía / almacenamiento contraseñas
- **Archivo:** `documentos/backup_service.py:141-155`, `config_service.py:130-141`, `views.py:250,383,548`, `backend/settings.py:267-272`
- **Componente:** `AESGCM`, `make_password/check_password`, validadores
- **Problema:** Bien: `AES-256-GCM` con nonce 12B aleatorio, `pbkdf2` Django + 4 validadores + política org (`min 12`, `high`). Falta: pepper/HKDF/rotación (ver S02), expiración `90d` solo configurada no enforced (checklist), `MinimumLengthValidator` Django default (8) menor que política org (12) en creación (doble estándar, ver `H03`).
- **Solución:** Unificar política org en creación/reset/cambio, pepper separado, `HKDF`, job expiración.

### S10 — MEDIO — Información sensible en logs / exposición de errores
- **Archivo:** `documentos/settings_views.py:107-108`, `backup_views.py:151,272,294`, `reports_views.py:495`, `backend/settings.py:283-310`, `documentos/models.py` (`direccion_ip/agente_usuario/error_correo`)
- **Componente:** Errores API + stderr Render
- **Problema:** `SmtpTest`/`verify`/`ReportSnapshotError` devuelven `str(error)` al cliente (`502/422/410` con detalle red/SO). `logger.exception` con tracebacks va a stderr (Render, interno — bien) pero incluye rutas. IP/UA guardados en `sesiones/accesos/bitácora` sin máscara/retención; `error_correo[:2000]` puede guardar traza SMTP. Acierto: `temporary_password` **no** se loguea (solo response) y `record_*` no incluye secreto.
- **Evidencia:** `{'detail': f'No fue posible enviar...: {error}'}`; `{'valid':False,'detail':str(error)}`.
- **Solución:** Mensaje genérico al cliente + `trace_id` + detalle en log; máscara IP `/24` + familia UA; retención 90d; `error_correo` sin headers.

### S11 — MEDIO — Validación entradas / serialización
- **Archivo:** `serializers.py`, `document_serializers.py`, `workflow_views.py:53-120`, `config_service.py:144-209`
- **Componente:** DRF + `sanitize_text` + `validate_section`
- **Problema:** Cobertura buena (UUID/int/fechas/choices/longitudes, `validate_email` en SMTP-test, `https` en webhook, subset extensiones). Gaps: filtros `type_id/area_id` sin validar UUID (500 tardío, ver `P08`), `ordering` fallback silencioso, `logo/favicon` solo longitud, `extensions.join(',')` frágil, `metadata` claves `alnum/._-` bien pero valores `str()` sin límite salvo `sanitize`.
- **Solución:** `parse_uuid` en filtros, `400 INVALID_ORDERING/FILTER`, validador URL `http(s)`, tamaño máx. metadata.

### S12 — BAJO — Inyección SQL: no hallado
- **Archivo:** `auth_utils.py`, `reader_access.py`, `audit_views.py:75-160`, `document_views.py:291-309,1024-1063`, `backup_service.py:167-311,1010-1046`
- **Componente:** Todo `connection.cursor().execute(sql, params)`
- **Problema:** **No hay concatenación de valores.** Todo valor va en `%s` (incl. `ILIKE`, `LIMIT/OFFSET`). Únicos `f-string` interpolan identificadores de allowlist (`timestamp_column` de 6 candidatos vía `information_schema`, `ordering_fields`, `BACKUP_SCHEMA`, `quote_name`) o constantes (`INTERVAL '24 hours'`). Ver `AUDITORIA_DATABASE.md:D12`.
- **Evidencia:** `cursor.execute('...WHERE table_schema=%s...',[BACKUP_SCHEMA])`; `audit_query_parts` solo interpola columna validada.
- **Solución (endurecer):** Congelar allowlists + `flake8-bandit B608` en CI.

### S13 — BAJO — Command injection / ejecución código: no hallado
- **Componente:** Repo completo
- **Problema:** Sin `os.system/subprocess/eval/exec/pickle/yaml.load/__import__` dinámico en código producto (el único `__import__('openpyxl')` está en `tests.py:692`). Sin `shell=True`, sin management commands con shell, sin `mark_safe`.
- **Evidencia:** `grep` §2 (cero en `documentos/*.py` producto).
- **Solución:** Mantener lint que prohíba `subprocess/eval/pickle`.

### S14 — BAJO — Headers / CORS / configuraciones inseguras
- **Archivo:** `backend/settings.py:61-87,252-264`, `backend/urls.py:50-54`, `.env.example:1-5`
- **Componente:** Middleware, HSTS, `/admin/`, `DEBUG`
- **Problema (mayoría bien):** `SecurityMiddleware+WhiteNoise`, `HSTS 1a+sub+preload`, `NOSNIFF`, `REFERRER same-origin`, `DENY`, `CSRF/SESSION Secure`, CORS sin `*`, `filesystem` prohibido en prod, `SECRET_KEY` exigida en prod. Gaps: **sin `Content-Security-Policy`** (importante con `iframe` preview + futuros logos), sin `Permissions-Policy`, sin `Cross-Origin-Opener/Embedder`; `DEBUG=True` por defecto en `.env.example` (dev bien, pero `ENVIRONMENT` ausente→`DEBUG True` fail-open si se olvida env en prod — `render.yaml` sí fija `False`); `/admin/` Django expuesto con login por defecto (sin `ADMIN_URL` secreta ni 2FA; `admin.py` vacío pero el sitio responde); `MEDIA` solo en `DEBUG` — bien.
- **Evidencia:** Líneas citadas; ausencia `CSP` en `settings.py`/respuestas.
- **Solución:** CSP (`default-src 'self'; frame-src 'self' blob:; img-src 'self' data: https:; object-src 'none'`) + `Permissions-Policy`, `ADMIN_URL` secreta o `StaffOnly`, `DEBUG=False` por defecto si `ENVIRONMENT=production` ausente.

### S15 — BAJO — Dependencias peligrosas visibles
- **Archivo:** `requirements.txt`, `frontend/package.json`
- **Componente:** 12 PyPI + React/Vite
- **Problema:** Pinneadas (`==`/`^` con lock) y recientes (Django 5.2.17, DRF 3.18, `cryptography` 46, `boto3` 1.40, `gunicorn` 23, React 19, Vite 8). Uso seguro verificado: `openpyxl` solo lectura/escritura con límites zip propios, `reportlab` con `Table` de strings (no `Paragraph` con datos usuario salvo `scope` enum), `ZipFile` acotado. Sin `pickle/lxml/eval`. Falta: `pip-audit/npm-audit` en CI y `dependabot`.
- **Evidencia:** `requirements.txt:1-12`, `package.json:12-22`.
- **Solución:** `pip-audit` + `npm audit` en CI + `dependabot.yml` semanal.

### S16 — BAJO — Serialización / deserialización
- **Archivo:** `auth_utils.py:120 (json.dumps)`, `document_views.py:959-964 (json.loads try)`, `backup_service.py:1151-1316 (ZipFile+AESGCM+manifest)`, `file_validation.py:49-68`
- **Componente:** JSON + ZIP + `.sdbk`
- **Problema:** Solo JSON (`loads` con `try`→`{}`), sin `pickle/yaml`. ZIP con límites y validación. `.sdbk` (`MAGIC+nonce+AESGCM→Zip`) valida `MAGIC`, tamaño, `organization_id` triple (manifest/db/reconstruction vs registro), artefactos requeridos y `complete vs missing_files` — **sólido**. Riesgo menor: `ZipFile.read()` entero en memoria (respaldos grandes→OOM) y `archive.close()` en `finally`/`except` correcto pero sin `with` en `load_backup_archive` (olvido de `close` si el llamante no lo hace — `verify_backup` sí cierra en `finally`).
- **Evidencia:** `load_backup_archive:1276 archive=ZipFile(...)` + `verify_backup:1371 finally: archive.close()`.
- **Solución:** `with ZipFile(...)` o `try/finally` en el loader, streaming por miembros, límite tamaño descomprimido también en restore (hoy solo en upload).

### S17 — BAJO — Permisos archivos / variables entorno
- **Archivo:** `backend/settings.py:212-250`, `render.yaml`, `.gitignore:10,18`, `.env.example`
- **Componente:** S3, `MEDIA_ROOT`, `.env`, `db.sqlite3`
- **Problema (bien):** S3 `ACL None` (privado) + `QUERYSTRING_AUTH True` + `OVERWRITE False` + `LOCATION documentos`; `filesystem` bloqueado en prod; `.env`/`db.sqlite3`/`media/` ignorados (verificado `git check-ignore`); `.env.example` sin secretos; `render.yaml` con `generateValue` (SECRET) y `sync:false` (AWS/BACKUP/SMTP). Sin `os.chmod` en código. `db.sqlite3` residual local (no prod).
- **Evidencia:** Líneas citadas + `bash: git check-ignore .env db.sqlite3` OK (no se leyó `.env`).
- **Solución:** Rotar si `.env` tocó git alguna vez (`git log --all -- .env`), `umask 027` en despliegue, `MEDIA_ROOT` fuera del docroot.

## 4. Cobertura pedida (trazabilidad)

| Pedido | Estado | Dónde |
|---|---|---|
| autenticación | Base sólida + H05-H10 | S07 |
| autorización | Privilegio excesivo S01 + residual S04 | S01/S04 |
| control de acceso | Idem + `404` anti-oráculo bien | S01/S04 |
| IDOR | Mitigado UUID+org+404 salvo S04 | S04 |
| inyección SQL | **No hallado** | S12 |
| command injection | **No hallado** | S13 |
| XSS | Mitigado salvo resolución/logo | S06 |
| CSRF | `enforce_csrf` + doble token bien; logout S07 | S07 |
| SSRF | SMTP real; resto latente | S05 |
| path traversal | `serve_react` + zip mitigado | S08 |
| subida archivos | Whitelist fuerte + gaps hash | S03 |
| descarga archivos | Auth + whitelist MIME + CRLF | S03 |
| secretos | Fallback + temporal | S02 |
| credenciales | Temporal + política dual | S02 |
| variables entorno | `.env` ignorado, example limpio | S17 |
| tokens | Entropía bien, hash/KDF mal | S02/S07 |
| cookies | Flags bien salvo delete | S07 |
| sesiones | Expiración/idle bien salvo rotación | S07 |
| CORS | Allowlist, bloque `*` | S14 |
| headers | HSTS/etc bien, falta CSP | S14 |
| criptografía | `AESGCM`/`PBKDF2` bien, KDF/rotación mal | S09 |
| almacenamiento contraseñas | `make_password` bien, pepper no | S09 |
| info sensible en logs | `str(error)` + IP/UA | S10 |
| exposición errores | Genéricos bien salvo SMTP/verify | S10 |
| endpoints administrativos | `usuarios.gestionar` excesivo + `/admin/` | S01/S14 |
| configuraciones inseguras | `DEBUG` dev + CSP/admin | S14 |
| dependencias peligrosas | Pinneadas/recientes, sin audit CI | S15 |
| validación entradas | DRF fuerte salvo filtros/logo | S11 |
| serialización | JSON+ZIP acotado | S16 |
| ejecución código | **No hallado** | S13 |
| permisos archivos | S3 privado, FS solo dev | S17 |

## 5. Recomendaciones priorizadas (sin explotar nada)

1. **S01:** permisos `respaldos.*`/`configuracion.*` + step-up para `download/restore`.
2. **S02:** `BACKUP_ENCRYPTION_KEY` obligatoria, `HKDF` por dominio, secreto temporal fuera de JSON.
3. **S03:** re-hash restore, `filename*` RFC5987, `sandbox` en preview.
4. **S05+S10:** SMTP allowlist + timeout + error genérico + `trace_id`.
5. **S06+S14:** sanitizar resolución, validar `logo` `https:`, CSP.
6. **S07:** fix `delete_cookie`, rotar remember, `HMAC`, throttle cuenta, MFA admin.
7. **S08:** `normpath+commonpath` en `serve_react`.
8. **S15+S11:** `pip-audit/npm-audit` + `B608` + `parse_uuid`/allowlist `ordering`.
