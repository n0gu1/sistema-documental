# AUDITORIA_DATABASE — Persistencia y base de datos

> Alcance estricto: solo capa persistencia/DB (tablas, entidades, relaciones, PK/FK, restricciones, índices, duplicados, consultas, N+1, costo, transacciones, atomicidad, concurrencia, carreras, integridad, cascadas, updates incompletos, migraciones, SQL inseguro/inyección, ORM, conexiones/pool, errores DB, sensibles). Sin frontend visual. Base: `AUDITORIA_CONTEXTO.md` + lectura `documentos/models.py` (961 lín), `backend/settings.py:126-179`, `migrations/0001-0019`, `auth_utils/reader_access/audit_views/document/workflow/management/reports/backup_service/views.py`.
> Fecha: 2026-09-05.

## 1. Mapa persistencia observada

- **Motor:** PostgreSQL obligatorio (`DATABASE_URL postgres|postgresql` o `DB_*`, `sslmode=require` prod, `CONN_MAX_AGE=600`, `CONN_HEALTH_CHECKS=True`). `db.sqlite3` residual ignorado.
- **Esquema:** `gestion_documental.*`, PKs UUID (`uuid4`, salvo catálogos `SmallInteger` y `HistorialEstadoVersion BigAutoField`, intermedias `CompositePrimaryKey`). `db_table` con quoting `'"gestion_documental"."tabla"'`.
- **Doble régimen:** ~14 modelos `managed=False` (tablas externas: `usuarios, sesiones, roles, permisos, usuarios_roles, roles_permisos, tipos_documento, areas, estados_version, proveedores_almacenamiento, documentos, versiones_documento, estados_revision, solicitudes_revision, historial_estados_version, respaldos_v2, configuraciones_respaldo_v2, configuraciones_sistema_v2`) + resto `managed=True` (`organizaciones, areas, tipos, clasificaciones, estados_documento, acciones/tipos_auditoria, documentos_metadatos, detalle/checklist/comentarios, reportes_v2, accesos, favoritos, notificaciones`). **Misma tabla lógica `areas/tipos_documento` mapeada dos veces** (`Area` managed + `AreaCatalogo` unmanaged, `TipoDocumento` + `TipoDocumentoCatalogo`).
- **Acceso:** ORM + SQL crudo (`connection.cursor`) para RBAC/auditoría/ACL/bitácora/respaldos. Sin repositorios.
- **FKs reales solo donde hay `ForeignKey`; tenant (`organizacion_id`) es `UUIDField` plano en 9 modelos, sin FK a `Organizacion`.**

## 2. Tabla resumen

| ID | Severidad | Archivo | Problema |
|----|-----------|---------|----------|
| D01 | CRÍTICO | `models.py:426-467,722-781` + `backup_service` | Tenancy sin integridad referencial (`organizacion_id` plano, sin FK/índice/cascada) |
| D02 | ALTO | `models.py:497-539`, `document_views.py:438-460,840-866` | Sin unicidad `es_vigente`/`orden_version`/`codigo` → duplicados y doble vigente en carrera |
| D03 | ALTO | `reader_access.py:82-86`, `reports_views.py:151-155,200-205`, `reader_views.py:104` | N+1 masivo: ACL por documento en Python (hasta ~4 queries/doc) + filtros en memoria |
| D04 | ALTO | `audit_views.py:74-119,132-162,165-192` | Auditoría costosa: 9 `ILIKE` + `detalles::text` + `COUNT(*)` + export 10k en memoria |
| D05 | ALTO | `migrations/0001` + `models.py:31,68,287...` | `managed=False` mayoritario → migraciones no gobiernan DDL, deriva esquema |
| D06 | MEDIO | `document_views.py:437-473,840-886`, `views.py:82-139` | Atomicidad parcial: storage/S3 fuera de transacción + auditoría fuera del `atomic` |
| D07 | MEDIO | `backup_service.py:742-778,781-800` + `management_views.py:205-294` | Transacciones bien aisladas en backup pero sin retry serializable; dashboard con ~12 queries |
| D08 | MEDIO | `models.py:99-239,426-467` vs `369-423` | Entidades/relaciones duplicadas (`Area/AreaCatalogo`, `Tipo/TipoCatalogo`) + `on_delete` mixto sin regla |
| D09 | MEDIO | `models.py:426-539,832-904` + `views` | Borrado lógico sin índice parcial + cascadas `CASCADE` latentes + updates incompletos (`save(update_fields)`) |
| D10 | MEDIO | `settings.py:140-151,167-178` | Pool/conexiones: `CONN_MAX_AGE=600` persistente sin límites/timeouts, riesgo free-DB |
| D11 | BAJO | `auth_utils.py:92-143`, `document_views.py:469-473,882-886`, `backup_service.py:1259-1330` | Manejo errores DB: auditoría traga excepción, ORM→400 enmascara 500, sin reintento serialización |
| D12 | BAJO | `audit_views.py:133-139,184` + greps | SQL inseguro/inyección: **no hallado** (todo `%s`), `f-string` solo con columna allowlist e `INTERVAL` constante |
| D13 | MEDIO | `models.py:12-28,50-65,767-781` | Sensibles: `hash_contrasena/hash_token` sin pepper, `smtp.password_token` en JSONB, IP/UA en claro |
| D14 | MEJORA | `models.py:87-129,153-207,695-719,870-903,958-960` | Índices parciales: bien en nuevos, ausentes en calientes legacy (`documentos.organizacion_id`, `sesiones.hash_token` depende DDL externo) |

