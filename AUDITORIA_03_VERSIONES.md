# Auditoría 03 — Versiones

Fecha: 2026-09-06, America/Guatemala. Referencia: `AUDITORIA_MAPA_SISTEMA.md`. Alcance exclusivo: creación, numeración, vigencia, conservación, consulta, restauración y trazabilidad de versiones. La edición del documento y la selección de archivos para descarga se siguieron únicamente para determinar su efecto en las versiones. No se analizaron otros módulos.

**Resultado principal:** cargar un nuevo archivo crea una versión; editar únicamente título, descripción o metadatos no la crea. Con incrementos menores, las cargas generan 1.0 → 1.1 → 1.2 conservando los registros anteriores. Restaurar 1.1 desde ese estado crea **1.3, BORRADOR y vigente**, con una copia del archivo de 1.1; no convierte el registro original 1.1 en vigente ni elimina 1.2. Los datos generales del documento no se restauran.

## Método y límites

Lectura selectiva de `documentos/document_views.py`, `document_serializers.py`, modelo `ArchivoDocumento`, rutas de versiones y componentes `VersionsView`, `EditorVersionsView`, `ReaderVersionHistoryView` y la carga/edición de `EditorDocumentEditView`. Se consultó la selección de versión publicada solo para comprobar vigencia y descarga. Se hicieron exclusivamente SELECT mediante MCP Neon sobre versiones, sus referencias, restricciones, índices y permisos relevantes.

No se modificó código ni se escribieron registros/archivos. No se ejecutaron cargas, restauraciones, pruebas concurrentes ni navegación autenticada. Las contraseñas de prueba no están disponibles. No se inspeccionó el almacenamiento de objetos ni se verificó que el código local coincida con el desplegado. Por ello se distingue **reconstrucción por código**, **datos observados en Neon** y **ejecución no comprobada**. No se afirma haber creado realmente 1.1/1.2.

Estados: **✅ IMPLEMENTADO** = mecanismo y persistencia presentes, sin defecto identificado para ese requisito concreto; su evidencia indica si se comprobó en DB o solo en código. **PARCIAL** = falta una parte del flujo. **❌ NO IMPLEMENTADO** = soporte ausente. **CON ERROR** = defecto de código, contrato o integración identificado. **⚪ NO COMPROBABLE** = faltan datos/acceso para comprobar el caso en ejecución.

## Requisitos

