# Auditoría 04 — Revisión y aprobación

Fecha: 2026-09-06, America/Guatemala. Referencia principal: `AUDITORIA_MAPA_SISTEMA.md`; se consultó `AUDITORIA_03_VERSIONES.md` únicamente para la nueva versión de corrección y la conservación de datos aprobados. No se volvió a mapear el repositorio ni se auditaron otros módulos.

**Resultado:** hay controles reales en backend para enviar, aprobar, rechazar y devolver, pero el recorrido completo tiene errores. El Revisor puede previsualizar un archivo distinto del que decide; el Editor no muestra las observaciones que devuelve la API; devolver y reenviar la misma versión al mismo revisor falla contra la unicidad de Neon. Las decisiones no bloquean las filas, por lo que las transiciones verificadas secuencialmente no quedan protegidas frente a concurrencia. Aprobar cambia estado, pero no garantiza vigencia.

## Alcance de la comprobación

Lectura selectiva de `documentos/workflow_views.py`, serializadores y modelos de revisión, funciones de notificación de decisiones, pantallas de bandeja/revisión y envío/corrección del Editor. Los handlers de edición/carga se siguieron solo para comprobar restricciones sobre documentos en revisión, rechazados o aprobados.

Se hicieron SELECT mediante MCP Neon en el proyecto `sistema-documental` (`red-sunset-06347686`), rama `main` (`br-frosty-dream-aub7kye4`), esquema `gestion_documental`. Se contrastaron solicitudes, estados, historial, comentarios, notificaciones, permisos y restricciones. No se modificó código, registros, permisos ni archivos.

No se ejecutaron decisiones o envíos HTTP autenticados, ni pruebas concurrentes: no se dispone de contraseñas de ensayo. Tampoco se comprobó identidad entre el commit local y el despliegue. Las respuestas HTTP descritas a continuación son **resultados previstos por el código**, no respuestas observadas en esta auditoría. La evidencia histórica en DB no equivale a haber reproducido ambos casos.

Estados: **✅ IMPLEMENTADO** = mecanismo completo del control concreto encontrado; se indica su evidencia y límite de ejecución. **PARCIAL** = recorrido incompleto. **❌ NO IMPLEMENTADO** = soporte ausente. **CON ERROR** = defecto de código/contrato/datos identificado. **⚪ NO COMPROBABLE** = falta evidencia de ejecución.

## Requisitos