---

## 3. Hallazgos detallados

### D01 — CRÍTICO — Estructura/relaciones: tenancy sin FK ni integridad
- **Archivo:** `documentos/models.py:12-15,426-428,680-703,722-769`
- **Componente:** `UsuarioDocumental.organizacion_id`, `Documento.organizacion_id`, `ReporteGenerado.organizacion_id`, `Respaldo.organizacion_id`, `Configuracion*.organizacion_id`, `AreaCatalogo/Proveedor.organizacion_id`
- **Problema:** El tenant es `UUIDField` suelto, no `ForeignKey(Organizacion, on_delete=...)`. No hay `CASCADE/PROTECT/RESTRICT`, ni `UniqueConstraint` compuesta que incluya tenant donde toca, ni `Index` declarado en unmanaged. Borrar una `Organizacion` deja huérfanos en 9 tablas; un `UPDATE` de `organizacion.id` no propaga; el aislamiento depende 100% de `filter(organizacion_id=...)` en cada vista.
- **Evidencia:** `organizacion_id = models.UUIDField()` repetido (`:14,428,680,701,724,750,769`); `Area.organizacion = ForeignKey(...CASCADE)` sí es FK, pero `Documento.organizacion_id` no; `grep on_delete` no muestra ninguna FK hacia `Organizacion` desde documentos/reportes/respaldos.
- **Impacto:** Orfandad silenciosa, cross-tenant por olvido de filtro (defensa solo en código, ver H01/H04 auth), imposible `ON DELETE RESTRICT` a nivel motor, backups/restores deben reimplementar grafo (`BACKUP_RELATIONS`).
- **Solución recomendada:** Convertir a `ForeignKey(Organizacion, db_column='organizacion_id', on_delete=PROTECT/RESTRICT, db_index=True)` donde el DDL externo lo permita; si el DDL externo es inmutable, añadir `CheckConstraint` + trigger `FK` + test que falla si una query a `documentos/*` no filtra `organizacion_id` (lint AST o wrapper `TenantManager`).

