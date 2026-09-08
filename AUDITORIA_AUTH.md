# AUDITORIA_AUTH — Identidad, autenticación, sesiones, roles y autorización

> Alcance estricto: solo mecanismos de identidad/autenticación/sesiones/roles/permisos/autorización. No es auditoría de seguridad completa. No se modificó código. Base: `AUDITORIA_CONTEXTO.md` + lectura de `backend/settings.py`, `documentos/views.py`, `authentication.py`, `permissions.py`, `auth_utils.py`, `reader_access.py`, `serializers.py`, `management/document/workflow/reader/audit/reports/backup/settings/notification_views.py`, `documentos/urls.py`, `frontend/src/Login.jsx`, `api.js`.
> Fecha: 2026-09-05.

## 1. Superficie analizada

- **Auth:** `POST /api/auth/login/`, `GET /api/auth/me/`, `POST /api/auth/logout/`, `POST /api/auth/change-password/`, `GET /api/auth/csrf/`, `GET /api/health/` (ver `documentos/urls.py`, `documentos/views.py`).
- **Sesión:** cookie `sd_session` (`settings.AUTH_COOKIE_NAME`), `SesionDocumental.hash_token=SHA256(token)`, `expira_en`, `ultima_actividad_en`, `revocada_en` (ver `authentication.py`, `views.set_auth_cookie`).
- **RBAC:** `get_user_roles/get_user_permission_codes/user_has_permission` (SQL `usuarios_roles/roles_permisos`, bypass `ADMINISTRADOR`), `require_permission()` manual, `IsAuthenticatedAndPasswordCurrent` por defecto, `HasDocumentalPermission` muerta (ver `auth_utils.py:20-61`, `management_views.py:44-52`, `permissions.py`).
- **ACL:** `has_area_permission` (área), `has_document_permission` (`documentos_roles_permisos` + fallback área/creador), `is_reader_user` (8 `MANAGEMENT_PERMISSIONS`), `published_document_queryset/version`, `get_accessible_published_document→404` (ver `reader_access.py`).
- **Objetos:** `get_user_for_organization`, `get_document_or_404` (org+perm), `get_review_or_404` (org+revisor/solicitante/admin), `get_backup_or_404` / reportes / notificaciones (org y/o `usuario_id`), `require_audit_access` (admin o propio) (ver `management_views.py:173`, `document_views.py:265`, `workflow_views.py:191`, `backup_views.py:95`, `reports_views.py:486`, `notification_views.py:41`, `audit_views.py:53`).
- **Frontend:** `Login.jsx:264-283` elige dashboard por `role.code`; `api.js:9-30` usa `credentials:include` + `X-CSRFToken` desde `/api/auth/csrf/`, sin `localStorage`/tokens JS.

## 2. Tabla resumen

