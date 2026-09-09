# Requisito 46: consistencia y concurrencia de aprobación

Fecha: 9 de septiembre de 2026.

## Cambio limitado

`ReviewDecisionView` adquiere el bloqueo de la versión dentro de `transaction.atomic`, bloquea la solicitud y relee autorización, asignación y estados. Exige solicitud PENDIENTE y versión EN_REVISION después de esperar. Bloquea y materializa las solicitudes pendientes y el checklist antes de escribir. Una segunda decisión sobre una solicitud resuelta devuelve 409 sin sobrescribir la primera.

El bloqueo común usa el orden versión → solicitudes → checklist. Envío de solicitudes, reasignación y creación/edición de checklist participan en ese orden: son escrituras que podrían invalidar las condiciones comprobadas por una aprobación. No se alteran permisos ni reglas funcionales de estas operaciones.

La aprobación modifica solamente la solicitud elegida. Mientras exista otra pendiente, la versión conserva EN_REVISION. Solo la última aprobación cambia la versión a APROBADO. La respuesta incluye `approval.individual_approved`, `version_approved`, `pending_count`, `version_id` y `version_status`, capturados bajo bloqueo. La pantalla distingue aprobación individual de aprobación total y no anuncia éxito ante 409.

Se conserva el ID de versión exacto de #45, incluida una versión no vigente. No se impone `is_current`. No se cambia publicación, catálogo de auditoría, notificaciones ni política de cierre: rechazo/devolución continúan cerrando explícitamente las otras pendientes, conservando sus filas, motivo y fecha. Aprobar nunca elimina ni cierra las solicitudes de otros revisores.

## Pruebas realizadas

Script reproducible: `verificar_aprobacion_concurrente.py`, con variable `REQ46_DATABASE_URL` obligatoria y sin fallback a producción. Rama temporal Neon `br-steep-morning-auq3ac3v` de `sistema-documental`; backend local, archivos temporales, cuentas existentes Editor/Revisor/Administrador, correos desactivados en la prueba. Las peticiones usan autenticación de prueba DRF; no se certifica login ni S3.

Ocho comprobaciones agrupadas aprobadas:

1. Dos revisores secuenciales: primera aprobación conserva la segunda PENDIENTE; última aprueba la versión.
2. Dos aprobaciones concurrentes sobre solicitudes distintas: ambas 200, resultados individual/total, dos filas APROBADAS y exactamente una transición a APROBADO.
3. Misma solicitud, aprobar/aprobar: un 200 y un 409.
4. Misma solicitud, aprobar/rechazar: un 200 y un 409; sin sobrescritura contradictoria.
5. Misma solicitud, aprobar/devolver: un 200 y un 409.
6. Solicitudes distintas, aprobar/rechazar: versión RECHAZADO, sin transición a APROBADO y ambas filas conservadas; cierre explícito según la regla existente.
7. Checklist incompleto impide escritura. Completarlo y competir entre aprobación/desmarcado deja un resultado coherente: aprobado con checklist completo, o pendiente con checklist incompleto.
8. Fallo provocado durante la transición revierte la solicitud y conserva PENDIENTE/EN_REVISION.

Los seis escenarios concurrentes mantienen dos conexiones/transacciones independientes y commits reales en la rama aislada. Una pausa controlada después de adquirir el bloqueo permite confirmar la espera del competidor mediante `pg_blocking_pids`; no se simulan estados ni resultados de decisión. Se usan transacciones externas de prueba para mantener estable el PID a través del pooler de Neon.

MCP Neon confirmó que la versión concurrente `d4367d91-3464-49fa-83ca-81f7b3de0df8` tiene dos solicitudes aprobadas, cero pendientes y estado APROBADO; la prueba de rollback `7edbf3fd-69b9-45ba-84d2-f35bf9bc631e` conserva una pendiente y EN_REVISION. Resultados completos en `resultado_aprobacion_concurrente.json`.

Tres casos UI aprobados con API controlada (`verificar_aprobacion_ui.cjs`): individual, total y conflicto. También pasan los cuatro casos de regresión UI de #45, build, lint y `git diff --check`. Build/lint mantienen advertencias previas de paquete grande y React.

Los avisos preexistentes de catálogo para ARCHIVO siguen fuera de alcance. Cambios locales sin commit ni despliegue en Render.

La rama temporal se eliminó mediante MCP tras comprobar los resultados. Los datos de prueba y los commits de ensayo nunca se aplicaron a la rama de producción.
