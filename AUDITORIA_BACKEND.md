# AUDITORIA_BACKEND — Backend y lógica de negocio

> Alcance estricto: solo backend y lógica de negocio (`documentos/*.py`, `backend/settings.py`). Sin frontend visual. Sin modificar código. Base: `AUDITORIA_CONTEXTO.md` + `AUDITORIA_ARQUITECTURA.md` + lectura estática de `document_views.py` (1205 lín), `workflow_views.py` (753), `backup_service.py` (1376), `reports_views.py` (583), `management_views.py` (1013), `views.py` (322), `config_service.py` (262), `notifications.py` (141), `file_validation.py` (113), `document_serializers.py`, `reader_access.py`.
> Fecha: 2026-09-05.

## 1. Tabla resumen

| ID | Severidad | Archivo | Problema |
|----|-----------|---------|----------|
| B01 | CRÍTICO | `config_service.py:174-178 vs 233-235` | Imposible cambiar contraseña SMTP (sobrescribe token nuevo con viejo) |
| B02 | CRÍTICO | `document_views.py:998-1000` | `KeyError` en timeline para acciones fuera del diccionario → 500 |
| B03 | ALTO | `document_views.py:438-442,841-848` | Storage dentro de transacción + `es_vigente=False` antes de guardar → huérfanos / sin vigente |
| B04 | ALTO | `document_views.py:438-460,841-866` + `workflow_views.py:335-337` | Carrera versionado: doble `orden_version` / doble `es_vigente`, doble revisión pendiente |
| B05 | ALTO | `workflow_views.py:547-559` | Aprobación parcial / cierre masivo: versión no transiciona o se cierran revisiones ajenas sin aviso |
| B06 | ALTO | `backup_service.py:1343-1360` + `document_views.py:496-500` | Restore/verify mezcla DB `SERIALIZABLE` con I/O S3 + `restaurado_en` indistinguible; download regenera si falta snapshot |
| B07 | ALTO | `reports_views.py:349-370,496-500` | XLSX sin límite vs PDF truncado a 1000 + regeneración silenciosa si falta snapshot |
| B08 | MEDIO | `workflow_views.py:724-752` | Publish duplica eventos, no exige última versión, reutiliza permiso approve |
| B09 | MEDIO | `document_views.py:549-572,620-652` | Orden incorrecto update: documento guardado antes de validar metadata/archivo → parcial |
| B10 | MEDIO | `document_serializers.py` + `document_views.py:369-378` | `type_id` global sin org/activo vs `area_id` sí → validación contradictoria |
| B11 | MEDIO | `workflow_views.py:609-616,657-659` | Comentario `RESPUESTA` huérfana + resolución sin `sanitize_text` (inconsistente) |
| B12 | MEDIO | `workflow_views.py:548,682` | Gate checklist solo revisa review actual + `orden=count()` con carrera |
| B13 | MEDIO | `management_views.py:961-980,589-612` + `890-958` | `assign_roles` revive filas expiradas + auto-escalado posible; `RolePermissions` borra historial sin lock |
| B14 | MEDIO | `management_views.py:205-294` | Dashboard cuenta `ARCHIVADO` como estado de versión (imposible, siempre 0) + import diferido |
| B15 | MEDIO | `views.py:263-268` | `remember` inferido por `expira_en-now>1d` + hereda expiración vieja tras cambio clave |
| B16 | MEDIO | `notifications.py:54-70,110-128` | Email fallido silencioso + solo notifica solicitante (otras revisiones no se enteran) |
| B17 | BAJO | `document_views.py:212-231,849-862` | `same_content` por SHA almacenado + restore copia hash sin re-hashear |
| B18 | BAJO | `file_validation.py` + `document_views.py:548,424` | Doble validación (doble SHA/zip) + límites env vs org con error genérico |
| B19 | BAJO | `document_views.py:685-718` | PUT permisos admite ACL vacía (abre documento) + acepta cualquier `permiso_id` |
| B20 | MEJORA | `auth_utils.py` + `document_views.py:469-473` | Auditoría traga excepción y operación sigue `200` (trazabilidad rota, ver D11 arquitectura) |

---

## 2. Hallazgos detallados