| ID | Severidad | Archivo | Problema |
|----|-----------|---------|----------|
| H01 | ALTO | `documentos/views.py:82-89` | Login multi-tenant ambiguo sin `organizacion_id` (DoS/validación incorrecta) |
| H02 | ALTO | `documentos/backup_views.py:29`, `settings_views.py:17-18` | Respaldos y configuración exigen `usuarios.gestionar` (privilegio excesivo / escalado vertical) |
| H03 | ALTO | `management_views.py:545,559-565`, `serializers.py:72-77` | Reset devuelve contraseña en claro + política débil en creación/reset |
| H04 | MEDIO | `reader_access.py:24-29,70-79`, `management_views.py:180-187` | Usuarios sin `area_id` omiten filtro de área (acceso horizontal por diseño) |
| H05 | MEDIO | `documentos/views.py:42-52 vs 226` | Logout incompleto (`delete_cookie` sin `Secure/HttpOnly`) |
| H06 | MEDIO | `views.py:117-129,264`, `settings.py:184-185`, `authentication.py:74-82` | Remember 30d sin rotación + inferencia `remember` frágil + inactividad confusa |
| H07 | MEDIO | `authentication.py:14-15`, `backup_service.py:128-138`, `config_service.py:132,141` | Tokens `SHA256` sin HMAC/pepper + `BACKUP_ENCRYPTION_KEY` cae a `SHA256(SECRET_KEY)` + reuso clave |
| H08 | MEDIO | `permissions.py:21-35`, `management_views.py:44`, `views.py:197-198` | Enforcement manual inconsistente + clase muerta + `CurrentUser` inconsistente |
| H09 | MEDIO | `views.py:34-39,95-115`, `settings.py:196-199` | Sin MFA + bloqueo por cuenta permite DoS + throttle solo IP |
| H10 | BAJO | `authentication.py:84-87`, `management_views.py:71-73,115-129` | Sesiones ilimitadas, sin pinning IP/UA, fingerprint débil, escritura por request |
| H11 | BAJO | `Login.jsx:266`, `workflow_views.py:436`, `reader_access.py:8-21`, `document_views.py:369-378` | Roles inconsistentes `REVISOR/REVIEWER`, `is_reader_user` heurístico, catálogo global |
| H12 | BAJO | `Login.jsx:264-283`, `ReaderLibraryView.jsx:82`, `management_views.py:55-68` | Solo UX en frontend (sin bypass real) pero oculta roles y expone catálogos/metadatos |
| H13 | MEJORA | `audit_views.py:53-59,74-119`, `reader_views.py:188-230` | Endurecer auditoría propia e historial (exponen IP/UA, `user_id` manipulable contenido) |

**No hallado (verificado):** bypass directo de autenticación, endpoints sin autenticación (salvo `csrf/login/health` intencionales), tokens en `localStorage`, IDs secuenciales (son UUID), `HasDocumentalPermission` no deja ruta abierta hoy (riesgo futuro, ver H08), recuperación self-service (no existe; solo admin, ver H03).

---

## 3. Hallazgos detallados

### H01 — ALTO — Validación incorrecta de credenciales / acceso horizontal: login sin ámbito de organización
- **Archivo:** `documentos/views.py:82-89`
- **Componente:** `LoginView.post()`
- **Problema:** La identidad (`nombre_usuario|correo`) se busca globalmente sin `organizacion_id`. Si el mismo `correo`/`usuario` existe en 2 organizaciones, `len(matches)!=1` → `check_password(DUMMY)` → `INVALID_CREDENTIALS` siempre (DoS legítimo). Además el `security_policy` (intentos/bloqueo/duración) se carga de `user.organizacion_id` del registro emparejado, sin que el llamante elija tenant.
- **Evidencia:** `matches = list(UsuarioDocumental.objects.select_for_update().filter(Q(nombre_usuario=identity)|Q(correo=identity))[:2])` + `if len(matches)!=1: check_password(password, DUMMY_PASSWORD_HASH)`; creación sí es por org con `correo__iexact` único por org (`management_views.py:361-368`), luego duplicados cross-org son posibles.
- **Impacto:** Usuarios legítimos con email repetido cross-org no pueden entrar; política de bloqueo/sesión ambigua; oracle parcial por tiempo si hay 0 vs 1 vs 2 matches (mitigado por DUMMY pero no idéntico por queries extra).
- **Solución recomendada:** Exigir `organization_id` (o `codigo` org) en login o login en dos pasos (identificar org → autenticar scopeado); filtrar `organizacion_id` en la query; mantener mensaje genérico y `DUMMY` + tiempo constante.