| # | Función | Estado | Evidencia | Problema | Qué falta |
|---|---|---|---|---|---|
| 1 | Crear nueva versión al modificar documento | CON ERROR | `EditorDocumentEditView.jsx:111` hace PATCH sin archivo; `DocumentDetailView.patch`, `document_views.py:620`, solo invoca `save_document_file` si hay archivo. POST `versions/`, líneas 798–818, sí crea una fila mediante `save_document_file:423`. | Modificar texto/metadatos sobrescribe el documento común y no genera versión. El botón «Subir nueva versión» de `VersionsView.jsx:71` no tiene acción. La carga Editor exige permiso genérico ausente del catálogo. | Definir y versionar toda modificación requerida; conectar botón y permiso `versiones.crear`. |
| 2 | Identificar número de versión | ✅ IMPLEMENTADO | `next_version_numbers:415`; columnas `numero_mayor`, `numero_menor`, `orden_version`; `serialize_version:172`; tablas de historial muestran `version`. Neon confirma 1.0 y 2.0. | El cálculo secuencial es correcto; no garantiza éxito de dos incrementos simultáneos (V6). | Serializar concurrencia sobre el documento y probar cargas paralelas. |
| 3 | Identificar versión vigente | CON ERROR | `es_vigente`, GET `versions/` devuelve `current_version_id:794`; índice único parcial en Neon. `VersionsView.jsx:33,63,70` usa selección de comparación como vigente. | Administrador inicia con primera por orden, no con ID vigente; cambiar selector altera el rótulo. Editor también reutiliza selección como «Versión actual». Fallback del backend puede presentar última como vigente sin flag. | Separar selección de comparación y vigencia persistida; no ocultar ausencia de vigente. |
| 4 | Conservar versiones anteriores | ✅ IMPLEMENTADO | `save_document_file:441` solo cambia flag anterior; crea UUID y clave nuevos. Restauración hace copia nueva. Neon conserva 1.0 y 2.0 de PRUEBA-001. | Registros anteriores conservados; bytes remotos no comprobados. No hay instantáneas de datos generales del documento. | Verificar objetos y hashes; versionar metadatos si forman parte del historial requerido. |
| 5 | Consultar historial | PARCIAL | GET `versions/` → `version_queryset`; GET `timeline/` → `DocumentVersionTimelineView:1077`. `VersionsView.jsx:30` consulta ambos; Editor consulta versiones. | Administrador y Editor cargan `/api/documents/?limit=1` y el primer documento, sin selector/ID recibido. La línea de tiempo reconstruye estado y autor desde datos actuales. | Consultar documento seleccionado y distinguir evento histórico de estado actual. |
| 6 | Consultar versión anterior | PARCIAL | GET de versiones devuelve todas las permitidas; URLs con ID específico en `serialize_version:186`; `get_document_version_or_404:907`; UI Editor/Lector tiene preview/descarga por fila. | «Ver versión» en `VersionsView.jsx:74` no tiene onClick. El historial lector solo contiene PUBLICADO; no se probó lectura de objetos. | Conectar preview del Administrador y comprobar archivo histórico autorizado. |
| 7 | Restaurar versión anterior | PARCIAL | POST `/api/documents/<document_id>/versions/<version_id>/restore/` → `DocumentVersionRestoreView:821` → copia y fila nueva. | No hay acción de restauración en los tres componentes de historial revisados. Endpoint exige `documentos.gestionar`, no `versiones.restaurar`. No restaura datos generales y no verifica hash de bytes copiados. | UI, permiso específico, integridad y prueba de restauración controlada. |
| 8 | Registrar creador de versión | ✅ IMPLEMENTADO | Carga: `creada_por=user:458`; restauración: `creada_por=request.user:864`; FK NOT NULL/RESTRICT; serialización `author:180`. Las tres filas Neon tienen creador. | El nombre mostrado se resuelve desde el usuario actual, no es una instantánea del nombre histórico. | Si se requiere identidad histórica literal, conservarla junto al evento; el ID ya se registra. |
| 9 | Registrar fecha | ✅ IMPLEMENTADO | `creada_en=timezone.now()` en carga y restauración; `created_at:185`; DB NOT NULL y tres fechas presentes. | POST nueva versión/restauración no actualiza `Documento.actualizado_en`, que UI etiqueta «Última actualización». `published_at` del serializador lector usa fecha de creación, no publicación. | Separar fechas de creación/publicación y actualizar o derivar última actividad de versión. |
| 10 | Registrar cambios | PARCIAL | `comentario_cambio`; carga admite comment, restauración comentario por defecto; `compare_versions:212` compara nombre/MIME/tamaño/hash/comentario/estado; timeline consulta eventos. | Comentario puede ser genérico; `EditorVersionsView:82` envía solo file. No hay diff del contenido ni snapshot de título/descripción/metadatos; PATCH registra evento sin valores antes/después. | Capturar cambio significativo y datos históricos por versión; no presentar comparación de hash como diff de contenido. |

## Flujo reconstruido: Documento → 1.0 → 1.1 → 1.2

### Caso A: las modificaciones incluyen nueva carga de archivo

Precondiciones: actor autorizado para el endpoint, documento accesible, archivo válido, estado BORRADOR configurado y almacenamiento operativo; peticiones secuenciales y `version_type='minor'` (valor predeterminado). El endpoint de creación de versiones recibe multipart con `file`; no basta cambiar texto en pantalla. Para la carga mediante PATCH, además, el documento debe admitir edición directa: estados EN_REVISION/APROBADO/PUBLICADO la bloquean. POST `versions/` permite crear el nuevo borrador sin esa comprobación de edición directa.

`save_document_file` obtiene la fila de mayor `orden_version`, calcula número, desmarca la vigente y guarda archivo nuevo con clave `organización/documento/UUID.ext`. Inserta `ArchivoDocumento` con UUID nuevo y una entrada de estado BORRADOR. Todo el bloque de cambio de flags e inserción es transaccional en DB.