### B01 — CRÍTICO — Lógica contradictoria: cambio de contraseña SMTP nunca persiste
- **Archivo:** `documentos/config_service.py:174-178,233-235`
- **Componente:** `validate_section('smtp')` + `update_system_config()`
- **Problema:** `validate_section` hace `password = values.pop('password',None)` y si hay crea `password_token` nuevo. Luego `update_system_config` comprueba `if section=='smtp' and not incoming.get('password') and current.get('password_token'):` — como `password` ya fue popeado, `incoming.get('password')` siempre es `None` → siempre entra y sobrescribe `incoming['password_token']` con el viejo. Resultado: imposible rotar secreto SMTP.
- **Evidencia:** `:175-176 values.pop('password') → values['password_token']=encrypt(new)`; `:233-235 incoming['password_token']=current['password_token']` incondicional efectivo.
- **Impacto:** Rotación/compromiso SMTP irrecuperable por API; operador cree que cambió y sigue la vieja; diverge de `password_set=True` mostrado.
- **Solución recomendada:** Comprobar `if 'password_token' not in incoming and current.get(...)` o no popear antes: `had_password = 'password' in raw`; solo preservar si no se envió. Test: set → get → `decrypt==new`.

### B02 — CRÍTICO — Excepción no controlada: `KeyError` en timeline
- **Archivo:** `documentos/document_views.py:998-1021`
- **Componente:** `serialize_audit_timeline_event()`
- **Problema:** `event_type, fallback_name = TIMELINE_ACTIONS[action_code]` indexa directo. La bitácora contiene acciones fuera del dict (`SESION_INICIADA/CERRADA/FALLIDA, BITACORA_EXPORTADA, RESPALDO_*, REPORTE_*, CONFIGURACION_*, USUARIO_MODIFICADO, ARCHIVO_CARGADO, REVISION_ASIGNADA...`). Basta un documento con uno de esos eventos para 500 en `GET timeline`.
- **Evidencia:** `:932-946 TIMELINE_ACTIONS` (14 claves) vs `auth_utils/workflow/backup/reports` que emiten decenas más; `:1000` sin `.get` ni `try`.
- **Impacto:** Caída determinista de timeline en documentos reales; lector incluido.
- **Solución recomendada:** `TIMELINE_ACTIONS.get(action_code)` con fallback `('other','Otro evento')` + filtro `WHERE a.codigo IN (...)` o mapeo `desconocido→omitir`; test con `SESION_INICIADA` en bitácora.

### B03 — ALTO — Orden incorrecto + datos modificados parcialmente: storage dentro de la transacción
- **Archivo:** `documentos/document_views.py:437-473,840-886`
- **Componente:** `save_document_file()`, `DocumentVersionRestoreView`
- **Problema:** Dentro de `transaction.atomic()`: (1) `filter(es_vigente=True).update(es_vigente=False)`, (2) `default_storage.save(...)` (red/S3, segundos), (3) `ArchivoDocumento.create(...)`. Si (2) falla tras (1), el rollback DB revierte `es_vigente` — bien — pero si (3) falla tras (2), el `except` borra S3 — bien —. El problema real: transacción DB abierta durante I/O externo (locks `archivos` + `select_for_update` retenidos minutos en B2 lento) y si el proceso muere entre (2) y commit, queda objeto S3 huérfano sin fila (compensación solo en `except` Python, no en kill/timeout). Además `save_metadata` (406-412) hace `delete()` + N `update_or_create` fuera de un único `atomic` con el `document.save` del caller.
- **Evidencia:** `:441 update(es_vigente=False)` antes de `:442 save(storage)`; `:469-473` compensación solo en excepción; `:847-848 open_stored_file + save` dentro de `atomic`.
- **Impacto:** Documentos sin vigente visible, S3 con basura facturable, contención `select_for_update` bajo carga.
- **Solución recomendada:** Subir a S3 **antes** del `atomic` a clave temporal, luego en `atomic` solo `UPDATE/INSERT` + renombre/confirmación; o patrón outbox + GC huérfanos por `clave_almacenamiento` sin referencia; nunca I/O externo dentro de `atomic`.