### H02 — ALTO — Escalamiento vertical: permisos contradictorios / privilegio excesivo en respaldos y configuración
- **Archivo:** `documentos/backup_views.py:29`, `documentos/settings_views.py:17-18`
- **Componente:** `BACKUP_PERMISSION='usuarios.gestionar'`, `READ='usuarios.consultar' / WRITE='usuarios.gestionar'`
- **Problema:** Operaciones críticas (crear/descargar/restaurar `.sdbk` con DB+archivos, cambiar SMTP/seguridad/carga/integraciones, `smtp/test`, `integrations/<prov>/test`) se autorizan con permiso de gestión de usuarios. Viola least-privilege: un gestor de usuarios obtiene exfiltración total y persistencia (SMTP propio, restore).
- **Evidencia:** `backup_views.py:29 BACKUP_PERMISSION='usuarios.gestionar'` + `106,138,162,179,233,251,286 require_permission(request, BACKUP_PERMISSION)`; `settings_views.py:17-18 READ/WRITE = usuarios.*` + `51,59,78,117 require_permission(...)`.
- **Impacto:** Compromiso de cuenta user-manager → robo `.sdbk` cifrado (atacable offline si H07), restore destructivo lógico, hijack correo/notificaciones, cambio `max_file_mb/extensions` para subir payloads.
- **Solución recomendada:** Crear permisos `respaldos.gestionar`, `configuracion.gestionar`, `configuracion.consultar`; migrar vistas; separar `usuarios.gestionar` de infra. Auditar asignaciones `ADMINISTRADOR` existentes.

### H03 — ALTO — Contraseñas manejadas incorrectamente / secretos expuestos / recuperación insegura
- **Archivo:** `documentos/management_views.py:545,547-565`, `documentos/serializers.py:58-77 vs 16-55`
- **Componente:** `UserResetPasswordView.post()`, `UserCreateSerializer.validate_temporary_password`
- **Problema:** (a) El reset admin genera `secrets.token_urlsafe(12)` (~72-96 bits efectivos, corto) y lo devuelve en JSON `{'temporary_password': ...}` — queda en logs proxy/historial, visible a cualquier admin con `usuarios.gestionar`, sin canal seguro ni caducidad propia salvo `debe_cambiar_contrasena`. (b) Creación/reset solo aplican `validate_password` Django, mientras `ChangePasswordSerializer` además aplica `security_policy_for` (`min_length` org default 12 + `complexity high` 4 clases). Inconsistencia: se permite crear temporal débil que luego el cambio exige fuerte.
- **Evidencia:** `temporary_password = secrets.token_urlsafe(12)` + `update(hash_contrasena=make_password(...), debe_cambiar_contrasena=True...)` + `return {... 'temporary_password': temporary_password}`; `serializers.py:72-77` solo `validate_password` vs `:43-53` policy extra en cambio.
- **Impacto:** Interceptación del temporal = takeover hasta que la víctima cambie; ventana larga si no entra; débiles temporales aceptados inicialmente.
- **Solución recomendada:** No devolver secreto en API: mostrar una sola vez con confirmación + expiración corta (ej. 24h `temporal_expira_en`) + invalidar en primer uso; aplicar misma `security_policy_for(organizacion_id)` en creación/reset (longitud/complejidad); forzar `token_urlsafe(24+)`; enviar por email si SMTP verificado, si no flujo out-of-band; auditar `USUARIO_MODIFICADO` ya existe, añadir `expira_en` al evento.

### H04 — MEDIO — Acceso horizontal indebido por usuarios sin área
- **Archivo:** `documentos/reader_access.py:24-29,70-79`, `documentos/management_views.py:180-187`
- **Componente:** `has_area_permission()`, `has_document_permission()`, `validate_area_assignment()`
- **Problema:** `has_area_permission` retorna `True` si `user.area_id` es nulo; `has_document_permission` retorna `global_permission` sin comprobar `document.area/creado_por` para esos usuarios (`70-71`). `validate_area_assignment(None)` también `True`, y `UserCreate area_id` es opcional. Resultado: cualquier usuario sin área (por defecto posible) elude el confinamiento por área aunque tenga permisos bajos.
- **Evidencia:** `if not getattr(user,'area_id',None): return True` (`:24-26`); `if not getattr(user,'area_id',None): return global_permission` (`:70-71`); `if area_id is None: return True` (`management_views.py:180-182`).
- **Impacto:** Lector/editor sin área ve todas las áreas de su org (si tiene `documentos.consultar/gestionar`); un admin puede ampliar alcance creando usuarios sin área; bypass horizontal silencioso.
- **Solución recomendada:** Hacer `area_id` obligatorio salvo `ADMINISTRADOR` o permiso explícito `area.exenta`; si se mantiene opcional, requerir ACL documento explícita para cross-área y registrar `AREA_NOT_AUTHORIZED` + alerta; documentar matriz y test de aislamiento.

