# Requisito 48: versión corregida y nueva revisión

Fecha: 9 de septiembre de 2026.

## Alcance del cambio

El Editor ofrece «Crear versión corregida» al abrir una versión RECHAZADO. La acción abre la carga existente, inicialmente como versión menor; se conserva el rechazo anterior. Tras cargar el archivo, el documento muestra la nueva versión BORRADOR y la indicación de enviarla para iniciar una nueva ronda.

«Enviar a revisión» solo está disponible para BORRADOR. Al abrir el formulario se conserva la versión objetivo y se muestra su número; el envío utiliza ese ID, sin volver a elegir una versión global al confirmar. Al cargar otro archivo se cierra cualquier formulario de envío anterior. La confirmación identifica la versión enviada.

Cada nueva ronda del flujo solicitado corresponde a una versión nueva y solicitudes nuevas. La restricción real de Neon `uq_solicitudes_revision_version_revisor` es `UNIQUE(version_documento_id, revisor_id)`: 1.0 y 1.1 pueden tener el mismo Revisor porque sus IDs de versión son diferentes. No se altera esta restricción ni se reutilizan o eliminan solicitudes históricas.

El backend conserva los bloqueos de #46 y comprueba, antes de cambiar el estado o crear solicitudes, si algún Revisor elegido ya tiene una solicitud para esa versión. En ese caso responde 409 `REVIEW_VERSION_ALREADY_ASSIGNED` e indica crear otra versión. No implementa rondas repetidas sobre el mismo archivo.

## Ensayo

Scripts `verificar_nueva_ronda.py` y `verificar_nueva_ronda_ui.cjs`: documento inicial temporal, navegador con componentes reales, puente HTTP loopback hacia vistas Django reales y Neon. Se usa autenticación DRF explícita de Editor/Revisor, archivos PNG con bytes distintos, notificaciones desactivadas y una transacción externa para revertir todos los datos. No certifica login, correo, S3 ni despliegue en Render.

El ensayo opera desde UI el envío de 1.0, rechazo, carga de 1.1 y envío de 1.1 al mismo Revisor. Recarga al Editor antes del segundo envío y comprueba la bandeja API del Revisor, la pantalla de la solicitud nueva y la conservación de versión, archivo, comentario e identidad de la solicitud anterior. Incluye reintento del envío y comprobación del rechazo de una pareja versión/Revisor ya utilizada.

## Resultado: aprobado

- 1.0 enviada y rechazada desde el formulario con motivo `REQ48: Corregir firma y enviar archivo nuevo.`
- Editor crea 1.1 con archivo corregido de bytes/hash distintos. 1.0 mantiene archivo, estado RECHAZADO, solicitud y motivo; 1.1 es la vigente.
- Tras recargar, Editor envía 1.1 al mismo Revisor: HTTP 201, solicitud nueva `469e5946-1cfe-446d-814a-ccc227e9e900`, distinta de la anterior `a84a1fd1-063c-4d2b-8f75-5436e3fcc6a4`.
- La bandeja del Revisor contiene la solicitud nueva PENDIENTE de 1.1; no incluye la anterior en el filtro de pendientes. Su pantalla muestra 1.1 y permite decidir. No hereda comentario de resolución ni fecha de resolución anteriores.
- Repetir el envío no crea filas adicionales. La comprobación específica de reutilización de pareja versión/revisor responde 409 sin violar UNIQUE. Para ejercitar esa protección se utiliza un cambio temporal a BORRADOR dentro de un savepoint que se revierte; no forma parte del flujo de corrección.
- La transacción de ensayo se revirtió por completo. MCP Neon confirmó cero documentos y solicitudes del ensayo después de la reversión.

Evidencia: `resultado_nueva_ronda.json` y captura inspeccionada `nueva_ronda_revisor.png`. La carga multipart se transmite directamente desde Chromium para preservar los bytes del archivo.

Build, lint y `git diff --check` aprobados. Permanecen advertencias de tamaño de paquete y React, así como avisos preexistentes del catálogo de auditoría ARCHIVO y la denegación del panel de permisos al Editor; no se modifican aquí. Sin commit ni despliegue en Render.
