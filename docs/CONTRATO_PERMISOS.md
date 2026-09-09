# Contrato de permisos — requisitos 4 y 17

Revisión del 7 de septiembre de 2026. Código local; pendiente de desplegar en Render.

## Inventario y comparación con Neon

Se revisaron las comprobaciones directas, constantes, mapas de permisos, helpers
de acceso y códigos configurables del backend. El catálogo real contiene 21 códigos,
todos activos. `documentos.gestionar` era el único código de autorización utilizado
que no existía. No se agregaron permisos ni se alteró el catálogo.

El inventario reproducible con archivo y línea de cada literal está en
`resultado_contrato_permisos.json`. Excluye pruebas y referencias de modelos en
migraciones; incluye constantes que después se pasan a helpers. Los helpers genéricos
`require_permission`, `user_has_permission`, `has_document_permission` y
`HasDocumentalPermission` reciben estos códigos en sus llamadas. Los IDs de permisos
recibidos por las APIs de gestión se validan contra el catálogo activo.

| Código real | Uso del backend después de la corrección |
|---|---|
| documentos.consultar | Lectura, catálogos, vista previa, acceso documental y reportes de Editor |
| documentos.crear | Alta documental |
| documentos.modificar | Modificación documental |
| documentos.eliminar | Baja/archivo y reversión del archivo |
| documentos.descargar | Descarga de archivos/versiones y descarga de Lector |
| documentos.buscar | Sin comprobación explícita; búsqueda permanece bajo consultar |
| versiones.consultar | Listado, comparación y timeline de versiones |
| versiones.crear | Carga de archivos/nuevas versiones por las rutas files/ y versions/ |
| versiones.restaurar | Restaurar una versión |
| usuarios.consultar | Consultas administrativas y configuración |
| usuarios.gestionar | Gestión de usuarios, configuración y respaldos |
| roles.gestionar | Gestión de roles/permisos y permisos documentales |
| revisiones.enviar | Envío y operaciones asociadas de revisión |
| revisiones.consultar | Consulta de revisiones y reportes de Revisor |
| revisiones.aprobar | Aprobación y operaciones asociadas |
| revisiones.rechazar | Rechazo |
| reportes.generar | Reportes ejecutivos |
| auditoria.consultar | Sin comprobación explícita; auditoría comprueba rol/consulta propia |
| auditoria.seguridad | Sin comprobación explícita |
| respaldos.ejecutar | Sin comprobación explícita; respaldos exige usuarios.gestionar |
| respaldos.restaurar | Sin comprobación explícita; respaldos exige usuarios.gestionar |

Los desajustes de respaldos, auditoría y reportes por alcance quedan identificados;
no se modificaron esos módulos. La búsqueda sigue integrada en las consultas existentes;
esta corrección no introduce un nuevo contrato para los filtros.

## Sustituciones documentales

| Operación / vista | Antes | Ahora |
|---|---|---|
| POST DocumentListCreateView | documentos.gestionar | documentos.crear |
| PATCH DocumentDetailView | documentos.gestionar | documentos.modificar |
| DELETE DocumentDetailView; DocumentArchiveView; DocumentUnarchiveView | documentos.gestionar | documentos.eliminar |
| POST DocumentFileListCreateView; DocumentVersionListView | documentos.gestionar | versiones.crear |
| POST DocumentVersionRestoreView | documentos.gestionar | versiones.restaurar |
| GET DocumentVersionListView; DocumentVersionCompareView; DocumentVersionTimelineView | documentos.consultar | versiones.consultar, conservando acceso de lectura al documento |
| GET DocumentFileDownloadView; DocumentVersionDownloadView | documentos.consultar | documentos.descargar |
| GET/PUT DocumentPermissionsView | documentos.gestionar | roles.gestionar |

PATCH modifica exclusivamente datos y metadatos, sin crear versión y sin admitir
archivos. La carga por files/ o versions/ exige versiones.crear. La versión inicial
incluida en el alta queda amparada por documentos.crear.
La reversión del archivo usa la misma autoridad que la baja lógica, sin inventar
un permiso de restauración documental.

Los helpers de acceso reciben explícitamente el permiso de la operación en vez de
elegir el genérico inexistente o caer en consultar para una escritura. Se conservan
el algoritmo de ACL, el filtro de organización, área, estados y publicación. Los
helpers usados por revisión mantienen consultar como argumento predeterminado.
La clasificación de acceso de Lector sustituye la señal documentos.gestionar por
los permisos documentales/de versiones específicos, manteniendo su algoritmo.

La consulta/edición de concesiones documentales exige roles.gestionar, coherente
con la gestión de permisos existente; no se modificó cómo se guardan o evalúan ACL.
No se cambió lógica de creación, edición, archivo, restauración, archivos ni UI.

## Pruebas

11 comprobaciones de autorización con DRF APIRequestFactory contra el backend local
y el catálogo/concesiones reales de Neon, sin simular el cálculo de permisos:

- Editor con documentos.crear: POST vacío devuelve **400 de validación** (campos
  obligatorios), demostrando que atraviesa la autorización. No se afirma alta exitosa.
- Mismo Editor con documentos.crear retirado temporalmente: **403**.
- Lector con consultar y sin modificar: PATCH devuelve **403** antes de buscar el documento.
- Consultar no permite archivo/desarchivo, restaurar versiones ni gestionar permisos: **403**.
- Consultar no permite cargar archivos ni crear versiones: **403**.
- Consultar sin descargar no permite descargar archivo ni versión: **403**.

Las concesiones retiradas temporalmente y los eventos de prueba se revirtieron por
transacción. No se creó ni modificó ningún documento.

Además pasaron **20 pruebas unitarias** de ciclo de vida, permisos documentales,
acceso de Lector y restauración de versiones. Se actualizaron dos expectativas
del contrato de permisos. No se ejecutó prueba de UI ni despliegue.

Script: `verificar_contrato_permisos.py`.
Resultados e inventario: `resultado_contrato_permisos.json`.