### H05 — MEDIO — Logout incompleto (sesión insegura remanente en navegador)
- **Archivo:** `documentos/views.py:42-52 vs 225-227`
- **Componente:** `set_auth_cookie()` / `LogoutView.post()`
- **Problema:** `set` usa `httponly=True, secure=AUTH_COOKIE_SECURE, samesite='Lax', path='/'`; `delete_cookie` solo pasa `path='/', samesite='Lax'`, sin `secure/httponly/domain`. En prod (`Secure=True`) algunos navegadores no borran cookie `Secure` si el borrado no lleva `Secure`, dejando bearer válido hasta `expira_en` (DB ya revocada, pero cookie zombie reutilizable si la revocación falla/raza, y confunde).
- **Evidencia:** Líneas citadas; `settings.py:183 AUTH_COOKIE_SECURE=str(not DEBUG)` → prod `True`.
- **Impacto:** Sesión aparentemente cerrada pero cookie presente; si la revocación DB no se aplicó (carrera/error), el token sigue usable con CSRF válido.
- **Solución recomendada:** `response.delete_cookie(..., path='/', samesite='Lax', secure=settings.AUTH_COOKIE_SECURE, httponly=True)` + `max_age=0, expires='Thu, 01 Jan 1970 00:00:00 GMT'`; test que tras logout el mismo `sd_session` da `401 Sesión revocada`.

### H06 — MEDIO — Expiración / refresh inseguros: remember largo sin rotación + inferencia frágil
- **Archivo:** `documentos/views.py:117-129,263-268`, `backend/settings.py:184-185`, `documentos/authentication.py:74-87`
- **Componente:** `LoginView` duración, `ChangePasswordView` rotación, `CookieTokenAuthentication` inactividad
- **Problema:** (a) `remember=True` crea bearer 30 días (`AUTH_REMEMBER_DAYS`) sin rotación/deslizamiento, solo revocación por inactividad 30 min (confuso: remember igual muere por idle) y absoluta 30d. Robo cookie = ventana 30d (mitigado por `HttpOnly+Lax+CSRF`, pero sin pinning). (b) En cambio de contraseña `remember = request.auth.expira_en-now > 1 día` infiere modo por duración restante; si `max_session_hours>24h` custom, una sesión normal se reclasifica como remember y se extiende indebidamente vía `set_auth_cookie`.
- **Evidencia:** `duration = timedelta(days=REMEMBER_DAYS) if remember else timedelta(hours=policy['max_session_hours'])`; `remember = expira_en-now > timedelta(days=1)`; `authentication.py:74 activity_cutoff=inactivity_minutes` aplica a ambas.
- **Impacto:** Ventana robo larga; extensión privilegio sesión tras cambio clave; UX engañosa (remember que expira por idle).
- **Solución recomendada:** Persistir `remember:bool` en `Sesiones`; rotar token remember cada uso con `expira_en` deslizante acotada + lista de dispositivos; en cambio clave preservar flag real, no inferido; documentar `8h vs 30d + idle 30m`; considerar `refresh_token` httpOnly separado de corta vida + `access` en memoria si se quiere SPA dura.