| # | Función | Estado | Evidencia | Problema | Qué falta |
|---|---|---|---|---|---|
| 1 | Enviar documento a revisión | PARCIAL | `EditorDocumentEditView.jsx:164` → POST `documents/<doc>/versions/<version>/submit-review/` → `ReviewSubmitView:318` → `transition_version` y solicitudes/detalles/checklist. Neon conserva BORRADOR → EN_REVISION. | Envío de BORRADOR existente está conectado, pero creación/nueva versión del Editor exige permiso incorrecto, bloqueando inicio/corrección. No exige versión vigente ni bloquea fila para envío. | Corregir prerrequisito de carga, definir envío de versiones anteriores y serializar transición. |
| 2 | Consultar pendientes | PARCIAL | `ReviewerReviewInboxView.jsx:44` → GET `reviews/inbox/?limit=100`; backend exige `revisiones.consultar`, organización y revisor asignado, permite `status=PENDIENTE`. | UI carga solo primeras 100, filtra localmente y no continúa `next_offset`; contador «en revisión» compara estado de solicitud con código inexistente EN_REVISION. | Paginación/filtro backend coherentes y separación estado de solicitud/versión. |
| 3 | Revisar documento | CON ERROR | Bandeja pasa reviewId; `ReviewerDocumentReviewView.jsx:47` consulta solicitud y documento; preview `:62` y `:127` usa `files.find(is_current)`. | No selecciona `review.document.version_id`. Si existe otro archivo vigente, se observa ese archivo y se decide la versión antigua de la solicitud. | Fijar preview/descarga/metadatos a la versión asignada; no a vigente global. |
| 4 | Aprobar | CON ERROR | `decide('approve')` → POST `reviews/<id>/approve/` → `ReviewDecisionView:520`, permiso, asignación, PENDIENTE y checklist; última pendiente cambia versión a APROBADO. Neon tiene una solicitud APROBADA. | Falta bloqueo ante decisiones concurrentes. El estado del documento puede seguir EN_REVISION si faltan otros revisores. No asegura versión vigente. | Bloquear/releer versión y solicitudes; diferenciar aprobación individual/total y validar vigencia esperada. |
| 5 | Rechazar | PARCIAL | Formulario `ReviewerDocumentReviewView.jsx:105,152`; POST `reject/`; `require_review_observation:311`; guarda comentario, RECHAZADA y versión RECHAZADO, cierra otras pendientes. | Backend y formulario existen, pero recepción del motivo en Editor no está conectada; concurrencia puede sobrescribir decisión. No hay rechazo real en muestra Neon. | Renderizar observación al Editor, proteger concurrencia y ejecutar caso de ensayo. |
| 6 | Enviar rechazado para corrección | CON ERROR | Rechazo genera aviso al solicitante; corrección por nueva versión BORRADOR + nuevo envío. Alternativa `return/` devuelve misma versión a BORRADOR y solicitud CANCELADA. | Editor oculta observaciones; nueva versión está bloqueada por permiso genérico. Reenvío de devolución al mismo revisor choca con UNIQUE versión/revisor. | Completar UI de corrección, alinear permisos y modelar rondas de revisión. |
| 7 | Consultar estado | CON ERROR | `serialize_review:149` entrega estado de solicitud; documento entrega estado de vigente; `EditorDocumentEditView` recarga documento al enviar. | UI mezcla PENDIENTE/APROBADA con EN_REVISION/APROBADO. Tras decidir conserva `document`/`files` anteriores (`ReviewerDocumentReviewView.jsx:96`). Aprobar una solicitud puede anunciar éxito mientras versión sigue EN_REVISION. | Exponer ambos estados e ID de versión y refrescarlos después de cada decisión. |

## Máquina de estados realmente implementada

`VERSION_TRANSITIONS`, en `documentos/workflow_views.py:43`, y `transition_version:218` controlan el estado de **la versión**, no una columna independiente de estado de Documento.

| Estado de versión | Transiciones permitidas en el helper |
|---|---|
| BORRADOR | EN_REVISION |
| EN_REVISION | APROBADO, BORRADOR, RECHAZADO |
| APROBADO | PUBLICADO; se cita solo como salida definida, sin auditar publicación |
| RECHAZADO | Ninguna |
| PUBLICADO / ARCHIVADO | Ninguna en este helper |

Estados de **solicitud de revisión** en Neon: PENDIENTE, APROBADA, RECHAZADA, CANCELADA. No existe EN_REVISION como estado de solicitud. Abrir la revisión no cambia ningún estado: el archivo sigue EN_REVISION y la solicitud sigue PENDIENTE.

Rechazar y devolver no son equivalentes:

| Acción | Estado solicitud que decide | Estado versión | Otras solicitudes pendientes de esa versión |
|---|---|---|---|
| Aprobar | APROBADA | EN_REVISION mientras quede alguna pendiente; APROBADO al resolver la última | Permanecen pendientes |
| Rechazar definitivamente | RECHAZADA | RECHAZADO | Pasan a RECHAZADA, comentario genérico de cierre |
| Devolver con observaciones | CANCELADA | BORRADOR | Pasan a CANCELADA, comentario genérico de cierre |

La observación de rechazo/devolución es obligatoria en backend y se guarda tanto en `comentario_resolucion` como en `revision_comentarios` de tipo OBSERVACION. El rechazo deja la versión terminal; la corrección requiere otra versión. La devolución permite intentar reutilizar la versión, pero tiene el defecto de rondas descrito más abajo.

## Flujo inicial reconstruido

### Límite real con la configuración revisada

El Editor tiene `documentos.crear`, `documentos.modificar`, `versiones.crear` y `revisiones.enviar`. Los endpoints de creación/carga exigen `documentos.gestionar`, ausente del catálogo, como ya se comprobó en `AUDITORIA_03_VERSIONES.md`. Por tanto, **el flujo «Editor crea documento con archivo → BORRADOR» no puede darse por funcional con ese código y esos permisos**. Un borrador ya existente y accesible sí puede enviarse con `revisiones.enviar`. Se describe el resto suponiendo archivo y autorización de carga disponibles, sin ocultar ese bloqueo.