### B04 — ALTO — Concurrencia: doble versión / doble revisión pendiente
- **Archivo:** `documentos/document_views.py:438-440`, `workflow_views.py:335-337`
- **Componente:** `save_document_file()`, `ReviewSubmitView`
- **Problema:** `latest = archivos.select_for_update().order_by('-orden_version').first()` bloquea filas hijas, no la fila `Documento`; dos subidas concurrentes leen mismo `latest.orden_version=N`, calculan `N+1`, crean dos vigentes (sin constraint único parcial). Igual en submit: `if filter(version,pending).exists(): 409` sin lock de versión → dos submits concurrentes crean doble `PENDIENTE`.
- **Evidencia:** Sin `UniqueConstraint(documento, orden_version)` ni `Unique parcial (documento) WHERE es_vigente` (ver D02); `VERSION_TRANSITIONS` no impide doble `EN_REVISION`.
- **Impacto:** `current_version().first()` ambiguo, timeline bifurcado, aprobaciones sobre versión equivocada.
- **Solución recomendada:** `SELECT ... FOR UPDATE OF documentos WHERE id=...` antes de versionar; constraints DB + `IntegrityError→409`; test de carrera con 2 hilos.

### B05 — ALTO — Estados inconsistentes / operación incompleta en decisión de revisión
- **Archivo:** `documentos/workflow_views.py:536-559`
- **Componente:** `ReviewDecisionView.post()`
- **Problema:** (a) Approve: solo transiciona a `APROBADO` `if not filter(version,pending).exists()` **después** de marcar la review actual como `APROBADA` (537-551). Si quedan otras pendientes, la response es `200 aprobada` pero la versión sigue `EN_REVISION` → “aprobada sin aprobar”. (b) Return/reject: `filter(version,pending).update(estado=CANCELADA/RECHAZADA, comentario='Cerrada por decision...', resuelta_en=now)` cierra revisiones de **otros revisores** sin notificarles, sobrescribiendo su `comentario_resolucion`, sin validar checklist ni observación propia.
- **Evidencia:** `:537-551` orden marcar→chequear pendientes→quizá transicionar; `:555-559` update masivo.
- **Impacto:** Flujo atascado (versión nunca se aprueba aunque UI diga lo contrario) o censura silenciosa de revisores paralelos.
- **Solución recomendada:** Definir semántica: `quorum` (todas aprueban) vs `primera decisión gana`. Si quorum: no marcar `APROBADA` final hasta último; si primera-gana: cerrar otras **con** evento/notificación por cada una y `resuelta_en` individual; mover a servicio `decide_review()` con test de 2 revisores.

### B06 — ALTO — Efectos secundarios inesperados: restore/verify acopla DB serializable con S3
- **Archivo:** `documentos/backup_service.py:1333-1372`
- **Componente:** `verify_backup(restore_files, restore_database)`, `restore_backup()`
- **Problema:** Con ambos flags, abre `database_restore_transaction() (SERIALIZABLE)` y dentro restaura DB **y** S3 (`restore_storage_snapshot`). S3 no rollbackea si DB aborta (archivos parciales) y la transacción queda abierta minutos copiando ficheros (locks/serialización). Además `restaurado_en` se marca igual para `restore_files` solo que para full (`1358-1360`), indistinguible en `serialize_backup`.
- **Evidencia:** `:1344-1353` anidado; `:1358-1360 save(restaurado_en)`; `:1361 mode` sí distingue pero el campo no.
- **Solución recomendada:** Fases separadas: `verify` (read-only) → `restore_db` (transacción corta) → `restore_files` (idempotente, reanudable) con `restaurado_db_en/restaurado_files_en`; job async con progreso.

### B07 — ALTO — Cálculos/reglas diferentes: PDF trunca, XLSX no; download regenera
- **Archivo:** `documentos/reports_views.py:349-370,496-500`
- **Componente:** `build_xlsx/build_pdf`, `ReportDownloadView`
- **Problema:** `build_pdf` corta a `rows[:1000]` (`:370`) sin avisar; `build_xlsx` vuelca todo (`:349-350`) → mismo reporte, distinto contenido según formato; `filas=len(rows)` cuenta sin truncar → metadato miente en PDF. Si el snapshot falta (`None`), `ReportDownloadView` **regenera con datos actuales** y devuelve `200` (`:496-500`) en vez de `410` → “inmutable” que muta.
- **Evidencia:** Líneas citadas; `persist_report_snapshot` guarda `filas=len(data['rows'])` (`:412`).
- **Impacto:** Decisiones con PDF incompleto; auditoría cree inmutabilidad rota.
- **Solución recomendada:** Un único `row_limit` documentado (p. ej. 5000) aplicado antes de `filas`, con `truncated:bool` en metadatos; si `snapshot is None` → `410` salvo `?regenerate=true` explícito con nuevo evento.

