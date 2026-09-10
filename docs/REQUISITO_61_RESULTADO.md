# Requisito 61 — definición de actividad del revisor

9 de septiembre de 2026. Únicamente definición, fuente, fechas y etiquetas del reporte `scope=reviewer`.

## Qué cuenta

Una fila es un evento exitoso de decisión emitido por el usuario que consulta el reporte, dentro de su organización y sobre una versión cuyo documento sigue siendo accesible para ese usuario. La fuente es `bitacora_auditoria`, con recurso `VERSION`, actor `usuario_id` y fecha de evento (`ocurrido_en` en Neon; se usa el detector existente de columna de fecha).

| Indicador | Definición |
|---|---|
| Decisiones registradas (`total` / `completed`) | Suma de aprobaciones, rechazos y devoluciones registrados. Una fila por ID de evento. |
| Aprobaciones emitidas (`approved`) | Eventos exitosos `DOCUMENTO_APROBADO` del actor. Cuenta su aprobación individual; no promete que haya concluido el consenso de todos los revisores. |
| Rechazos emitidos (`rejected`) | Eventos exitosos `DOCUMENTO_RECHAZADO` del actor. |
| Devoluciones emitidas (`returned`) | Eventos exitosos `REVISION_DEVUELTA` del actor, separados del rechazo. |
| Decisiones por acción, área, tipo y autor documental | Agrupaciones del mismo conjunto de eventos; no documentos únicos ni solicitudes recibidas. Área/tipo/autor documental corresponden a los metadatos disponibles del documento. |
| Actividad semanal | Conteo por fecha de evento, en siete días hasta «Hasta» o hasta hoy si no se elige fecha final, aplicando los filtros del reporte. |

Fechas «Desde/Hasta» filtran eventos, no `solicitada_en`. `activity_at` contiene el instante y `activity_date` el día en la zona horaria del backend (`America/Bogota` en la prueba), informada como `activity_timezone` y mostrada junto a la gráfica. `created_at` se conserva como alias del instante de actividad; la gráfica usa exclusivamente `activity_date`. Las exportaciones identifican acción, revisor que actuó y fecha de actividad.

Se excluyen solicitudes recibidas, cierres automáticos de solicitudes ajenas, eventos fallidos, eventos de otro usuario/organización, recursos que no representan una versión y decisiones fuera del rango. No se miden tiempo trabajado, comentarios, descargas, logins ni vencimientos. Se sustituye la tarjeta de vencimientos por devoluciones; no se publica un cero ficticio de vencimiento dentro de un reporte de acciones.

## Contrato de origen corregido

MCP Neon confirmó que existe `VERSION` y no `ARCHIVO` en el catálogo de recursos. El evento emitido por `ReviewDecisionView` usaba `ARCHIVO`, impidiendo su inserción. Se cambia exclusivamente el recurso de ese evento a `VERSION`; no se modifican decisiones, consenso, estados ni notificaciones del workflow. Se conserva la política existente de auditoría de mejor esfuerzo y fallos observables.

El reporte mide **actividad registrada**. Los eventos históricos inexistentes o fallidos no se reconstruyen a partir del estado actual. `resuelta_en` no se usa como sustituto: el cierre en cascada también la llena en solicitudes cuyos revisores no actuaron. Antes de la prueba no había eventos de los tres códigos en Neon; no se afirma cobertura histórica completa.

## Prueba con datos conocidos

`docs/verificar_actividad_61.py`, backend local contra Neon y usuario existente `prueba.revisor@test.local`, con fixtures transaccionales y rollback:

- Aprobación el 3/9 y aprobación + rechazo el 8/9; devolución el 9/9: **GET HTTP 200, total 4, aprobaciones 2, rechazos 1, devoluciones 1**.
- Un evento de solicitud, aprobación fallida, aprobación de otro actor, recurso documental incorrecto y aprobación fuera del rango no incrementan el resultado.
- Solicitud recibida y cierre automático fechado no aumentan la actividad.
- Filtro por rechazo devuelve una fila; filtro del 8/9 devuelve dos.
- Aprobación real por el endpoint: **HTTP 200**, exactamente un nuevo evento del actor visible en el reporte. Segundo intento: **HTTP 409**, sin nueva actividad. Notificaciones suprimidas exclusivamente durante la prueba para no enviar correos.
- Trece comprobaciones aprobadas. Todos los eventos, solicitudes y modificaciones del ensayo se revierten; MCP confirmó cero eventos del marcador `852d9354-3d24-4ff8-9db1-8bc5d75f686d` después del rollback.

UI real en Vite con respuestas controladas derivadas del ensayo Neon: indicadores **4 / 2 / 1 / 1**, gráfica **1 / 0 / 0 / 0 / 0 / 2 / 1** del 3 al 9 de septiembre. Se alteró intencionalmente el alias `created_at` para comprobar que la gráfica usa `activity_date`. Sin errores JavaScript. Evidencia: `docs/actividad_61_ui.png`; script: `docs/verificar_actividad_ui_61.cjs`.

Quince regresiones de reportes y doce de workflow aprobadas, build frontend y comprobación Django correctos, `git diff --check` sin errores. Resultado técnico: `docs/resultado_actividad_61.json`.

Cambios locales pendientes de commit y despliegue en Render. Se conserva el resto del trabajo previo y los otros scopes de reportes. Los snapshots antiguos conservan su contenido original.