| Paso | Operación de código | Filas después del éxito | Vigente | Archivos |
|---|---|---|---|---|
| Documento sin archivo | No se invoca carga | Ninguna versión | Ninguna | Ninguno |
| Primera carga | latest inexistente → `(1,0)`, orden 1 | 1.0 | 1.0 | A en clave K0 |
| Modificación con nuevo archivo | latest 1.0 → `(1,1)`, orden 2 | **1.0, 1.1** | 1.1 | A/K0 conservado; B/K1 nuevo |
| Segunda modificación con archivo | latest 1.1 → `(1,2)`, orden 3 | **1.0, 1.1, 1.2** | 1.2 | A/K0 y B/K1 conservados; C/K2 nuevo |

Estado final reconstruido:

| Versión | orden_version | es_vigente | Contenido |
|---|---:|---|---|
| 1.0 | 1 | false | A, archivo original |
| 1.1 | 2 | false | B, primera modificación |
| 1.2 | 3 | true | C, segunda modificación |

**Comprobación en código:** 1.0 y 1.1 siguen existiendo porque no se ejecuta DELETE ni se reutiliza su clave; solo se actualiza su `es_vigente`. **Comprobación real disponible:** Neon conserva dos versiones de PRUEBA-001, pero son 1.0 y 2.0. No hay filas 1.1/1.2 en la muestra; no se puede presentar la secuencia solicitada como prueba de ejecución completada.

Si se envía `version_type='major'`, tras 1.0 se genera **2.0**, no 1.1. La primera carga sigue siendo 1.0 incluso si se pide major. El incremento usa la última por `orden_version`, no la marcada vigente. Subir idénticos bytes también crea otra versión: no existe condición `same_content` que lo impida.

### Caso B: las modificaciones son título, descripción o metadatos

`EditorDocumentEditView.saveDraft` manda JSON sin archivo. `DocumentDetailView.patch:647` modifica la fila Documento y `save_metadata` modifica/reemplaza valores comunes. Sin `request.FILES['file']` no llama `save_document_file`.

```text
Documento con archivo 1.0
  → editar título/descripción/metadatos y guardar
  → sigue teniendo solo 1.0
  → volver a editar y guardar
  → sigue teniendo solo 1.0
```

No se crean 1.1 ni 1.2; los valores anteriores de esos campos no quedan almacenados por versión. Si el estado vigente bloquea edición, el PATCH se rechaza antes de modificar. Este es el incumplimiento central de «crear nueva versión al modificar documento» entendido para toda modificación, no solo para reemplazo de archivo.

## Flujo exacto: 1.0 → 1.1 → 1.2 → restaurar 1.1

Supuesto inicial: tres cargas menores exitosas, 1.2 vigente y 1.1 anterior, con su objeto disponible. Llamada:

```http
POST /api/documents/<documento>/versions/<id-de-1.1>/restore/
Content-Type: application/json

{}
```

No se ejecutó esta petición. Según `DocumentVersionRestoreView:824`:

1. Exige permiso de escritura y obtiene la versión dentro del documento autorizado. Si 1.1 ya fuese vigente, devuelve **409 VERSION_ALREADY_CURRENT**.
2. Valida el cuerpo; por defecto usa incremento menor y comentario **«Restaurada desde la version 1.1»**.
3. Dentro de la transacción bloquea la última fila por orden (1.2). Si la fuente fuera esa última fila, rechaza con **400 VERSION_NOT_RESTORABLE**, incluso si no estuviera marcada vigente.
4. Desmarca las versiones vigentes; calcula a partir de 1.2 el número **1.3**, orden **4**.
5. Abre el objeto de 1.1 usando su clave y lo copia a una clave UUID nueva. No mueve ni elimina el original.
6. Crea una nueva fila **1.3**, **BORRADOR**, `es_vigente=true`. Copia nombre original, MIME, tamaño, SHA-256 y referencia de proveedor de 1.1. Creador = usuario que restaura; fecha = momento de restauración.
7. Crea historial de estado para 1.3. Después del bloque transaccional solicita registro del evento VERSION_RESTAURADA con IDs/número fuente y número nuevo. El enlace explícito a la fuente está en los detalles del evento; el modelo de versión no contiene FK `restored_from`.
8. Devuelve **201**, con `version` = 1.3 y `restored_from` = 1.1.