### D02 — ALTO — Claves/restricciones: sin unicidad operativa → datos duplicados en concurrencia
- **Archivo:** `documentos/models.py:497-539`, `documentos/document_views.py:438-460,632-633,840-866`, `management_views.py:361-372`
- **Componente:** `ArchivoDocumento(es_vigente, orden_version, numero_mayor/menor)`, `Documento(codigo+organizacion)`, `Usuario(nombre/correo+organizacion)`
- **Problema:** No hay `UniqueConstraint`: (a) un solo `es_vigente=True` por documento (índice parcial), (b) `(documento, orden_version)` único, (c) `(organizacion, codigo)` en `Documento` (solo check en Python `exists()`), (d) `(organizacion, nombre_usuario/correo)` en `Usuario` (unmanaged, sin constraint; check `iexact` en Python). Dos `POST files` concurrentes leen mismo `latest` vía `select_for_update` sobre `archivos` pero sin bloquear fila `Documento` ni índice único → doble `orden_version+1` y doble `es_vigente=True`.
- **Evidencia:** `Meta managed=False ordering=['-orden_version']` sin `constraints/indexes` en `Archivo/Documento`; `latest = document.archivos.select_for_update().order_by('-orden_version').first()` + `filter(es_vigente=True).update(es_vigente=False)` + `create(es_vigente=True)` (`:438-460`, `:841-866`); `Documento.objects.filter(organizacion_id,codigo,eliminado_en__isnull=True).exists()` antes de `create` (`:544`, `:632`).
- **Impacto:** Versiones duplicadas, vigente ambiguo (`current_version` toma `first()` arbitrario), códigos duplicados, login ambiguo cross-org ya reportado.
- **Solución recomendada:** DDL: `UNIQUE (documento_id, orden_version)`, `EXCLUDE/UNIQUE parcial (documento_id) WHERE es_vigente`, `UNIQUE (organizacion_id, codigo) WHERE eliminado_en IS NULL`, `UNIQUE (organizacion_id, lower(correo))`; envolver creación en `atomic` + capturar `IntegrityError→409`; bloquear `SELECT ... FOR UPDATE OF documentos WHERE id=...` antes de versionar.

### D03 — ALTO — Consultas N+1 / innecesarias / demasiado costosas en lector y reportes
- **Archivo:** `documentos/reader_access.py:32-86`, `reader_views.py:104-143`, `reports_views.py:125-177,180-230`
- **Componente:** `filter_accessible_documents()`, `accessible_reader_documents()`, `document_report_rows()`, `reviewer_report_rows()`
- **Problema:** `filter_accessible_documents(user, queryset)` itera en Python y por documento llama `has_document_permission()` → 1 cursor ACL + hasta 2 `get_user_roles()` + 1 `Documento.only()` = hasta 4 queries/doc. Lector lista todo `published_document_queryset(org)` y filtra/ordena/pagina **en memoria** (`search/type/area/date/ordering/sort/total=len()`). Reportes igual: prefetch correcto pero luego filtra por permiso y `status_code` en Python tras traer todo.
- **Evidencia:** `:82-86 return [d for d in documents if has_document_permission(...)]`; `reader_views.py:104 documents = accessible_reader_documents(...)` + `:107-131` comprehensions + `sort` + `len`; `reports_views.py:151-161 queryset → filter_accessible → for document ... if status_code continue`.
- **Impacto:** 100 docs → ~300-400 queries + RAM; `limit=100` no limita DB (trae todo y corta en Python); latencia lineal, timeouts en orgs grandes, costo BDD.
- **Solución recomendada:** Empujar ACL a SQL (`EXISTS` en `WHERE`, `JOIN documentos_roles_permisos`), filtros/orden/paginación en DB (`icontains/trigram`, `order_by`, `LIMIT/OFFSET` + `COUNT(*) OVER()`), `values_list('id')` para favoritos; test `assertNumQueries` por listado.

### D04 — ALTO — Consulta auditoría demasiado costosa + exportación sin streaming
- **Archivo:** `documentos/audit_views.py:74-119,132-162`, `management_views.py:239-242`
- **Componente:** `audit_query_parts/fetch_audit_rows/fetch_security_alerts`, `AuditExportView`, dashboard `activity`
- **Problema:** `search` genera 9 `OR ILIKE %...%` sobre `username/nombres/action/recurso/resultado/detalles::text/recurso_id::text/ip::text` sin índice trigram/full-text → seq scan + cast `::text` por fila. `fetch_audit_rows` hace `SELECT ... LIMIT/OFFSET` + segundo `SELECT COUNT(*)` con mismo `WHERE` (doble costo). `AuditExportView` pide `10000` filas en memoria y escribe CSV en response (sin `StreamingHttpResponse`). Cada `GET dashboard` dispara `fetch_audit_rows(org,6)` + `fetch_security_alerts` (GROUP BY ip/usuario 24h).
- **Evidencia:** `:103-116` 9 `ILIKE`, `:154-161` `LIMIT/OFFSET` + `COUNT(*)`, `:245 _, rows = fetch_audit_rows(params,10000)`, `:182-188 GROUP BY ... HAVING COUNT(*)>=... LIMIT 50`.
- **Impacto:** Lentitud bitácora, presión memoria workers, facturación Render DB.
- **Solución recomendada:** `pg_trgm`/`tsvector` + índices `GIN`, paginación keyset `(event_at,id)`, `COUNT(*) OVER()` o conteo estimado, export por streaming + cursor server-side + límite/tarea async, cachear `audit_timestamp_column()` (`@lru_cache`), materializar alertas.