### Comportamiento del envío

1. El archivo inicial crea versión 1.0 en BORRADOR. Sin archivo no hay versión que enviar.
2. La pantalla selecciona el archivo `is_current`, revisores, fecha límite, prioridad, instrucciones y checklist; hace POST `submit-review/`.
3. Backend exige `revisiones.enviar`, acceso al documento y versión perteneciente a él. Solo admite estado BORRADOR. Valida revisor activo, de la misma organización y con rol REVISOR/ADMINISTRADOR; valida acceso según sus helpers, duplicados y fecha futura.
4. Si ya tiene revisión pendiente devuelve 409 cuando alcanza esa comprobación; si ya está EN_REVISION, la comprobación previa de BORRADOR devuelve 400 VERSION_NOT_EDITABLE.
5. En transacción cambia BORRADOR → EN_REVISION, inserta historial y una solicitud PENDIENTE por revisor, detalle y checklist. Fecha límite por defecto: tres días.
6. Después de la transacción registra eventos e intenta crear notificaciones de asignación. Respuesta prevista: 201 con solicitudes.

No se comprueba `es_vigente`: una petición manual puede enviar otra versión antigua que siga BORRADOR. Tampoco se impide asignarse a uno mismo si el solicitante también tiene rol REVISOR/ADMINISTRADOR. No se interpreta ese supuesto multirrol como permiso de aprobación para un Editor sin dicho permiso.

## CASO 1 — Rechazar, corregir y aprobar nuevamente

Supuestos: una revisión inicialmente pendiente, operaciones secuenciales y actor con permisos requeridos; si hay varios revisores, aprobación final requiere que no quede ninguno pendiente.

| Paso | Acción | Resultado del backend | Integración/limitación |
|---|---|---|---|
| 1 | Editor envía 1.0 BORRADOR | 1.0 EN_REVISION; solicitud R1 PENDIENTE | Envío conectado para borrador existente. |
| 2 | Revisor abre R1 | GET revisión con acceso por asignación; no cambia estados | Preview puede mostrar otra versión vigente. |
| 3 | Revisor pulsa rechazar y escribe motivo | POST `reviews/R1/reject/`, `{comment: motivo}` | Formulario exige motivo; backend también. |
| 4 | Backend rechaza | R1 RECHAZADA; 1.0 RECHAZADO; guarda observación/fecha/historial | Otras pendientes se cierran como RECHAZADA; filas anteriores se conservan. |
| 5 | Editor recibe observación | API `documents/<id>/reviews/` devuelve sus solicitudes, `resolution_comment` y `comments`; notificación dirigida al solicitante | **UI no presenta esos comentarios**. Aviso de decisión es genérico y no incorpora motivo. Campana Editor no consulta avisos ni tiene acción. |
| 6 | Editor corrige con nuevo archivo | POST `versions/` crearía 1.1 BORRADOR y vigente, manteniendo 1.0 RECHAZADO | **Bloqueado para Editor actual por permiso genérico**. Guardar solo texto no crea versión ni vuelve 1.0 a BORRADOR. |
| 7 | Editor envía 1.1 | Crea solicitud R2 PENDIENTE; 1.1 EN_REVISION | UUID de nueva versión permite reutilizar mismo revisor sin chocar con UNIQUE de R1. |
| 8 | Revisor abre R2 y aprueba | Requiere permiso, asignación, PENDIENTE y checklist completo | Debe visualizar archivo de R2, lo que UI actual no garantiza si hay otra carga. |
| 9 | Resultado final | R2 APROBADA; 1.1 APROBADO si ya no quedan pendientes | Conserva vigencia que tenía; no la impone. 1.0/R1 permanecen rechazados. |

No existe una transición RECHAZADO → BORRADOR ni RECHAZADO → APROBADO en `transition_version`. La nueva versión es la vía correcta para el rechazo definitivo. No se crea un vínculo explícito de ronda «corrige R1» en R2; ambas se relacionan por documento/versiones y sus comentarios deben consultarse.