### H07 — MEDIO — Tokens y secretos gestionados con KDF débil / reuso
- **Archivo:** `documentos/authentication.py:14-15`, `documentos/backup_service.py:128-143`, `documentos/config_service.py:132,141`
- **Componente:** `hash_session_token()`, `backup_key()`, `encrypt_secret/decrypt_secret`
- **Problema:** Sesiones se guardan como `SHA256(token)` rápido sin HMAC/pepper/salt; si hay dump DB, el hash es verificable offline (aunque token 48B `token_urlsafe(48)` ~384 bits lo hace inviable adivinar, la defensa es solo entropía). Más grave: `backup_key()` si no hay `BACKUP_ENCRYPTION_KEY` deriva de `SHA256(SECRET_KEY)` sin salt/iteraciones, y `config_service` deriva secretos SMTP como `SHA256(backup_key+b'config')` — reuso de clave maestra para dos dominios con simple suffix, sin rotación (checklist pendiente).
- **Evidencia:** Líneas citadas; `settings.py:216 BACKUP_ENCRYPTION_KEY=''` por defecto; `views.py:117 raw_token=secrets.token_urlsafe(48)` (buena entropía, mal almacenamiento).
- **Impacto:** Fuga DB → verificación offline teórica; fuga `SECRET_KEY` → descifra respaldos `.sdbk` y secretos SMTP; rotación imposible sin perder datos.
- **Solución recomendada:** `HMAC(SECRET_KEY, token)` o `hashers.make_password`-like con pepper separado `SESSION_TOKEN_PEPPER` + comparación constante; exigir `BACKUP_ENCRYPTION_KEY` 32B en prod (fallar arranque si falta, no fallback); KDF `HKDF(SECRET, salt, info='backup'/'config')` distintas; plan rotación/versionado claves.

### H08 — MEDIO — Autorización inconsistente: clase muerta + gate dispar
- **Archivo:** `documentos/permissions.py:21-35`, `documentos/management_views.py:44-52`, `documentos/views.py:197-201,230-232`
- **Componente:** `HasDocumentalPermission`, `require_permission()`, `CurrentUser/ChangePassword/Logout`
- **Problema:** `HasDocumentalPermission` nunca se usa en vistas prod (solo `tests.py:2107,2117`); todo es `permission_classes=[IsAuthenticatedAndPasswordCurrent]` + `require_permission(codigo)` manual dentro del método. Olvidar la llamada deja endpoint autenticado pero sin autorización (fail-open futuro). Además `CurrentUser/Logout/ChangePassword` usan `IsAuthenticated` a secas (sin `...AndPasswordCurrent`): un usuario con `debe_cambiar_contrasena=True` puede seguir llamando `/me` (info roles/email) aunque el resto da `PASSWORD_CHANGE_REQUIRED` — inconsistencia intencional pero no documentada.
- **Evidencia:** `grep HasDocumentalPermission` solo definición + tests; `grep permission_classes` todas `IsAuthenticatedAndPasswordCurrent` salvo `views.py:198,205,231` (`IsAuthenticated`) y `AllowAny` en `csrf/login/health`.
- **Impacto:** Nuevo endpoint que copie plantilla sin `require_permission` queda sobre-autorizado; `/me` expone `roles/permissions` a cuentas pendientes de cambio (bajo, pero oracle).
- **Solución recomendada:** Eliminar dualidad: usar `HasDocumentalPermission(permission_code)` declarativo en cada vista (o decorador) + test que falla si una vista bajo `/api/` (salvo allowlist `csrf/login/health/me/logout/change-password`) no declara permiso; documentar excepción `/me`.