### D05 — ALTO — Migraciones: `managed=False` deja DDL fuera de Django
- **Archivo:** `documentos/migrations/0001_auth_unmanaged_models.py:33-36,60-63`, `models.py:31,68,287,304,338,365...`
- **Componente:** `Usuario/Sesion/Rol/Permiso/UsuariosRoles/RolesPermisos/Documentos/Versiones/Solicitudes/Historial/Respaldos/Config`
- **Problema:** 14 tablas `managed=False` → `migrate` no crea/altera nada; el esquema real vive fuera (SQL manual). `models.py` y DB pueden derivar (tipos `SmallInteger vs UUID`, `CompositePrimaryKey`, `unique hash_token`, `CheckConstraint` solo en managed). 19 migraciones solo cubren nuevos dominios; cambios legacy exigen DDL manual sin versionado.
- **Evidencia:** `options={'db_table':..., 'managed':False}` en migración inicial y modelos; `backend-checklist.txt:37` admite “no hay PostgreSQL local, sin historial migraciones”.
- **Impacto:** Deploys no reproducibles, `migrate` en Render no garantiza constraints/índices legacy, rollback imposible, entornos divergen.
- **Solución recomendada:** Congelar DDL externo en `sql/ddl_gestion_documental.sql` versionado + `migrations.RunSQL` idempotentes para constraints/índices faltantes (D02/D14), o migrar a `managed=True` por fases con `SeparateDatabaseAndState`; CI con Postgres efímero + `sqlmigrate --check`.

### D06 — MEDIO — Transacciones/atomicidad: mitad DB, mitad storage, auditoría fuera
- **Archivo:** `documentos/document_views.py:437-473,549-571,840-886`, `documentos/views.py:82-139,174-185`
- **Componente:** `save_document_file`, create/restore documento, login, `record_*_event`
- **Problema:** `transaction.atomic()` cubre ORM pero `default_storage.save/delete` (S3/B2) no es transaccional: éxito DB + fallo S3 (o viceversa) deja huérfano (`storage_key` compensado solo en `except`, no en fallo posterior). `record_document_event/record_auth_event` se llama **después** del `atomic` → doc/sesión creada sin auditoría si bitácora falla (solo `logger.critical AUDITORIA_NO_REGISTRADA`). Login crea sesión y actualiza usuario en un `atomic` (bien) pero audita fuera.
- **Evidencia:** `try: with atomic(): ... storage_key=save(...) ... create(...) except: delete(storage_key)`; `record_document_event(...DOCUMENTO_CREADO)` tras `atomic` (`:572`); `record_auth_event(SESION_INICIADA)` tras `atomic` (`views.py:174`).
- **Solución recomendada:** Patrón outbox: crear fila `eventos_pendientes` dentro del mismo `atomic`, worker async publica a bitácora/S3; o `on_commit(lambda: upload/audit)` + reconciliador huérfanos; test que simula fallo S3/auditoría y exige rollback/compensación.

