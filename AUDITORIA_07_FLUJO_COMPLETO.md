# Auditoría 07: recorrido completo

Fecha: 7 de septiembre de 2026.

**El recorrido no puede darse por realizable de principio a fin. El primer incumplimiento funcional está en el paso 2, «Crea Editor», si se utiliza la interfaz auditada: el formulario asigna el primer rol del catálogo, que es Administrador, en lugar de permitir elegir Editor.** No significa que el alta necesariamente devuelva un error HTTP; significa que no produce el perfil solicitado.

Si se parte de cuentas correctamente configuradas y con el cambio inicial de contraseña resuelto, el primer bloqueo documental está en el **paso 7, «Editor crea documento»**: falta el alta en su panel y el backend exige un permiso que no existe en el catálogo auditado. Los problemas de publicación, restauración, reportes y respaldos son bloqueos adicionales, no el primero.

## Fuentes y criterio

Se utilizaron primero los informes existentes, sin volver a revisar el proyecto desde cero:

- **A01:** [Acceso y usuarios](AUDITORIA_01_ACCESO_USUARIOS.md).
- **A02:** [Documentos](AUDITORIA_02_DOCUMENTOS.md).
- **A03:** [Versiones](AUDITORIA_03_VERSIONES.md).
- **A04:** [Revisión](AUDITORIA_04_REVISION.md).
- **A05:** [Bitácora](AUDITORIA_05_BITACORA.md).
- **A06:** [Reportes y respaldos](AUDITORIA_06_REPORTES_RESPALDOS.md).

Solo se confirmó en fuente lo necesario para precisar el primer fallo de alta, el cambio obligatorio de contraseña y la diferencia entre aprobación y publicación: creación en `UsersView.jsx`/`management_views.py`, controles en `permissions.py`/`Login.jsx`, permiso documental y publicación/lectura en `workflow_views.py`/`reader_access.py`. No se repitieron pruebas HTTP ni consultas de BD; no se crearon cuentas, documentos, versiones, reportes o respaldos ni se ejecutó una restauración. No se arregló nada.

Las limitaciones antiguas de A01–A04 sobre falta de contraseñas no se extrapolan a todo el análisis: A05–A06 sí comprobaron autenticación con las cuentas de prueba. Eso verifica el login de cuentas existentes, pero no el alta y primer ingreso de cuentas nuevas. Tampoco convierte las pruebas de lectura en pruebas de carga, revisión o restauración.

Se conserva la numeración exacta de las **35 acciones** solicitadas. Después del primer bloqueo, cada fila evalúa la capacidad del paso **suponiendo disponibles sus prerrequisitos**; no afirma que el recorrido haya llegado hasta allí. Para 1.0 → 1.1 → 1.2 → 1.3 se requiere una nueva carga por incremento, `version_type=minor`, un solo documento y operaciones secuenciales. Se indica expresamente dónde modificar solo texto no cumple esa condición.

Estados empleados:

- **✅ FUNCIONA:** operación concreta respaldada por ejecución previa; no certifica el recorrido completo ni toda la UI.
- **PARCIAL:** existe parte del flujo, con limitaciones funcionales relevantes.
- **❌ NO EXISTE:** reservado para ausencia de la función; no se usa para negar un backend que sí existe aunque falte su botón.
- **FALLARÍA:** hay un defecto o prerrequisito ausente que impide obtener el resultado solicitado; la evidencia distingue fallo observado de inferencia.
- **⚪ NECESITA PRUEBA EN EJECUCIÓN:** mecanismo localizado, sin prueba suficiente de ese caso concreto.

## Evaluación paso a paso