### H09 — MEDIO — Autenticación sin MFA + bloqueo abusables
- **Archivo:** `documentos/views.py:34-39,95-115`, `backend/settings.py:196-199`, `documentos/config_service.py:27-38`
- **Componente:** `LoginRateThrottle`, bloqueo `max_failed_attempts/lock_minutes`, `security.mfa_*`
- **Problema:** Sin MFA (`mfa_admins True / mfa_users False` solo flags en config, sin enforcement). Bloqueo por cuenta (`5/15m` default, configurable por org víctima) + throttle anónimo `10/min` por IP (DRF `AnonRateThrottle`, burlable con `X-Forwarded-For` si proxy no sanea; `get_client_ip` confía en ese header para auditoría). Atacante puede bloquear cuentas (DoS login) y hacer fuerza bruta distribuida lenta.
- **Evidencia:** Líneas citadas; `record_auth_event SESION_FALLIDA` con mensaje genérico `INVALID_CREDENTIALS` (bien), pero `locked` también devuelve mismo mensaje (bien) — el DoS persiste aunque no haya oracle.
- **Impacto:** DoS selectivo, credential-stuffing lento, sin segundo factor para admin.
- **Solución recomendada:** Implementar TOTP/WebAuthn para `ADMINISTRADOR` (flag ya existe), CAPTCHA/backoff exponencial por cuenta+IP, throttle por cuenta (`ScopedRateThrottle login` con `identity` hash), alertar `SESION_FALLIDA x3/24h` ya existe en `audit_views` — cablear a bloqueo adaptativo; no confiar `X-Forwarded-For` salvo `SECURE_PROXY_SSL_HEADER` + `ALLOWED_HOSTS` proxy conocido.

### H10 — BAJO — Sesiones sin endurecimiento: ilimitadas, sin pinning, fingerprint débil
- **Archivo:** `documentos/authentication.py:84-87`, `documentos/management_views.py:71-73,115-129,615-689`
- **Componente:** `ultima_actividad_en`, `device_fingerprint/build_device_inventory`, `UserSessions/DeviceRevoke/SessionRevoke`
- **Problema:** Concurrentes ilimitadas; sin enlace token↔IP/UA (solo inventario); `device_fingerprint=SHA256(UA|IP)[:16]` (64 bits, colisiones + UA/IP spoofeables y cambiantes tras NAT/móvil); cada request autenticado hace `update(ultima_actividad_en=now)` (contención DB, sin throttle); revocación por dispositivo puede revocar de más si colisiona.
- **Evidencia:** Líneas citadas; `SessionRevoke` sí verifica `organizacion_id` + `owner o gestionar` (bien), `DeviceRevoke` igual (bien).
- **Impacto:** Hijack no detectado, revocación imprecisa, carga DB.
- **Solución recomendada:** Límite configurable (ej. 5 activas, expulsa más antigua), pinning opcional `UA-hash + /24` con re-auth step-up al cambiar, `device_id` aleatorio persistido en sesión (no derivado), update actividad throttled (ej. 1/min), test colisión.

### H11 — BAJO — Roles y permisos inconsistentes / contradictorios
- **Archivo:** `frontend/src/Login.jsx:266`, `documentos/workflow_views.py:436`, `documentos/reader_access.py:8-21`, `documentos/document_views.py:369-378`
- **Componente:** `REVISOR vs REVIEWER`, `is_reader_user`, `get_reference_or_error`
- **Problema:** Frontend acepta `REVISOR|REVIEWER`, backend candidatos solo `REVISOR|ADMINISTRADOR` → usuario `REVIEWER` ve dashboard revisor pero nunca es elegible. `is_reader_user` define lector por ausencia de 8 perms fijos; nuevos perms (`reportes.generar`, `respaldos`, `config`, `auditoría`) no están en el set → clasificación frágil (hoy fail-closed hacia lector, pero futuras ramas `if is_reader` pueden fail-open). `TipoDocumentoCatalogo` es global (sin `organizacion_id`) mientras `AreaCatalogo` es por org — matriz confusa.
- **Evidencia:** Líneas citadas; `MANAGEMENT_PERMISSIONS={documentos.gestionar, usuarios.*, roles.gestionar, revisiones.*}` sin `reportes/respaldos/bitacora`.
- **Impacto:** UX rota, decisiones autorización basadas en heurístico en vez de permiso explícito (`timeline:1084`, `get_read_document_or_404`).
- **Solución recomendada:** Normalizar código único `REVISOR` (migración + constraint), sustituir `is_reader_user` por permiso explícito `lector.acceso` o `not has_any(management_perms ∪ nuevos)`, scoping uniforme catálogos por org salvo globales documentados.