### D07 — MEDIO — Concurrencia: buen aislamiento en backup, dashboard derrochador
- **Archivo:** `documentos/backup_service.py:742-778`, `documentos/management_views.py:205-294`
- **Componente:** `database_snapshot_transaction (REPEATABLE READ READ ONLY)`, `database_restore_transaction (SERIALIZABLE)`, `AdminDashboardView`
- **Problema (positivo + resto):** Snapshot/restore usan niveles correctos (bien). Pero restore `SERIALIZABLE` sin retry ante `SerializationFailure` bajo concurrencia → 500 esporádico. Dashboard hace ~12 roundtrips: `documents.count()`, 5× `status_counts distinct().count()`, `pending.count()`, `overdue.count()`, 3× `users.count()`, `sessions.count()`, `fetch_audit_rows`, `fetch_security_alerts`, más `prefetch archivos` y `select_related` correctos pero con `order_by('-es_vigente','-orden_version')` booleano (no usa índice).
- **Evidencia:** `:744-751 SET TRANSACTION ... REPEATABLE READ, READ ONLY`, `:766 SERIALIZABLE`; `:225-231 {code: documents.filter(...).distinct().count() for code in 5}`, `:275-286` conteos.
- **Impacto:** Picos latencia dashboard, fallos restore concurrente.
- **Solución recomendada:** Retry exponencial en `SerializationFailure` (3 intentos), agregación única `GROUP BY estado` en vez de 5 counts, `COUNT(*) FILTER (WHERE...)`, índice `(organizacion_id, es_vigente, estado_version_id)`.

### D08 — MEDIO — Entidades/relaciones duplicadas y `on_delete` sin doctrina
- **Archivo:** `documentos/models.py:99-168 vs 369-406`, `426-467`
- **Componente:** `Area vs AreaCatalogo`, `TipoDocumento vs TipoDocumentoCatalogo`, `Documento.area/tipo/creado_por/eliminado_por`
- **Problema:** Dos modelos por misma tabla lógica con PK/tipos distintos (`Area.id UUID` managed vs `AreaCatalogo.id UUID` unmanaged; `Tipo.id UUID` vs `Catalogo.id SmallInteger`). `Documento` apunta a catálogos unmanaged con `PROTECT`, mientras catálogos gestionados usan `CASCADE/RESTRICT`. `UsuarioRol/RolPermiso` usan `CompositePrimaryKey` + `CASCADE`, `asignado_por SET_NULL`, `Rol.organizacion RESTRICT` vs resto `CASCADE/PROTECT` sin matriz documentada.
- **Evidencia:** Líneas citadas; `grep on_delete` mezcla `CASCADE/PROTECT/RESTRICT/SET_NULL` sin comentario.
- **Impacto:** Confusión (¿crear `Area` o `AreaCatalogo`?), joins cruzados, borrados que `PROTECT` en ORM pero `CASCADE` en DDL externo (o nada).
- **Solución recomendada:** Un solo modelo por tabla (alias `db_table` único), matriz `on_delete` por agregado (org PROTECT, doc CASCADE solo hijos técnicos, auditoría RESTRICT), test que importa `models` y prohíbe duplicar `db_table`.

### D09 — MEDIO — Integridad: borrado lógico sin soporte + cascadas dormidas + updates parciales
- **Archivo:** `documentos/models.py:451-462,832-903,906-953`, `document_views.py:138-152`
- **Componente:** `eliminado_en/eliminado_por/motivo`, `RegistroAcceso/Favorito/Notificacion CASCADE`, `archive/unarchive`
- **Problema:** Borrado lógico correcto (conserva historial) pero sin índice parcial `WHERE eliminado_en IS NULL` en `Documento` unmanaged → cada listado filtra sin índice. `CASCADE` en accesos/favoritos/notifs/comentarios nunca se ejercita (no hay hard delete) pero si un `DELETE` raw ocurre, arrastra auditoría/trazabilidad. `archive/unarchive` y `UserDetail.patch` usan `save(update_fields=[...])` sin `F()` ni `select_for_update` → lost-update en `actualizado_en` concurrente.
- **Evidencia:** `archive_document save(update_fields=['eliminado_en',...])`; `Favorito UniqueConstraint` bien pero sin parcial borrado; `Notificacion/Acceso CASCADE` (`:844,850,882,888,920,931,939,947`).
- **Solución recomendada:** Índice parcial `(organizacion_id, actualizado_en) WHERE eliminado_en IS NULL`; cambiar hijos auditoría a `PROTECT/RESTRICT`; `update(actulizado_en=Now())` atómico + `select_for_update` o `F()`; job que verifica `eliminado_en` vs archivos S3.