| Paso | Acción | Resultado | Evidencia | Posible fallo |
|---|---|---|---|---|
| 1 | Administrador inicia sesión | ✅ FUNCIONA | A05: login de `prueba.admin` y evento 207 `SESION_INICIADA`; A06 volvió a consultar endpoints autenticados. | Comprobado con cuenta existente, activa y sin cambio de contraseña pendiente. No es una prueba de alta de un nuevo administrador. |
| 2 | Crea Editor | FALLARÍA | A01, requisito 6 y S1. Confirmación puntual: `frontend/src/UsersView.jsx:102` envía `role_ids: roles[0] ? [roles[0].id] : []`; A01 documenta catálogo ordenado por código con ADMINISTRADOR primero. | **Primer incumplimiento:** el alta puede crear un usuario con rol Administrador, no Editor. Si no se cargan roles, envía lista vacía. No se ejecutó el alta para reproducirlo. |
| 3 | Crea Revisor | FALLARÍA | A01, requisitos 6 y 11; mismo formulario y asignación automática que el paso 2. | No permite elegir Revisor. Usar API con `role_ids` explícitos sería una ruta distinta de la interfaz auditada, no evidencia de que este paso funcione en UI. |
| 4 | Crea Lector | FALLARÍA | A01, requisitos 6 y 11; misma ruta de alta. | No permite elegir Lector. Una cuenta con rol Administrador no sirve para probar restricciones del lector. |
| 5 | Asigna roles/permisos | PARCIAL | A01, requisitos 11, 12 y 16: PUT de roles de usuario existe; matriz de permisos por rol conectada en RolesView. | Falta UI para reasignar roles a usuarios. Los permisos individuales se heredan del rol. Conceder permisos documentales existentes de crear/modificar no satisface `documentos.gestionar`. La ACL específica de documentos, si se pretende usar después, tiene incompatibilidad de columnas según A02 D2. |
| 6 | Editor inicia sesión | PARCIAL | A06 usó `prueba.editor` autenticado. Confirmación de alta nueva: `management_views.py:385` fija `debe_cambiar_contrasena=True`; `Login.jsx:273,354` exige resolverla antes del panel. | El usuario creado en este recorrido debe cambiar su contraseña temporal, paso omitido. Sin hacerlo, los endpoints protegidos devuelven `PASSWORD_CHANGE_REQUIRED`. Además, el alta defectuosa puede llevarlo al panel Administrador. |
| 7 | Crea documento | FALLARÍA | A02, requisito 1 y D1: panel Editor sin formulario de alta y POST documental exige `WRITE_PERMISSION='documentos.gestionar'`, ausente del catálogo auditado. | **Primer bloqueo documental con un Editor real:** 403 previsto por permisos; si acaba de crearse y no cambió contraseña, ese control lo detiene antes. No se reprodujo el POST autenticado. El bypass de un Administrador mal asignado no valida al Editor. |
| 8 | Carga archivo | FALLARÍA | A02, requisito 2; A03 V5: carga de archivo/nueva versión usa el mismo permiso genérico. | Editor correctamente limitado no llega a guardar el archivo con el catálogo auditado. Aun con autorización, integridad y disponibilidad del storage documental requieren prueba. |
| 9 | Se crea versión 1.0 | ⚪ NECESITA PRUEBA EN EJECUCIÓN | A03, requisito 2 y caso A: primera carga calcula `(1,0)`; Neon contiene versiones 1.0 históricas. | Solo ocurre si el paso 8 persiste archivo y fila. Crear documento sin adjunto no crea versión. No se comprobó esta alta con el documento del recorrido. |
| 10 | Modifica | FALLARÍA | A02, requisito 6/D1; A03 V1: guardar datos hace PATCH documental y requiere permiso genérico. | Editor no tiene el permiso exigido. Incluso superado ese bloqueo, modificar título/descripción/metadatos no implica cargar otro archivo ni versionar. |
| 11 | Se crea 1.1 | FALLARÍA | A03, caso B y V1: guardar cambios sin archivo conserva 1.0. Caso A: nueva carga menor sí produciría 1.1. | La secuencia «modifica → 1.1» no es automática. Si se entiende modificación como carga explícita de un nuevo archivo, depende del paso 8 y necesita prueba; con `major` produciría 2.0. |
| 12 | Consulta historial | PARCIAL | A03, requisito 5/V2: endpoints de versiones y timeline existen; las vistas generales de Editor/Administrador piden `limit=1` y eligen el primer documento. A05 comprobó un timeline por ID con cuatro eventos. | Puede mostrar historial de otro documento. Datos históricos de estado/autor se reconstruyen parcialmente con valores actuales. Que el documento coincida por casualidad no prueba selección correcta. |
| 13 | Envía a revisión | ⚪ NECESITA PRUEBA EN EJECUCIÓN | A04, requisito 1 y flujo de envío: `submit-review/` transforma BORRADOR en EN_REVISION y crea solicitud PENDIENTE; hay evidencia histórica de esa transición. | Requiere versión 1.1 existente, BORRADOR y acceso del revisor. El defecto de carga previo impide obtenerla en el recorrido literal. No se ejecutó este envío en los informes. |
| 14 | Revisor inicia sesión | PARCIAL | A06 autenticó `prueba.revisor`. La creación nueva fija cambio de contraseña obligatorio, igual que en el paso 6. | La cuenta nueva debe tener rol correcto y cambiar contraseña. El recorrido omite ese cambio; login de la cuenta preexistente no prueba ese primer ingreso. |
| 15 | Consulta pendientes | PARCIAL | A04, requisito 2: bandeja usa GET `reviews/inbox/`, filtra por asignación y permite estado PENDIENTE. | Solo carga primeras 100 y filtra localmente; contador compara solicitud con EN_REVISION, que es estado de versión. No se verificó la nueva solicitud del paso 13 en la bandeja. |
| 16 | Abre documento | PARCIAL | A04, requisito 3/R1: abre solicitud y documento, pero preview selecciona `files.find(is_current)` en lugar del ID de versión revisada. | Si hubo otra carga puede ver un archivo distinto del que rechazará/aprobará. En la secuencia estricta sin cargas intermedias podrían coincidir, pero bytes/acceso siguen sin prueba. Una ACL puede permitir asignación y bloquear apertura del documento. |
| 17 | Rechaza con motivo | ⚪ NECESITA PRUEBA EN EJECUCIÓN | A04, requisito 5 y caso 1: formulario y backend exigen motivo, guardan solicitud RECHAZADA y versión RECHAZADO. | No hay rechazo ejecutado en los informes. Requiere solicitud pendiente y permiso; decisiones concurrentes pueden sobrescribirse. En el caso secuencial propuesto existe la operación. |
| 18 | Editor visualiza rechazo | PARCIAL | A04, requisito 22/R2/R6: API entrega estado y `resolution_comment/comments`, pero UI del Editor conserva placeholders; notificación genérica. | Puede reflejarse el estado al recargar, pero **el motivo necesario para corregir no se presenta en los paneles previstos**. Campana sin consulta/acción y filtro de pendientes no resuelven esa carencia. No se equipara ausencia de motivo con ausencia total del estado. |
| 19 | Corrige | FALLARÍA | A04, caso 1 y requisito 18; A03 V1/V5: RECHAZADO no vuelve a BORRADOR; la vía prevista es cargar otra versión. | Editar texto deja la versión rechazada; el permiso genérico impide al Editor subir la corrección. Además, puede no conocer el motivo por el paso 18. |
| 20 | Se genera 1.2 | FALLARÍA | A03, casos A/B: segunda carga menor después de 1.1 crearía 1.2 BORRADOR y vigente; editar datos no incrementa. | No se genera automáticamente por guardar correcciones. Con carga explícita, permisos y storage disponibles sería una operación pendiente de ensayo, no un resultado comprobado. |
| 21 | Envía nuevamente | ⚪ NECESITA PRUEBA EN EJECUCIÓN | A04, caso 1: una nueva versión BORRADOR permite solicitud nueva para el mismo revisor porque cambia el UUID de versión. | Requiere 1.2 real. Reenviar 1.1 RECHAZADO falla; no confundir con «devolver», donde reutilizar la misma versión/revisor tiene conflicto de unicidad. El rechazo con nueva versión solicitado evita ese conflicto específico si se completan prerrequisitos. |
| 22 | Revisor aprueba | ⚪ NECESITA PRUEBA EN EJECUCIÓN | A04, caso 2: permiso, asignación, solicitud PENDIENTE y checklist; hay una aprobación histórica de otra versión en Neon. | Checklist incompleto bloquea. Si hay varios revisores, aprobar uno no basta. No se reprodujo aprobación de 1.2; concurrencia y preview incorrecto siguen siendo riesgos. |
| 23 | 1.2 queda vigente/aprobada | PARCIAL | A04, requisito 21/caso 2: aprobación final cambia a APROBADO, pero no asigna vigencia. A03: la carga de 1.2 ya la habría marcado vigente. | En la secuencia estricta, con un revisor, checklist completo y sin carga intermedia, **sí se espera 1.2 APROBADO y vigente**. No es garantía general ni equivale a PUBLICADO; carga intermedia puede dejar aprobada otra versión no vigente. |
| 24 | Lector inicia sesión | PARCIAL | A05 autenticó `prueba.lector`; cuenta nueva requiere cambio inicial de contraseña, confirmado en fuente. | Sin rol correcto y contraseña definitiva no continúa como lector. Si se incorporan esos prerrequisitos, el login base tiene evidencia operativa. |
| 25 | Busca documento | FALLARÍA | A02, búsqueda lectora; A03 V8; confirmación puntual `reader_access.py:90,97`: biblioteca selecciona PUBLICADO. A04: aprobar termina en APROBADO. | **No encontrará este documento nuevo por el solo hecho de aprobar 1.2: falta publicar.** La búsqueda puede funcionar y devolver vacío correctamente. En un documento con una publicación anterior podría mostrar esa anterior, no la nueva aprobada. |
| 26 | Solamente puede verlo si está autorizado | PARCIAL | A02, requisito 24/D2/D8: filtro por organización, área, permiso y publicación; ACL documental no vacía falla por columnas incompatibles. | El control de lectura existe, pero no se demostró una matriz positiva/negativa de ACL. Áreas NULL y ausencia de ACL permiten herencia global; vaciar concesiones no necesariamente deniega. Además de autorización, 1.2 requiere PUBLICADO. |
| 27 | Descarga versión vigente | FALLARÍA | A02, requisito 9; A03, requisito 17/V8: lector selecciona la última PUBLICADO, no necesariamente `es_vigente`. | En el recorrido literal, 1.2 solo está APROBADO y no es descargable por lector. Aun publicándola, la equivalencia publicada/vigente y los bytes del archivo requieren verificación; una nueva carga puede separar ambos conceptos. |
| 28 | Administrador consulta bitácora | ✅ FUNCIONA | A05: GET `/api/audit/` paginó 207 registros reales con cuenta administradora; actor/fecha presentes en la muestra. | Se necesita sesión Administrador al cambiar de actor, usando sesión separada o reingreso. La prueba acredita consulta, no que todos los eventos de este recorrido se hayan registrado. |
| 29 | Observa trazabilidad | PARCIAL | A05, requisitos 1, 5, 6, 16 y 28; A03 V7: eventos reales y timeline, pero modificaciones sin diferencias y actividad reconstruida. | No puede garantizarse cadena completa: cargas hechas por ciertas rutas no generan evento propio; helper puede perder eventos; nombres/estados históricos se resuelven desde datos actuales; falta detalle de qué cambió. |
| 30 | Se genera versión 1.3 | PARCIAL | A03, numeración/caso A/V4/V5: POST de carga menor sobre última 1.2 produciría 1.3 BORRADOR vigente y conservaría 1.2. | No se indicó actor ni carga explícita. Como Administrador, el botón de nueva versión del historial carece de handler; por API existe. Como Editor, vuelve el bloqueo de permiso. Editar metadatos no genera 1.3. |
| 31 | Administrador restaura 1.2 | PARCIAL | A03, requisito 7, flujo de restauración y V4: endpoint existente, sin acción conectada de restaurar versión en historiales. | **No hay recorrido UI completo.** Por API, con 1.3 como última, restaurar contenido de 1.2 crearía **1.4 BORRADOR y vigente**; no vuelve vigente el registro original 1.2 ni conserva automáticamente su aprobación. Depende de archivo fuente accesible. Restaurar respaldo completo es otra operación y no sustituye esta. |
| 32 | Se conserva historial | PARCIAL | A03, requisitos 4, 12, 13 y 16: restauración inserta fila/copia, no borra fuente ni posteriores; Neon conserva versiones históricas de otro documento. | Se prevé conservar 1.0–1.3 y añadir 1.4, pero no se comprobó esta secuencia ni los objetos. Título/descripción/metadatos no tienen snapshots; enlace de restauración depende del evento de auditoría. |
| 33 | Genera reporte | FALLARÍA | A06, filas 1, 2 y 8: consultas ejecutivo/editor dieron 500; generación comparte `build_report_data`. Defecto documentado: `.order_by()` sobre lista en `reports_views.py:157`. | Como Administrador se asume reporte ejecutivo. Generación no se ejecutó, pero el mismo constructor local impide completarla. Que el reporte revisor responda vacío no valida el ejecutivo ni un reporte de trazabilidad. |
| 34 | Realiza respaldo | ⚪ NECESITA PRUEBA EN EJECUCIÓN | A06, filas 12–20: proceso real local; dos copias históricas. Ambas dieron 500 en descarga y `mode=verify`; declaran cero archivos. | No se ejecutó creación nueva, por lo que no se puede afirmar que POST falle necesariamente. **Tampoco puede darse por conseguido un respaldo íntegro/recuperable.** Puede marcar éxito aun faltando archivos; se necesita evidencia del archivo generado y su validación. |
| 35 | Cierra sesión | ✅ FUNCIONA | A05: logout 204 y eventos 208/211 confirmados desde otra sesión; A06 cerró las sesiones utilizadas. | Verificado para la sesión que invoca logout; no equivale a cerrar todas las sesiones de todos los participantes. El fracaso de pasos anteriores no elimina esta capacidad independiente. |