| Versión después de restaurar | ¿Sigue existiendo? | es_vigente | Archivo | Creador/fecha |
|---|---|---|---|---|
| 1.0 | Sí | false | A/K0 original | Conservados |
| 1.1 | Sí | false | B/K1 original | Conservados |
| 1.2 | Sí | false | C/K2 original | Conservados |
| **1.3** | **Nueva** | **true** | **Copia de B en K3** | **Actor y fecha de restauración** |

Los estados previos de 1.0/1.1/1.2 permanecen iguales; solo cambia el flag de la que era vigente. La restauración no publica automáticamente y no recupera título, código, área, tipo, descripción ni metadatos de cuando existía 1.1: esos datos no tienen snapshot en `ArchivoDocumento`. Tampoco cambia la fecha de actualización del documento en este handler.

Variantes exactas:

- Con `{"version_type":"major"}`, crea **2.0**, orden 4, con el archivo de 1.1.
- Con `comment` no vacío, usa el texto indicado en vez de la descripción por defecto; origen queda referenciado en el evento, si se registra.
- Una segunda restauración de 1.1 después de 1.3 crearía **1.4** por defecto; no vuelve hacia atrás en el contador.
- Si el objeto fuente no existe y `open_stored_file` lo convierte a Http404, responde 404. Otros errores de storage/DB se convierten generalmente a ValidationError/400. La transacción revierte flags/filas; si ya se creó un objeto nuevo se intenta borrarlo. Si ese borrado de compensación falla, puede quedar un objeto huérfano y cambiar el error recibido. No hay garantía de transacción distribuida con almacenamiento.
- Se copian tamaño y SHA-256 registrados sin recalcularlos sobre el objeto leído. Un objeto fuente alterado externamente podría producir una copia cuyo hash declarado no corresponda a sus bytes. Es un riesgo de integridad, no un caso observado.
- La copia usa `default_storage` actual aunque conserva la referencia de proveedor de la fuente. No se selecciona storage por proveedor histórico; si cambió la configuración, no está garantizado que encuentre el objeto antiguo o que esa referencia describa el destino real. No se comprobó cambio de proveedor.

## Comprobación de errores solicitados