### D10 — MEDIO — Conexiones/pool: persistentes sin gobierno
- **Archivo:** `backend/settings.py:140-151,167-178`
- **Componente:** `DATABASES default (CONN_MAX_AGE=600, CONN_HEALTH_CHECKS=True, OPTIONS sslmode)`
- **Problema:** `600s` por worker gunicorn × N workers = conexiones clavadas en Postgres free (límite bajo Render). Sin `pool` (PgBouncer), sin `statement_timeout/idle_in_transaction_timeout`, sin `MAX_CONNS` por dyno. `CONN_HEALTH_CHECKS` ayuda pero no cierra picos (dashboard 12 queries + N+1 lector + export 10k).
- **Evidencia:** Líneas citadas; `render.yaml` plan `free` DB + web `free`.
- **Impacto:** `too many connections`, latencia cola, caídas en picos.
- **Solución recomendada:** `CONN_MAX_AGE=60-120` + PgBouncer transaccional en Render, `OPTIONS: {connect_timeout:5, options:'-c statement_timeout=15000 -c idle_in_transaction_session_timeout=15000'}`, `ATOMIC_REQUESTS=False` ya implícito + transacciones explícitas cortas, monitor `pg_stat_activity`.

### D11 — BAJO — Manejo errores DB: silenciamiento y mapeo plano
- **Archivo:** `documentos/auth_utils.py:135-143`, `documentos/document_views.py:469-473,882-886`, `documentos/backup_service.py:1210-1264`
- **Componente:** `record_auth_event`, `save/restore`, `create_backup`
- **Problema:** Auditoría captura `Exception` genérica y sigue (`logger.critical`, request `200` aunque bitácora falle). Persistencia archivo mapea **todo** a `ValidationError 400` (`raise ... from error`) ocultando `IntegrityError/OperationalError` (debería 409/503). Backup sí distingue `BackupExecutionError` pero `except Exception` final lo envuelve sin código SQLSTATE.
- **Evidencia:** `except Exception: logger.critical(...AUDITORIA_NO_REGISTRADA...)`; `except Exception as error: ... raise ValidationError({'file':...}) from error`.
- **Impacto:** Operaciones “exitosas” sin traza, debugging sin SQLSTATE, reintentos imposibles.
- **Solución recomendada:** Excepciones tipadas (`AuditError`, `StorageError`, `ConcurrencyError`), `IntegrityError→409`, `OperationalError→503 + retry`, métrica `audit_fail_total`, test que fuerza fallo bitácora y exige 500/cola outbox (ver D06).

### D12 — BAJO — SQL inseguro/inyección: no hallado (con matiz)
- **Archivo:** `auth_utils.py:21-61`, `reader_access.py:35-60`, `audit_views.py:74-162`, `backup_service.py:167-283`
- **Componente:** Todo `connection.cursor().execute(sql, params)`
- **Problema:** **No hay inyección**: todo valor va en `%s`, incluidos `ILIKE %s` y `LIMIT/OFFSET` como params. Único `f-string` es `f'ba.{timestamp_column}'` y `f'SELECT COUNT(*) {...}'` donde `timestamp_column` viene de `audit_timestamp_column()` (allowlist de 6 columnas vía `information_schema`) e `INTERVAL '24 hours'` constante. `ORDER BY ba.{col} DESC` igual allowlist.
- **Evidencia:** `cursor.execute("""... WHERE table_schema=%s ...""", [BACKUP_SCHEMA])`; `audit_query_parts` solo interpola nombres de columna validados.
- **Impacto:** Nulo hoy; riesgo si alguien añade `ordering` crudo desde query params (ya existe `ordering_fields` allowlist en `document_views.py:109-118`, bien).
- **Solución recomendada (mejora):** Congelar allowlist en constante + `assert timestamp_column in ALLOWED`, prohibir `f'SELECT {user_input}'` con lint (`flake8-bandit B608`), mantener `sqlfluff`.