### H12 — BAJO — Permisos solo frontend: no hay bypass real, pero hay filtraciones menores
- **Archivo:** `frontend/src/Login.jsx:264-283`, `ReaderLibraryView.jsx:82`, `documentos/management_views.py:55-68`, `document_views.py:283-334`
- **Componente:** Dispatcher roles, catálogos, `serialize_management_user`, `document_permissions_payload`
- **Problema:** Verificado: backend exige `require_permission` en todos los `GET/POST` usados por frontend (`grep` §1: `documents/catalogs` exige `consultar`, `roles` exige `gestionar`, etc.), y `api.js` no guarda tokens (cookie `HttpOnly`). No hay bypass solo-frontend. Restan filtraciones menores: (a) prioridad `admin>editor>reviewer>reader` oculta dashboards adicionales si multi-rol; (b) lector llama `GET /api/documents/catalogs/` (general) en vez de catálogo publicado → aprende áreas/tipos/códigos aunque sin docs; (c) `serialize_management_user` expone `failed_attempts/locked_until/last_access` a cualquiera con `usuarios.consultar`; (d) `document_permissions_payload` lista todos los roles/permisos activos a quien tenga `WRITE`.
- **Evidencia:** `Login.jsx:269-283` returns encadenados; `ReaderLibraryView.jsx:82 apiRequest("/api/documents/catalogs/")`; `management_views.py:62-67`.
- **Impacto:** Enumeración interna, UX multi-rol rota (no escalado por sí sola).
- **Solución recomendada:** Selector de contexto por rol + `CatalogsPublishedView` para lector; minimizar `serialize_management_user` por permiso (`gestionar` ve todo, `consultar` ve subset); paginar `document_permissions_payload`.

### H13 — MEJORA — Auditoría propia y trazabilidad: correcta pero ampliable
- **Archivo:** `documentos/audit_views.py:53-59,74-132,220-278`, `documentos/reader_views.py:188-230`, `documentos/auth_utils.py:78-143`
- **Componente:** `require_audit_access(allow_own)`, `fetch_audit_rows`, `ReaderReadingHistoryView`
- **Problema:** Diseño correcto (org siempre filtrada, `user_id` estricto para no-admin, `404` en vez de `403` en objetos para no oracular). Mejoras: (a) `allow_own_events=True` en `AuditListView` permite a cualquier rol listar sus eventos con `IP/UA/detalles` — aceptable pero sin rate-limit propio (usa default, sin throttle) y `search` hace `ILIKE %...%` sobre `detalles::text/recurso_id/ip` (costoso, posible DoS ReDoS-like por `%_%`); (b) `ReaderReadingHistoryView` devuelve `ip_address/user_agent` propios (bien) pero sin enmascarar (privacidad); (c) `record_auth_event` traga excepciones a `logger.critical` (bien fail-closed log, pero el request sigue `200` aunque auditoría falle — trade-off documentado `AUDITORIA_NO_REGISTRADA`).
- **Evidencia:** Líneas citadas; `audit_query_parts:100-116` 9 `ILIKE`; `reader_views.py:222-224 ip/user_agent`.
- **Impacto:** Bajo hoy; DoS/privacidad a escala.
- **Solución recomendada:** Throttle `audit:30/min`, límite `search>=3` + timeout statement, enmascarar IP (`/24`) y UA (familia) en respuestas no-admin, alertar si `AUDITORIA_NO_REGISTRADA` rate>0 (fail-closed opcional por org crítica).

## 4. Cobertura de los 20 controles pedidos