| # | Función | Estado | Evidencia | Problema | Qué falta |
|---|---|---|---|---|---|
| 11 | Impedir varias versiones vigentes | ✅ IMPLEMENTADO | Neon: índice UNIQUE por documento WHERE es_vigente; transacciones desmarcan antes de insertar. Consulta: 0 documentos con varias vigentes. | Garantiza como máximo una, no que siempre exista una. | Probar concurrencia y ausencia de vigente; no reemplazar índice por control solo en UI. |
| 12 | Evitar sobrescribir versión anterior | ✅ IMPLEMENTADO | UUID/clave nueva y INSERT en carga/restauración; no UPDATE de bytes/número de la fuente. Neon mantiene 1.0 y 2.0. | Datos comunes del documento sí se sobrescriben, fuera de la fila de versión. | Snapshot de datos generales; verificar integridad de objetos remotos. |
| 13 | Evitar eliminar archivos antiguos durante carga/restauración | ✅ IMPLEMENTADO | `default_storage.delete` en líneas 471, 876, 880, 884 recibe solo `storage_key` recién creado al fallar. No elimina clave fuente. | Conservación demostrada por ruta de código, no por inventario remoto. | Verificar existencia de claves históricas en storage. |
| 14 | Evitar versión sin documento | ✅ IMPLEMENTADO | Neon: documento_id NOT NULL y FK a documentos ON DELETE RESTRICT; SELECT de huérfanas: 0. Inserción liga `documento=document`. | La declaración ORM usa on_delete=CASCADE para esa relación, distinta de RESTRICT físico; la FK no equivale a inmutabilidad ante un borrado coordinado por ORM. No hay DELETE de versión en las rutas revisadas. | Mantener coherencia de política ORM/DB; ninguna huérfana detectada. |
| 15 | Contador correcto con peticiones simultáneas | CON ERROR | `save_document_file:438` y restauración:841 bloquean última versión, no el documento padre; no hay reintento de conflicto. | Dos primeras cargas no tienen fila que bloquear; dos peticiones pueden calcular mismo próximo número/orden desde una última anterior. UNIQUE evita duplicados persistidos, pero una petición puede fallar. | Bloquear padre antes de consultar último contador y probar concurrencia; no se reprodujo en vivo. |
| 16 | Restaurar sin destruir historial | ✅ IMPLEMENTADO | Restauración INSERT/copia y flag, nunca borra fuente ni versiones posteriores. Nueva fila BORRADOR con autor/fecha nuevos. | Mecanismo presente; no ejecutado con objetos reales. Historial de metadatos no existe. | Prueba controlada de cuatro filas y cuatro objetos tras restauración; snapshots si se requieren. |
| 17 | Descargar la versión que se identifica como vigente | CON ERROR | URLs de `serialize_version:186` llevan ID; Editor usa `currentVersion.download_url`, dependiente del selector de comparación. Lectura usa última PUBLICADO (`reader_access.py:97`). | Cambiar comparación puede cambiar rótulo y descarga principal sin modificar vigente DB. Lector puede descargar publicada anterior mientras vigente real es BORRADOR. Descargar explícitamente una fila antigua sí es correcto. | Separar «vigente», «seleccionada» y «última publicada» y sus acciones. |
| 18 | Conservar datos históricos inmutables | PARCIAL | Archivo conserva ID/número/clave/creador/fecha; no hay PATCH de versión expuesto. `Documento`/metadatos compartidos; timeline resuelve estado/is_current/autor actual. Neon no devuelve triggers de usuario en versiones. | No hay snapshot integral. Evento de creación puede mostrar estado posterior; nombre de autor cambia si cambia usuario. La DB no tiene trigger de inmutabilidad de contenido. | Snapshot por versión y eventos con valores originales; definir campos mutables de ciclo de vida. |
| 19 | Comprobar archivos físicos 1.0/1.1 tras 1.2 y restauración | ⚪ NO COMPROBABLE | Solo SELECT de filas/clave; no se realizaron cargas ni descargas autenticadas. Neon tiene 0 versiones 1.1/1.2. | No se puede afirmar que se reprodujo esa cadena ni que existen sus objetos. | Secuencia en entorno de ensayo y verificación de bytes/SHA-256 antes y después. |

## Defectos concretos de interfaz e historial

**V1 — Guardar cambios no equivale a versionar.** `EditorDocumentEditView.jsx:106` guarda título/descripción/metadatos directamente. La función de carga separada (`:200`) sí envía file/comment/version_type a POST `versions/`. Son operaciones distintas y la UI no convierte automáticamente la primera en la segunda.

**V2 — Historial de un documento distinto del seleccionado.** Tanto `VersionsView.jsx:27` como `EditorVersionsView.jsx:56` consultan `limit=1`, toman la primera fila y no reciben ID del documento como entrada. El encabezado afirma mostrar documento seleccionado, pero el componente elige otro según el listado. `ReaderVersionHistoryView` sí admite documento y solo usa primero como fallback. No se generaliza este problema a todos los historiales.

**V3 — Vigencia confundida con selección.** Administrador usa `loadedVersions[0]` aunque API envía `current_version_id`; `currentId` también es el selector de comparación. Cambiarlo o intercambiar versiones cambia «Versión vigente» sin persistir nada. Editor inicializa correctamente desde `current_version_id`, pero luego su selector modifica `currentVersion`, rótulo y descarga principal. Las marcas `is_current` de las filas pueden contradecir ese encabezado.

**V4 — Acciones sin conexión.** En `VersionsView.jsx:71`, «Subir nueva versión» carece de handler. En `:74`, «Ver versión» también. Descarga y comparación sí tienen petición/URL real. No se encontró invocación de restore en los tres componentes de historial. Existe backend de restauración, pero no recorrido frontend completo.

**V5 — Permisos propios de versiones sin efecto en esos endpoints.** Neon contiene `versiones.crear`, `versiones.consultar`, `versiones.restaurar`, pero no `documentos.gestionar`. POST de creación/restauración exige este último; GET exige `documentos.consultar`. Conceder/restar los permisos de versiones no controla por sí solo esas operaciones. Se señala solo la integración de autorización de Versiones, sin auditar otros módulos. Con los roles previamente comprobados, el bypass de Administrador permite continuar y el Editor no puede crear versiones con su permiso específico.