### Alternativa «Devolver con observaciones»

POST `return/` lleva EN_REVISION → BORRADOR y R1 → CANCELADA. Si se intenta enviar **esa misma versión al mismo revisor**, `ReviewSubmitView` solo comprueba que no haya pendientes y luego hace INSERT nuevo. Neon impone UNIQUE `(version_documento_id,revisor_id)` sin distinguir estado/ronda, por lo que choca con R1 CANCELADA. El handler no captura IntegrityError: fallo previsto 500, con rollback del nuevo envío y versión permaneciendo BORRADOR.

Enviar nueva versión evita esa colisión. Enviar misma versión a otro revisor sin fila anterior también puede pasar, por lo que el comportamiento depende de la asignación histórica. No es una solución completa para rondas de corrección. La misma restricción puede fallar al reasignar a un revisor que ya tenga solicitud para esa versión.

## CASO 2 — Aprobar y versión aprobada/vigente

Con una sola solicitud PENDIENTE de la versión 1.0 EN_REVISION:

1. Revisor asignado pulsa aprobar; POST `reviews/<id>/approve/` exige `revisiones.aprobar`. Lector y Editor actuales no lo tienen.
2. Backend verifica que la solicitud siga PENDIENTE. Cambia solicitud a APROBADA, guarda fecha y comentario opcional. Si checklist tiene ítems sin completar, lanza 400 CHECKLIST_INCOMPLETE y la transacción revierte esos cambios.
3. Si no quedan solicitudes PENDIENTE para la versión, llama `transition_version(...,'APROBADO')`; de otra manera la versión continúa EN_REVISION.
4. Se solicita evento/notificación y devuelve la solicitud. **No actualiza `es_vigente` ni desmarca otras versiones**.

Si 1.0 era vigente y no hubo carga intermedia, sigue vigente y queda APROBADO. Pero si durante su revisión se cargó 1.1 (BORRADOR y vigente), aprobar la solicitud de 1.0 deja:

| Versión | Estado | Vigente |
|---|---|---|
| 1.0, objeto de la revisión | APROBADO | false |
| 1.1, carga posterior | BORRADOR | true |

El backend no prohíbe enviar/aprobar una versión no vigente, y POST nueva versión no bloquea por EN_REVISION. Por tanto, **APROBADO no implica vigente**. No se publica automáticamente. Este caso además demuestra el fallo de preview: la pantalla puede enseñar 1.1 mientras el botón aprueba 1.0.

## Transiciones inválidas y controles de backend

Se distingue rechazo secuencial por código de protección completa ante carreras. No se hicieron peticiones autenticadas para explotar los casos.