### D13 — MEDIO — Datos sensibles almacenados sin endurecer
- **Archivo:** `documentos/models.py:20,58,767-781,832-865`, `backend/settings.py:216`
- **Componente:** `hash_contrasena (255)`, `hash_token (64 unique)`, `ConfiguracionSistema.smtp.password_token`, `RegistroAcceso.direccion_ip/agente_usuario`, `Notificacion.error_correo`
- **Problema:** Hashes correctos (`make_password/check_password pbkdf2`, `SHA256(token)`) pero sin pepper separado; `password_token` SMTP cifrado `AESGCM(SHA256(backup_key+b'config'))` con misma raíz que respaldos y fallback `SHA256(SECRET_KEY)` si falta env (ver H07 auth). IP/UA en claro en `sesiones/accesos/bitácora` sin retención/mascarado; `error_correo` puede guardar trazas SMTP con credenciales parciales.
- **Evidencia:** `hash_contrasena Char255`, `hash_token Char64 unique`, `smtp JSONField`, `backup_key(): return sha256(SECRET_KEY)` si vacío.
- **Impacto:** Dump DB → crack offline teórico + PII + pivote SMTP.
- **Solución recomendada:** Pepper `SESSION_PEPPER/SMTP_PEPPER` en secreto aparte + `HKDF`, exigir `BACKUP_ENCRYPTION_KEY` en prod (fail-fast), retención IP (90d) + máscara `/24`, truncar `error_correo` sin auth headers, clasificar columnas sensibles en diccionario datos.

### D14 — MEJORA — Índices: buenos en nuevos, ausentes en calientes legacy
- **Archivo:** `documentos/models.py:127-129,163-165,205-207,695-719,870-903,958-960` vs `426-539,50-69`
- **Componente:** `ix_*` nuevos vs `documentos/versiones/sesiones/usuarios` unmanaged
- **Problema:** Nuevos (`areas/tipos/clasif/reportes/accesos/favoritos/notifs/metadatos uq`) bien indexados. Calientes legacy sin `Index` declarado: `documentos(organizacion_id, eliminado_en, actualizado_en, area_id, tipo_documento_id, creado_por_id)`, `versiones(documento_id, es_vigente, estado_version_id, orden)`, `sesiones(hash_token unique?, usuario_id, expira_en, revocada_en)`, `usuarios(organizacion_id, correo, nombre_usuario)`, `solicitudes(version_documento_id, revisor_id, estado_revision_id)`. Dependen del DDL externo invisible a Django.
- **Evidencia:** `Documento/Archivo/Sesion Meta` sin `indexes/constraints` (solo `ordering`); migración `0004 AddIndex ix_docs_org_*` existe pero sobre modelo que luego pasó a `managed=False` (deriva).
- **Impacto:** Seq scans por org, `distinct()` + `icontains codigo/nombre/descripcion` sin trigram, `ORDER BY actualizado_en` sin índice compuesto.
- **Solución recomendada:** `sql/migrations` con `CREATE INDEX CONCURRENTLY ix_docs_org_elim_actualizado ON ... (organizacion_id, eliminado_en, actualizado_en DESC)`, `ix_versiones_doc_vigente_orden`, `ix_sesiones_hash`, `ix_usuarios_org_correo`, `GIN pg_trgm` para búsquedas; `EXPLAIN ANALYZE` en CI para listados/auditoría.

## 4. Veredicto y prioridad

- **Estructura/entidades/relaciones:** correcta en nuevos, rota en tenancy (D01) y duplicada (D08).
- **PK/FK/restricciones/índices:** PK UUID bien; FK solo parcial; unicidades operativas ausentes (D02); índices nuevos bien, legacy ciegos (D14).
- **Consultas:** funcionales pero N+1 y en-memoria (D03) + auditoría pesada (D04) + dashboard disperso (D07).
- **Transacciones/atomicidad/concurrencia/carreras:** login/versionado atómicos en DB pero sin 2PC storage/auditoría (D06), sin lock documento (D02), sin retry serializable (D07).
- **Integridad/cascadas/updates:** lógica bien intencionada, sin soporte motor (D01/D09).
- **Migraciones:** dos velocidades, deriva (D05).
- **SQL/inyección/ORM:** ORM bien usado (`select_related/prefetch/select_for_update/only/distinct`) + SQL parametrizado sin inyección (D12); ORM mal usado al filtrar en Python (D03).
- **Conexiones/pool/errores:** persistentes sin gobierno (D10), errores tragados/planos (D11).
- **Sensibles:** hashes bien, gestión claves/IP mejorable (D13).

**Orden:** D01→D02→D03→D05→D04→D06→D10→D08/D09→D13→D11→D14→D07→D12 (vigilar).