## ¿En qué paso exacto se rompería el flujo?

**Paso 2: «Crea Editor», en el recorrido por la interfaz auditada.** La pantalla puede anunciar un alta exitosa, pero asigna Administrador. El requisito es obtener un Editor; el mensaje de éxito no cumple ese requisito. El mismo defecto afecta después a Revisor y Lector, y el paso 5 no ofrece en esa UI una reasignación de roles que lo compense. Esta conclusión procede de A01 y la confirmación puntual del payload, no de una creación real ejecutada durante esta auditoría.

**Si se consideran las altas como creación de cuentas todavía sin perfil y se pospone su corrección al paso 5**, ese paso sigue incompleto por falta de UI para asignar roles. No cambia el dictamen del recorrido: no se han conseguido los tres perfiles solicitados mediante la interfaz.

**Si se omiten esas altas y se usan las cuentas de prueba ya bien configuradas**, el primer bloqueo pasa al **paso 7: «Editor crea documento»**, por la discrepancia entre permisos del catálogo y el exigido por el controlador, además de la ausencia del formulario de alta en su panel. Las cuentas mal creadas como Administrador podrían superar ese control mediante privilegios generales, pero eso sería ejecutar otro recorrido, no demostrar que funciona el del Editor.

Hay otros puntos de interrupción independientes, aun suponiendo superados los anteriores:

| Punto | Condición que rompe el resultado esperado |
|---|---|
| Entre 6 y 7; también tras 14 y 24 | Las cuentas recién creadas deben cambiar contraseña. Es un paso obligatorio omitido, no un defecto de autenticación. |
| 11 y 20 | Guardar texto/metadatos no crea 1.1/1.2. Hace falta una nueva carga menor explícita. |
| 18–19 | El Editor no tiene el motivo de rechazo presentado en los paneles previstos y no puede subir la corrección con sus permisos actuales. |
| 25 | APROBADO no es PUBLICADO. El documento nuevo sigue fuera de la biblioteca del lector. |
| 31 | Falta acción UI de restauración de versión. Por API, la semántica sería una nueva 1.4 BORRADOR con contenido de 1.2. |
| 33 | Reporte ejecutivo/editor comparte constructor defectuoso; A06 ya observó HTTP 500 en consulta. |
| 34 | Respaldo nuevo sin prueba; las dos copias disponibles no pasan descarga/verificación. No hay evidencia de copia recuperable. |

## Estados esperados si se ejecutaran las cargas y decisiones con éxito

Esta tabla explica la semántica existente; **no describe operaciones ejecutadas ni introduce cambios**.

| Momento | Estado/versión que produciría el código | Diferencia respecto al recorrido supuesto |
|---|---|---|
| Primera carga | 1.0 BORRADOR, vigente | Crear solo la ficha no basta. |
| Nueva carga menor | 1.1 BORRADOR, vigente | Guardar texto no basta. |
| Enviar y rechazar 1.1 | 1.1 RECHAZADO; revisión RECHAZADA | Para corregir rechazo definitivo se requiere otra versión. |
| Nueva carga menor de corrección | 1.2 BORRADOR, vigente | Se conserva 1.1 rechazada. |
| Reenviar y aprobar 1.2, sin pendientes ni carga intermedia | 1.2 APROBADO, conserva vigencia | Todavía no es visible al lector por esa aprobación. |
| Publicación explícita, ausente en la lista solicitada | 1.2 PUBLICADO y vigente | `VersionPublishView` cambia estado y vigencia; su operación está separada de aprobar. No se ensayó ni se auditó aquí su UI. |
| Nueva carga menor | 1.3 BORRADOR, vigente | Si 1.2 fue publicada, lector puede seguir viendo esa publicación, aunque no sea la vigente interna. |
| Restaurar contenido de 1.2 por API | Nueva 1.4 BORRADOR, vigente; 1.2/1.3 conservadas | No reactiva 1.2 ni la convierte en nueva aprobación/publicación. |

Se deben distinguir tres conclusiones: hay funciones individuales operativas; hay mecanismos locales pendientes de ensayo; **no hay evidencia de que el recorrido completo solicitado pueda terminar con roles correctos, contenido visible al lector, historia íntegra, reporte generado y respaldo recuperable**. No se realizaron correcciones ni se modificaron los informes anteriores.