| # | Función | Estado | Evidencia | Problema | Qué falta |
|---|---|---|---|---|---|
| 8 | Impedir BORRADOR → APROBADO directo | ✅ IMPLEMENTADO | `VERSION_TRANSITIONS:43`; `transition_version:220` solo admite EN_REVISION → APROBADO. Decisión trabaja sobre solicitud existente. | Control secuencial presente; con varias solicitudes puede aprobar individualmente sin transición hasta la última, lo que exige distinguir ambos estados. | Prueba negativa con solicitud controlada; mantener validación transaccional del estado real. |
| 9 | Impedir Lector → Aprobar | ✅ IMPLEMENTADO | `ReviewApproveView.permission=REVIEW_APPROVE:580`; `require_permission` antes de actuar; catálogo de rol LECTOR sin aprobación. | Sin evidencia de bypass secuencial para ese rol. No probado con sesión real. | Prueba HTTP con Lector y solicitud real; esperado 403. |
| 10 | Impedir Editor → Aprobar sin permiso | ✅ IMPLEMENTADO | Mismo control; Neon Editor solo tiene `revisiones.enviar` entre permisos de revisión. | Solicitar o crear documento no concede aprobación. | Prueba HTTP de Editor; esperado 403. |
| 11 | Impedir decidir revisión ajena | ✅ IMPLEMENTADO | `get_review_or_404:191` filtra organización/participantes; `ReviewDecisionView:523` exige revisor asignado, salvo Administrador. | Administrador es excepción explícita. Participante solicitante sin asignación tampoco puede decidir por tener solo acceso al detalle. | Pruebas de ID manual y límites multirrol. |
| 12 | Impedir Revisor modificar archivo | ✅ IMPLEMENTADO | Carga/PATCH exige `documentos.gestionar`; Revisor Neon tiene permisos de revisión, no gestión/carga. No hay edición de archivo en handlers de decisión. | Se cumple con roles actuales; si se concede permiso de escritura o rol Administrador, no hay separación adicional por ser revisor asignado. | Mantener mínimo privilegio y definir incompatibilidad revisión/edición si se exige para multirrol. |
| 13 | Impedir APROBADO → modificación silenciosa | PARCIAL | `ensure_document_directly_editable`, `document_views.py:155`, rechaza PATCH cuando vigente está APROBADO/EN_REVISION/PUBLICADO. Archivo nuevo crea otra versión. | Tras crear nuevo BORRADOR vigente, PATCH de título/metadatos comunes vuelve a permitirse; no hay snapshot de esos datos del aprobado. No se sobrescribe el archivo aprobado, pero sí su contexto mostrado. | Congelar/snapshot de datos por versión y bloqueo transaccional frente a aprobación simultánea. |
| 14 | Impedir RECHAZADO → APROBADO sin nueva revisión | CON ERROR | Secuencialmente R resuelta da 409 y helper no permite salida de RECHAZADO. `ReviewDecisionView:522,528,536` lee estado sin bloqueo antes de transacción. | Dos decisiones simultáneas pueden usar PENDIENTE/EN_REVISION obsoletos y sobrescribir rechazo con aprobación (R3). | Bloquear/releer solicitud y versión dentro de transacción; validación de transición sobre estado persistido. |
| 15 | Exigir observación al rechazar/devolver | ✅ IMPLEMENTADO | `ReviewDecisionSerializer`, `require_review_observation:311`, `add_resolution_comment:541`; formulario rechazo valida texto. | Guardar observación separada limpia el textarea; devolver usa textarea actual, no comentario ya guardado. Si queda vacío, backend rechaza. | UX de devolución con motivo dedicado; no eliminar validación backend. |
| 16 | Impedir aprobación con checklist incompleto | ✅ IMPLEMENTADO | `ReviewDecisionView:548` lanza ValidationError dentro de transacción; checklist solo revisor asignado y pendiente (`ensure_checklist_editable`). | Sin checklist, aprobación permitida. Comentarios no resueltos no bloquean aprobación; son reglas distintas. | Definir si observaciones abiertas también deben bloquear y probar checklist. |
| 17 | Impedir doble resolución/carreras | CON ERROR | No hay `select_for_update` en envío/decisión; UPDATE no condiciona estado anterior. `transaction.atomic` solo agrupa escrituras. | Lecturas obsoletas permiten decisiones contradictorias; dos aprobadores pueden dejar versión EN_REVISION sin pendientes. | Serializar por versión, releer solicitudes y recalcular consenso. |
| 18 | Impedir reenviar versión rechazada sin corrección | ✅ IMPLEMENTADO | `ReviewSubmitView:327` solo permite BORRADOR; RECHAZADO terminal. | Editar solo datos generales deja RECHAZADO y no permite reenvío. Corrección real requiere nueva versión. | Explicar requisito en UI y completar autorización de nueva versión. |
| 19 | Reenviar devolución al mismo revisor | CON ERROR | UNIQUE Neon `(version_documento_id,revisor_id)`; envío crea fila nueva y no modela ronda. | CANCELADA histórica bloquea nueva solicitud; fallo previsto 500, no mensaje de regla. | Rondas de revisión o nueva versión obligatoria, con manejo de conflicto. |
| 20 | Garantizar revisión del archivo asignado | CON ERROR | Solicitud liga `version_documento_id`; frontend usa `is_current` en lugar de ese ID. | Puede aprobar archivo antiguo mirando nuevo; backend registra correctamente el ID antiguo, no detecta qué vio la persona. | Preview enlazado al ID de la solicitud; prueba con dos versiones. |
| 21 | Garantizar aprobado y vigente | PARCIAL | Decisión cambia solo `estado_version`; carga puede cambiar flags independientemente. | Aprobación no asegura vigencia y acepta versiones anteriores. | Definir política de vigente y validarla al aprobar. |
| 22 | Editor recibe y consulta motivo de rechazo | CON ERROR | API devuelve `resolution_comment/comments`; Editor carga `documentReviews` pero renderiza placeholders `EditorDocumentEditView.jsx:228–229`. | «Observaciones» dice sin datos y «Comentarios del revisor» dice no hay comentarios. Campana inerte. Aviso backend no incluye motivo. | Renderizar comentarios de la solicitud rechazada y navegación desde notificación. |
| 23 | Reproducir casos completos con usuarios reales | ⚪ NO COMPROBABLE | Solo lectura de código y Neon; histórico tiene una aprobación, sin rechazo/devolución. | Sin contraseñas de ensayo; no se simularon decisiones ni modificó DB. | Pruebas autenticadas de ambos casos y negativas tras preparar entorno de ensayo. |

