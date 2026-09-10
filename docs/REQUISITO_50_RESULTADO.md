# Requisito 50 — confiabilidad del helper de auditoría

9 de septiembre de 2026. Solo detección, comunicación de fallos y política transaccional. Sin before/after.

## Política: operación principal conservada, fallo de auditoría observable

Los llamadores existentes registran eventos tanto dentro como después de sus transacciones. Por ello no se introduce un error HTTP que pueda hacer parecer revertida una operación ya confirmada. Se mantiene la operación principal y se comunica la degradación de auditoría. **Esta política no garantiza que toda acción tenga un evento persistido ni bloquea una acción por indisponibilidad de la bitácora.**

Cada escritura usa `transaction.atomic()`: transacción propia en autocommit, savepoint si existe una transacción exterior. Se exige exactamente una fila y `RETURNING id`; cero filas o más de una provocan excepción dentro del bloque y rollback de esa escritura. Las excepciones se capturan después de salir del bloque, para no continuar usando una transacción dañada por un error SQL de auditoría.

La inserción correcta retorna `AuditWriteResult(inserted=True, event_id=..., pending_commit=...)`. Si hay una transacción exterior, el evento comparte su commit/rollback y no se anuncia como confirmado. No se confirma ni repara una transacción del llamador que ya estaba dañada. Un fallo posterior del commit exterior corresponde a esa operación exterior; el resultado del helper no promete durabilidad anticipada.

La inserción fallida retorna `inserted=False`, `failure_id` y `reason`. Los wrappers de eventos devuelven ese resultado al llamador. No hay reintentos automáticos ni cola de recuperación; tampoco se agregan eventos ficticios o catálogos para silenciar errores existentes.

## Evidencia observable

Cada fallo produce un registro CRITICAL `AUDITORIA_NO_REGISTRADA` con JSON y atributo estructurado `audit_failure`: referencia UUID, motivo, acción, recurso, organización, usuario, ID de recurso, contexto transaccional, clase de excepción y SQLSTATE disponible. El formateador existente agrega fecha y logger. Se excluyen detalles, resultados libres, credenciales, parámetros SQL y mensajes de excepción potencialmente sensibles.

La evidencia sale por el logger de consola existente, fuera de la transacción de BD. Su conservación depende de la retención de logs del entorno; no se afirma una cola durable ni supervisión externa configurada.

`AuditFailureMiddleware` transmite en la respuesta:

- `X-Audit-Status: failed`
- `X-Audit-Failure-Id`: referencia del primer fallo, correlacionable con el log.
- `X-Audit-Failure-Count`: cantidad de fallos de esa solicitud.
- `Cache-Control: private, no-store`.

Conserva estado y cuerpo de la respuesta principal, también para 204 y 403. Funciona con el request Django subyacente a DRF; no añade cabeceras de éxito que pudieran prometer un commit todavía pendiente. No agrega interfaz ni datos before/after. Las cabeceras son evidencia técnica HTTP; no se incorpora una alerta visual al frontend.

## Validación

`docs/verificar_auditoria_50.py`: **16 comprobaciones aprobadas contra PostgreSQL Neon**. Inserción real con ID, catálogo inexistente/cero filas, error SQL real 22012 inyectado únicamente en la escritura de auditoría, recuperación de savepoint, rollback conjunto y fallo sin transacción exterior. Endpoint real de archivado: mantiene 204 y baja lógica, comunica fallo por cabeceras y correlaciona referencia con log. Prueba de 403 preservado y ausencia de cabeceras falsas cuando no falla.

`documentos/test_audit_reliability.py`: **7 pruebas unitarias aprobadas**. Incluyen más de una fila, fallo al salir de la transacción propia, BD indisponible, serialización fallida y ausencia de secretos en logs. Los fallos de commit/conexión de estas pruebas son simulados; el error SQL y los savepoints del ensayo Neon son reales.

`manage.py check` y `git diff --check`: aprobados. Resultado técnico en `docs/resultado_auditoria_50.json`. MCP Neon confirmó cero eventos del recurso `d1d42157-f754-4fe6-a741-95cd69f793d6` y cero documentos con ID `976bf945-3a8c-4878-a9c2-4042a52bc76a` tras rollback.

Cambios locales; sin commit ni despliegue Render. No se cambia la cobertura de acciones, el catálogo, los datos before/after ni las demás funciones de auditoría. Los cambios de publicación #31/#49 del trabajo anterior se conservan.
