# Requisito 54 — detalle de modificaciones

9 de septiembre de 2026. Alcance: añadir diferencias a los eventos de modificación existentes.

## Contrato

`details.changes` contiene únicamente campos auditables que cambiaron:

```json
{"changes":[{"field":"title","before":"Título original","after":"Título corregido"}]}
```

El PATCH de prueba envió únicamente `title`. El evento real de Neon **548**, acción `DOCUMENTO_MODIFICADO`, contenía exactamente el JSON anterior, sin campos adicionales en `changes`. Repetir el mismo título produjo el evento 549 con `changes: []`.

Se comparan valores persistidos/normalizados, no el cuerpo de la petición. UUID y fechas se normalizan a JSON; false, null y eliminaciones conservan su significado. No se incluye `actualizado_en` ni otros datos automáticos como si fueran cambios solicitados.

## Cobertura

- Ficha documental: código, título, descripción, fecha, área y tipo.
- Metadatos declarados por la aplicación: `classification` y `observations`, incluidas eliminaciones.
- Usuarios: perfil, área, activación/baja, bloqueo e intentos fallidos; asignación de roles mediante IDs ordenados.
- Roles y permisos: campos editables y asignaciones de permisos mediante IDs ordenados.
- ACL documental: política por permiso y concesión por pareja rol/permiso.
- Configuración: campos descriptivos y operativos explícitamente permitidos, sin credenciales de servicios ni URLs que puedan contenerlas.

La captura anterior y la escritura se mantienen en la misma transacción y con bloqueo del recurso en las modificaciones incorporadas. Se conserva la política de fallos observables del requisito #50; esta tarea no cambia esa garantía de persistencia ni agrega otros eventos.

## Exclusión de datos sensibles

Las instantáneas se construyen con listas explícitas de campos. No se serializan modelos completos, cuerpos de petición, sesiones, hashes, contraseñas, tokens ni secretos de integración. Los metadatos desconocidos no se copian a la auditoría, aunque su nombre parezca inocuo. El comparador también excluye nombres sensibles como password, contraseña, token, secret, credentials, api_key y private_key, normalizando acentos y separadores.

Los restablecimientos de contraseña conservan su mensaje de acción, sin anterior/nuevo de la credencial. No se altera el almacenamiento de datos ni se intenta reconocer secretos pegados por un usuario dentro de campos descriptivos admitidos; las listas limitan qué campos del sistema se capturan.

## Pruebas

`docs/verificar_modificaciones_54.py`: **13 comprobaciones aprobadas**, con vistas Django reales conectadas a Neon. Comprueban el cambio único de título, mismo valor sin diferencias, alta/eliminación de metadatos, modificación de usuario/rol/permiso, permisos de rol, ACL, configuración y estado de usuario. Los valores centinela de contraseña, token y metadato desconocido y el hash del usuario no aparecen en los eventos capturados.

`documentos/test_audit_changes.py`: **5 pruebas unitarias aprobadas** sobre cambio único, normalización, null/false y exclusiones. También pasan las **7 pruebas de regresión del helper #50**, `manage.py check` y `git diff --check`.

Resultado completo: `docs/resultado_modificaciones_54.json`. Todos los datos de ensayo se revirtieron. MCP Neon confirmó cero filas de los eventos 548–559 y cero documentos con ID `f2c356b9-4733-4b50-bdac-aa52de94f538` tras rollback. Los IDs son evidencia del ensayo, no eventos conservados para consulta posterior.

Cambios locales, sin commit ni despliegue Render. No se certifica UI ni se modifica la reconstrucción histórica, exportación, cobertura de otros tipos de eventos o retención de auditoría. Los cambios de tareas anteriores se conservan.