## Hallazgos prioritarios

**R1 — Alta: se revisa un archivo y se decide otro.** `ReviewerDocumentReviewView` conserva `review.document.version_id` pero lo ignora al seleccionar preview. Caso reproducible por diseño: enviar 1.0, cargar 1.1 antes de resolver, abrir revisión 1.0; UI encuentra vigente 1.1, POST approve actúa sobre solicitud de 1.0. El backend no impide que convivan ambas. La pantalla debe anclarse a la versión revisada y no reconstruir su contenido desde vigente.

**R2 — Alta: la devolución de observaciones al Editor está incompleta.** `ReviewDocumentListView` entrega revisiones enviadas por ese Editor y el serializador incluye motivo/comentarios. La pantalla consulta esos datos solo para asignación/pendientes, pero no los muestra en el panel de comentarios. La campana de `EditorDashboard` no tiene handler ni carga `/api/notifications/`. La notificación al solicitante es genérica y la entrega por correo depende de configuración; tampoco contiene el texto de la observación. No basta que el motivo exista en DB.

**R3 — Alta: carrera rechazo/aprobación.** Dos peticiones del revisor asignado, o actores autorizados, pueden cargar la misma solicitud PENDIENTE y versión EN_REVISION antes de decidir. Una rechaza y confirma RECHAZADA/RECHAZADO. La otra conserva los objetos leídos, hace UPDATE de solicitud sin condición de estado y `transition_version` evalúa el EN_REVISION antiguo; puede escribir APROBADA/APROBADO sin nueva revisión. La transacción no revalida el estado tras esperar la escritura. Es una posibilidad deducida del código, no exploit ejecutado. Neon no mostró triggers de máquina de estados que eviten este caso.

**R4 — Alta: aprobación múltiple puede quedar incompleta.** Dos revisores distintos pueden actualizar sus solicitudes en transacciones simultáneas; cada uno ve la solicitud del otro todavía PENDIENTE y ambos omiten la transición final. Al confirmar, ambas quedan APROBADA y la versión sigue EN_REVISION. También puede emitirse evento/notificación «aprobada» por cada aprobación individual aunque falten revisores. Debe calcularse el resultado agregado bajo bloqueo compartido de la versión.

**R5 — Media: no hay rondas reutilizables en devolución.** El reenvío inserta otra solicitud, pero la unicidad de Neon conserva versión/revisor para siempre. No hay campo de ronda utilizado por el flujo. Esto contradice la posibilidad de devolver a BORRADOR y reenviar al mismo equipo. Nueva versión resuelve el conflicto de clave, pero el producto no la impone para devolución y el Editor actual no puede cargarla por la discrepancia de permiso heredada del flujo de versiones.

**R6 — Media: estados y datos de pantalla desactualizados.** Después de decidir se conserva `current.document/current.files`; la respuesta de revisión tampoco incluye estado de versión ni is_current. La bandeja usa `review.status.code === 'EN_REVISION'`, inexistente en catálogo de solicitudes. La apertura no cambia PENDIENTE a ningún estado «en curso». El filtro de pendientes del Editor tampoco incluye «Rechazado». Estos detalles dificultan reconocer correcciones y aprobación definitiva.