**V6 — Concurrencia.** Las restricciones físicas protegen duplicidad y vigencia. Sin bloqueo del documento padre, el cálculo del próximo número no está serializado de forma robusta cuando no hay filas, o cuando las peticiones han seleccionado la misma última fila antes de que otra inserte. El resultado esperado del conflicto es rollback/error en una petición, no dos versiones con igual número guardadas. La restauración y la carga comparten este riesgo. No se hicieron pruebas concurrentes.

**V7 — Historial reconstruido con valores actuales.** `serialize_version_timeline_event:972` usa el estado actual del archivo para un evento rotulado «Version creada»; `fetch_document_timeline_events:1047` une vigente/estado actuales a eventos antiguos. Por ejemplo, una versión creada BORRADOR y posteriormente PUBLICADO aparece con estado PUBLICADO en ese evento de creación. Los valores originales de título/metadatos no están en la versión y el evento de modificación no registra diff antes/después. Registrar una fecha/evento no equivale a conservar el estado histórico completo.

**V8 — Vigente interna frente a publicación visible.** Una carga/restauración pone el nuevo BORRADOR como vigente y desmarca la anterior sin cambiar su estado PUBLICADO. El lector sigue eligiendo la publicada de mayor orden, que puede no ser vigente. GET `versions/` para lector filtra PUBLICADO y puede devolver `current_version_id=null`; su UI usa la primera como «actual». Es razonable conservar una publicación visible, pero el contrato debe identificarla como última publicada, distinta de vigente interna. No se analizó el proceso de publicación.

## Evidencia real de Neon

Proyecto `sistema-documental` (`red-sunset-06347686`), rama `main` (`br-frosty-dream-aub7kye4`), esquema `gestion_documental`; consultas de solo lectura realizadas durante esta auditoría.

| Documento | Versión | Orden | Vigente | Estado | Fecha de creación UTC | Comentario |
|---|---|---:|---|---|---|---|
| PRUEBA-001 | 1.0 | 1 | false | BORRADOR | 2026-08-27 06:48:25.067 | Carga de archivo |
| PRUEBA-001 | 2.0 | 2 | true | PUBLICADO | 2026-08-27 06:51:54.610 | Segunda version para probar comparacion |
| PRUEBA-003 | 1.0 | 1 | true | BORRADOR | 2026-08-27 07:11:26.368 | Carga de archivo |

Las tres filas tienen creador, fecha y clave no vacía. No se consultaron secretos. No se interpreta 1.0 → 2.0 como contador incorrecto: el algoritmo permite salto mayor.

| Comprobación SELECT | Resultado |
|---|---:|
| Documentos con más de una vigente | 0 |
| Documentos con versiones pero ninguna vigente | 0 |
| Versiones sin documento existente | 0 |
| Números de versión duplicados dentro de documento | 0 |
| Versiones sin creador o fecha | 0 |
| Versiones 1.1 o 1.2 | 0 |

Restricciones comprobadas: número mayor ≥ 1, menor ≥ 0, orden ≥ 1; UNIQUE documento/número; UNIQUE documento/orden; UNIQUE proveedor/clave; UNIQUE documento WHERE es_vigente; FK y NOT NULL para documento/creador; tamaño > 0 y formato SHA-256. No se encontraron triggers de usuario sobre `versiones_documento` que congelen campos históricos. La ausencia de anomalías en tres filas no demuestra seguridad bajo concurrencia ni integridad de objetos.

## Verificación que queda pendiente

En un entorno de ensayo: cargar A/B/C como 1.0/1.1/1.2; registrar IDs, claves y hashes; restaurar 1.1; comprobar cuatro filas, nueva 1.3 BORRADOR como única vigente y cuatro objetos, manteniendo A/B/C sin cambios; descargar cada ID y contrastar hash. Repetir edición sin archivo para documentar que no incrementa y cargas simultáneas para validar el contador. Esta auditoría no ejecutó esas escrituras ni modificó el sistema.