| Control pedido | Estado | Dónde |
|----------------|--------|-------|
| autenticación incorrecta | **OK salvo H01/H09** — `pbkdf2 check_password + DUMMY + genérico` bien | `views.py:89,153,170` |
| validación incorrecta credenciales | **H01 ALTO** multi-tenant ambiguo | `views.py:82-89` |
| bypass autenticación | **No hallado** — `AllowAny` solo `csrf/login/health`, resto default `IsAuthenticatedAndPasswordCurrent` | `settings.py:189-195`, `urls.py` |
| bypass autorización | **No bypass activo**, pero **H02/H04/H08** dejan escalado/futuro fail-open | `require_permission` omnipresente hoy |
| acceso horizontal | **H01 ALTO + H04 MEDIO** (cross-org login, sin-área) — resto org-scoped + `404` correcto | `reader_access.py`, `get_*_or_404` |
| escalamiento vertical | **H02 ALTO** (`usuarios.gestionar`→respaldos/config) + ADMIN bypass documentado | `backup/settings_views` |
| permisos solo frontend | **No bypass (H12 BAJO)** — backend manda; frontend solo dispatcher | `Login.jsx` vs `require_permission` |
| endpoints sin autorización | **No hallado hoy** — riesgo futuro por H08 manual | `grep permission_classes` |
| rutas protegidas incorrectamente | **H08 MEDIO** (`/me` inconsistente) + H02 sobre-privilegio | `views.py:197` |
| IDs manipulables | **Mitigado (UUID+org+404)** salvo H04/H01; `user_id` audit contenido (H13) | `get_*_for_organization` |
| sesiones inseguras | **H05/H06/H10** (logout, remember, pinning) — flags base correctas (`HttpOnly/Secure/Lax`) | `settings.py:252-256` |
| tokens mal gestionados | **H07 MEDIO** (SHA256 sin HMAC, sin rotación) | `authentication.py:14` |
| expiración incorrecta | **H06 MEDIO** (absoluta+idle confusas, inferencia remember) | `views.py:264` |
| refresh inseguros | **H06 MEDIO** (remember 30d bearer sin rotación, no hay refresh separado) | `settings.py:185` |
| logout incompleto | **H05 MEDIO** | `views.py:226` |
| recuperación insegura | **H03 ALTO** (admin reset en claro, sin expiración) — no hay self-service (reduce superficie) | `management_views.py:559` |
| contraseñas mal manejadas | **H03 ALTO** (doble política) + `make_password` correcto + `must_change` gate correcto | `serializers.py` |
| secretos expuestos | **H03/H07** (temporal en JSON, fallback `SECRET_KEY`) — `.env` gitignored OK | `backup_service.py:138` |
| roles inconsistentes | **H11 BAJO** (`REVISOR/REVIEWER`, lector heurístico) | `Login.jsx:266` |
| permisos contradictorios | **H02 ALTO + H11 BAJO** | `BACKUP/SETTINGS` vs RBAC |

## 5. Recomendaciones priorizadas (sin código)

1. **H01+H04:** scoping org en login + `area_id` obligatorio (o permiso exención) + tests aislamiento cross-org/área.
2. **H02:** nuevos permisos `respaldos.*`, `configuracion.*`; revocar `usuarios.gestionar` de infra.
3. **H03:** no devolver secreto, expiración temporal, política única por org, `token_urlsafe(24+)`.
4. **H05+H06+H07+H10:** fix `delete_cookie`, persistir `remember`, rotar remember, `HMAC` tokens, exigir `BACKUP_ENCRYPTION_KEY`, limitar sesiones, pinning opcional.
5. **H08:** `HasDocumentalPermission` declarativo + test fail-closed para nuevas rutas + documentar `/me`.
6. **H09:** MFA admins, CAPTCHA/backoff, throttle por cuenta, sanear `X-Forwarded-For`.
7. **H11-H13:** normalizar `REVISOR`, permiso lector explícito, catálogo publicado, throttle/máscara auditoría.