### B08 — MEDIO — Publish: validación faltante + regla duplicada + permisoReuse
- **Archivo:** `documentos/workflow_views.py:724-752`
- **Componente:** `VersionPublishView`
- **Problema:** Exige `REVIEW_APPROVE` (debería ser `documentos.publicar` separado). No verifica que la versión sea la última/`es_vigente` antes de forzarla vigente (`733-735` apaga otras y enciende esta) → publicar una `1.0` vieja “despublica” la `2.0` sin aviso. Emite `DOCUMENTO_APROBADO` + `DOCUMENTO_PUBLICADO` aunque la aprobación ya se emitió en `approve` → doble conteo en timeline/dashboard.
- **Evidencia:** `:728 require REVIEW_APPROVE`; `:732 transition PUBLICADO` (falla si no `APROBADO`, bien) + `:733-735` switch vigente; `:736-751` dos eventos.
- **Impacto:** Regresión silenciosa de versión publicada; métricas infladas.
- **Solución recomendada:** Permiso propio, exigir `version.es_vigente and latest.id==version.id` o `?force=true` con confirmación, emitir solo `PUBLICADO`.

### B09 — MEDIO — Operación en orden incorrecto: update guarda antes de validar todo
- **Archivo:** `documentos/document_views.py:620-662`
- **Componente:** `DocumentDetailView.patch()`
- **Problema:** Calcula `updates`, hace `document.save()` (`:649-651`), luego `save_metadata()` (`:652`, que puede lanzar `DOCUMENT_VERSION_LOCKED`/`metadata inválida`) y luego `save_document_file()` (`:653-659`, que puede fallar por storage). Si falla lo segundo, el documento ya quedó modificado → parcial. Igual en create: `Documento.create` (`:550`) antes de `save_document_file` (`:565`); si el archivo falla, queda documento sin versión (huérfano funcional).
- **Evidencia:** Orden citado; `save_metadata` llama `ensure_document_directly_editable` que puede fallar tras el `save`.
- **Impacto:** Documento a medio actualizar; reintento confuso.
- **Solución recomendada:** Validar todo primero (incl. `validate_uploaded_file`, `validate_metadata`, `ensure_editable`), luego un solo `atomic` con `create + metadata + file`.

### B10 — MEDIO — Validaciones contradictorias: tipo global vs área por org
- **Archivo:** `documentos/document_serializers.py:11-12`, `documentos/document_views.py:369-378,541-543`
- **Componente:** `get_reference_or_error()`
- **Problema:** `area_id` filtra `organizacion_id + activa=True`; `type_id` (`TipoDocumentoCatalogo`) explícitamente **excluye** filtro org (`if model is not TipoDocumentoCatalogo`) y no chequea `activo`. Permite referenciar tipos de otra org o inactivos, mientras áreas son estrictas.
- **Evidencia:** `:370-376` rama especial; `DocumentCreateSerializer.type_id = IntegerField(min_value=1)` sin `activo`.
- **Impacto:** Clasificación cruzada, tipos resucitados.
- **Solución recomendada:** Misma regla: `organizacion_id + activo=True` para ambos o documentar catálogo global con allowlist.

### B11 — MEDIO — Validación faltante/contradictoria en comentarios
- **Archivo:** `documentos/workflow_views.py:99-108,609-616,657-659`
- **Componente:** `ReviewCommentSerializer`, `ReviewCommentListCreateView`, `ReviewCommentResolveView`
- **Problema:** Se puede crear `type='RESPUESTA'` sin `parent_id` (huérfana, `parent=None` + tipo forzado solo si hay padre en `:614`). La resolución (`:657`) lee `request.data['content']` crudo sin `sanitize_text` (creación sí sanitiza en `:107`), inconsistente y con XSS almacenado potencial vía API.
- **Evidencia:** `:614 tipo='RESPUESTA' if parent else validated['type']`; `:657 resolution = request.data.get('content','').strip()` sin sanitizar.
- **Solución recomendada:** Exigir `parent_id` si `type==RESPUESTA` y prohibir `RESPUESTA` sin padre; sanitizar resolución igual que contenido.