**R7 — Media: restricción sobre datos aprobados incompleta.** PATCH bloquea por estado vigente y es una validación de backend real. Pero el documento y metadatos son comunes a todas las versiones. Al cargar nuevo borrador, se pueden cambiar esos datos y alterar lo que se muestra asociado a versiones aprobadas sin conservar valores anteriores. Los archivos aprobados no se sustituyen silenciosamente por ese PATCH; la limitación es contexto histórico y validaciones concurrentes. Véase el alcance específico de `AUDITORIA_03_VERSIONES.md`.

**R8 — Media: notificación fuera de transacción.** Asignación/decisión se confirman antes de crear notificación. Si falla creación del aviso o lectura de su configuración, el endpoint puede devolver error aunque revisión ya quedó resuelta/enviada; reintentar decisión dará 409. Los errores SMTP se capturan, pero no toda la función de notificación. No se indujo fallo ni se afirma entrega garantizada. El aviso de rechazo se dirige al solicitante, no necesariamente al creador si son personas distintas.

**R9 — Asignación no equivale siempre a acceso al archivo.** `reviewer_has_document_access` admite a quien pasa `has_area_permission` sin exigir ahí permiso de consulta específico; `get_review_or_404` autoriza por asignación/participación, mientras la pantalla necesita además GET documento y preview con sus controles propios. Puede asignarse un revisor al que una ACL documental impida cargar el documento. Este chequeo debe usar el mismo criterio de acceso de lectura efectivo; no se configuraron ACL para reproducirlo.

## Evidencia de base de datos

Estados de revisión y versión existen con los códigos mencionados. Permisos relevantes de Neon:

| Rol | Permisos de revisión |
|---|---|
| ADMINISTRADOR | enviar, consultar, aprobar, rechazar |
| EDITOR | enviar |
| REVISOR | consultar, aprobar, rechazar |
| LECTOR | Ninguno |

Una solicitud observada: `685b0889-fd26-4df0-b0e1-0a516106aa4b`, PRUEBA-001 versión 2.0, APROBADA, con motivo de resolución y fecha. La versión está actualmente PUBLICADO y vigente. Se cita ese estado final solo como contexto de la fila, sin auditar publicación.

Historial de esa versión, fechas UTC:

| Fecha | Transición registrada |
|---|---|
| 2026-08-27 06:51:54.668 | Creación BORRADOR |
| 2026-08-27 06:53:04.697 | BORRADOR → EN_REVISION |
| 2026-08-27 06:57:32.221 | EN_REVISION → APROBADO |

Hay tres comentarios OBSERVACION y uno RESOLUCION. Avisos de revisión: una asignación, dos comentarios y una aprobación; ninguno tiene fecha de correo enviado. No hay solicitudes PENDIENTE, RECHAZADA ni CANCELADA en la muestra. No se observaron pendientes con versión fuera de EN_REVISION ni versiones actualmente APROBADO/no vigente; con una única revisión histórica, esos ceros no validan concurrencia o corrección.

Restricciones comprobadas en `solicitudes_revision`: FK a versión/revisor/solicitante/estado, campos obligatorios, resolución no anterior a solicitud y UNIQUE `(version_documento_id,revisor_id)`. No hay trigger de usuario en solicitudes/versiones que implemente transiciones de estado o resuelva consenso. Una consulta inicial al nombre supuesto de tabla de comentarios falló; se corrigió usando el modelo real `gestion_documental.revision_comentarios`. Ese error de consulta no se considera defecto de la aplicación.

## Pruebas pendientes para cerrar la comprobación

En entorno de ensayo, con credenciales por rol: recorrer rechazo con observación → nueva versión → nuevo envío → aprobación; recorrer aprobación directa desde EN_REVISION; comprobar todas las denegaciones con HTTP y persistencia. Incluir reenvío tras devolución al mismo revisor, dos decisiones simultáneas, dos aprobadores simultáneos, revisión de 1.0 con 1.1 vigente y corrección del contexto de versión aprobada. La presente auditoría deja estos casos como reconstrucción/evidencia estática cuando no hay ejecución real y no cambió el sistema.