### B12 — MEDIO — Regla aplicada diferente: checklist
- **Archivo:** `documentos/workflow_views.py:547-549,679-684,698-713`
- **Componente:** `ReviewDecisionView`, `ReviewChecklistCreate/Update`
- **Problema:** Approve exige checklist completa **solo de la review actual** (`review.checklist.filter(completada=False)`), no de las paralelas. Creación usa `orden=review.checklist.count()` (`:682`) → dos creates concurrentes mismo `orden`. Update permite desmarcar (`completed=False` limpia `completada_por/en`) incluso tras aprobación parcial de otra review.
- **Evidencia:** Líneas citadas.
- **Solución recomendada:** Quorum de checklists o checklist por versión (no por review); `orden=Max(orden)+1` en transacción o secuencia; bloquear desmarque si versión ya `APROBADO`.

### B13 — MEDIO — Dependencia incorrecta + auto-escalado en roles
- **Archivo:** `documentos/management_views.py:961-980,589-612,920-949`
- **Componente:** `assign_roles()`, `UserRolesView.put()`, `RolePermissionsView.put()`
- **Problema:** `assign_roles` revive filas expiradas (`update vigente_hasta=None`) en vez de crear historia nueva (pierde trazabilidad). `UserRolesView` valida org+activo pero **no impide auto-asignarse `ADMINISTRADOR`** ni quitar el último admin (lockout admin). `RolePermissions` hace `delete()` físico + recrea sin `select_for_update` → dos PUT concurrentes pierden permisos; sin auditoría de quitados.
- **Evidencia:** `:966-972` revive; `:607 assign_roles(user, role_ids, request.user.id)` sin chequeo self; `:941-949` delete+loop create.
- **Solución recomendada:** Inserción histórica (expirar + crear), prohibir auto-escalado y proteger último admin activo, `atomic + select_for_update(role)`, auditar diff.

### B14 — MEDIO — Estados imposibles: dashboard cuenta `ARCHIVADO` como versión
- **Archivo:** `documentos/management_views.py:224-231`
- **Componente:** `AdminDashboardView`
- **Problema:** `status_codes=('BORRADOR','EN_REVISION','APROBADO','PUBLICADO','ARCHIVADO')` filtra `archivos__estado_version__codigo`. `ARCHIVADO` es estado de **documento** (`eliminado_en`), no de versión (`VERSION_TRANSITIONS` no lo contiene) → siempre 0, engaña. Además `from .audit_views import ...` dentro del método (`:239`) oculta dependencia circular.
- **Evidencia:** `workflow_views.py:43-50` sin `ARCHIVADO`; `management_views.py:224`.
- **Solución recomendada:** Contar archivados por `Documento.eliminado_en__isnull=False` separado; mover import arriba o a servicio.

### B15 — MEDIO — Condición incorrecta: `remember` inferido
- **Archivo:** `documentos/views.py:263-268`
- **Componente:** `ChangePasswordView`
- **Problema:** `remember = auth.expira_en - now > timedelta(days=1)`. Con `max_session_hours` configurable hasta 720h (ver `config_service.py:160`), una sesión normal larga se reclasifica como `remember` y recibe cookie 30d. Además la nueva sesión hereda `expira_en` vieja (solo actualiza `hash_token/ultima_actividad`), pudiendo caducar minutos después del cambio.
- **Evidencia:** Líneas citadas; `DEFAULTS max_session_hours=8` pero rango `1..720`.
- **Solución recomendada:** Persistir `remember:bool` en `SesionDocumental`; al rotar, recalcular `expira_en = now + (30d if remember else policy.hours)`.

### B16 — MEDIO — Servicios con efectos secundarios inesperados: notificaciones
- **Archivo:** `documentos/notifications.py:54-70,110-128`
- **Componente:** `create_notification()`, `notify_review_decision()`
- **Problema:** Fallo SMTP se traga (`except → error_correo + logger`) y se retorna como éxito; el workflow no reintenta ni marca pendiente → “notificado” sin correo. Decisión solo notifica a `solicitada_por`, no a otros revisores pendientes (que luego son masivamente cerrados por B05 sin aviso).
- **Evidencia:** `:63-69` swallow; `:120-128` un solo destinatario.
- **Solución recomendada:** Cola/outbox con reintento + `email_status`; fan-out a todos los `PENDIENTE` afectados.

### B17 — BAJO — Cálculo incorrecto: hash de restore y `same_content`
- **Archivo:** `documentos/document_views.py:212-231,849-862`
- **Componente:** `compare_versions()`, restore
- **Problema:** Restore copia `tamano_bytes/sha256` del origen sin hashear el objeto copiado (`:861-862`); si la copia S3 se corrompe, el hash miente y `compare_versions.same_content (sha==)` (`:229`) dirá “igual” con bytes distintos. Además `same_content=True` compatible con `changed_fields!=[]` (p. ej. mismo bytes, distinto comentario) → UI contradictoria.
- **Evidencia:** Líneas citadas; `open_stored_file + save` sin re-hash.
- **Solución recomendada:** Re-hashear tras copiar; separar `same_bytes` vs `same_metadata`.

### B18 — BAJO — Lógica duplicada / casos límite en subida
- **Archivo:** `documentos/file_validation.py:71-113`, `documentos/document_views.py:547-548,424`
- **Componente:** `validate_uploaded_file()`
- **Problema:** Vista valida y luego `save_document_file` revalida (doble SHA256 + doble scan zip 200MB). Límite `policy['max_file_mb']` vs `settings.MAX_UPLOAD_SIZE_MB` vs `DATA_UPLOAD_MAX_MEMORY_SIZE`: si org sube límite sobre el env, Django puede rechazar antes con error genérico (no `{'file':...}`). `uploaded_file.size` confía en header multipart sin verificar bytes reales hasheados.
- **Evidencia:** Dos llamadas citadas; `config_service.py:186 1<=file<=request<=2048`.
- **Solución recomendada:** Validar una vez y pasar `file_data`; verificar `len(hashed)==size`; mapear `SuspiciousOperation/TooLarge` a `{'file':...}`.

### B19 — BAJO — Casos límite: ACL vacía y permisos no documentales
- **Archivo:** `documentos/document_views.py:685-718`, `document_serializers.py` (implícito)
- **Componente:** `DocumentPermissionsView.put()`, `validate_document_permission_assignments()`
- **Problema:** Acepta `assignments=[]` → `DELETE` total + `executemany([])` → documento vuelve a fallback global/área (apertura silenciosa sin confirmación). Valida que roles sean de la org y perms activos, pero no que el `permiso.codigo` sea documental (`documentos.*`); admite asignar `usuarios.gestionar` a un documento (sin efecto, confunde).
- **Evidencia:** `:692-711` sin guarda `if not rows`; `:337-360` sin filtro `modulo/codigo`.
- **Solución recomendada:** Exigir `confirm_clear=true` para vaciar; allowlist `{'documentos.consultar','documentos.descargar',...}`.

### B20 — MEJORA — Errores silenciosos: auditoría best-effort
- **Archivo:** `documentos/auth_utils.py` (ver arquitectura D11), `documentos/document_views.py:469-473,882-886`
- **Componente:** `record_auth_event/record_document_event`
- **Problema:** Si la bitácora falla, solo `logger.critical AUDITORIA_NO_REGISTRADA` y la operación devuelve `200/201`. Correcto no bloquear, pero sin outbox/reintento la trazabilidad legalmente exigible queda hueca.
- **Evidencia:** `except Exception: logger.critical(...)` sin re-raise; `save_document_file except Exception → ValidationError('No se pudo guardar')` enmascara causa.
- **Solución recomendada:** Outbox transaccional + worker; preservar excepción original en `details`; métrica `audit_dropped_total`.

## 3. Cobertura pedida

| Pedido | Estado |
|---|---|
| errores lógicos | B01, B08, B10, B15 |
| condiciones incorrectas | B08, B15, B19 |
| validaciones faltantes | B08, B11, B12, B18, B19 |
| validaciones contradictorias | B10, B11, B16 |
| operaciones incompletas | B05, B09, B16 |
| estados imposibles/inconsistentes | B05, B12, B14 |
| cálculos incorrectos | B07, B17 |
| orden incorrecto | B03, B09 |
| casos límite | B07, B15, B18, B19 |
| excepciones no controladas | B02 |
| errores silenciosos | B16, B20 |
| lógica duplicada | B18 + A08 (fechas) |
| reglas diferentes | B07, B10, B11 |
| dependencias incorrectas | B13 + A05/A06 |
| funciones demasiado complejas | `save_document_file`, `ReviewDecision.post`, `create_backup`, `build_report_data` (ver A02/A03) |
| efectos secundarios | B05, B06, B16 |
| datos parciales | B03, B06, B09 |
| concurrencia | B04 (+B12-B14) |
