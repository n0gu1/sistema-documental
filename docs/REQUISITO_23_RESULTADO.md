# Requisito 23: edición normal de datos documentales

Fecha: 8 de septiembre de 2026. Alcance: edición de datos y metadatos; se revisó `AUDITORIA_FINAL.md` antes de intervenir.

## Contrato de edición

`PATCH /api/documents/<id>/` exige `documentos.modificar`, autorización sobre el documento y, al cambiar el área, autorización sobre el área destino. Conserva el aislamiento por organización y los bloqueos de edición por estado ya existentes.

Solo admite `code`, `title`, `description`, `date`, `area_id`, `type_id` y `metadata`. Se rechazan con 400 campos desconocidos o protegidos: identidad, organización, autor, estado, permisos, fechas del sistema y atributos de archivo/versionado. Un título vacío después de sanitizar también se rechaza. Área y tipo destino deben ser referencias válidas y activas.

La edición normal no carga archivos: `file`, `file_comment` y `version_type` se rechazan antes de escribir datos. Las rutas existentes de carga y versiones conservan sus reglas. No se definió ninguna política nueva de versionado, numeración, publicación o restauración.

## Guardado coherente

Se conserva la transacción existente de `document_code_conflict` y se bloquea la fila del documento durante el PATCH. La validación precede a las escrituras. Datos y metadatos se confirman juntos; una excepción propagada antes de la respuesta revierte las escrituras. El conflicto UNIQUE mantiene su respuesta 409.

El contrato de metadatos existente se conserva: omitir `metadata` no lo modifica; enviarlo reemplaza el conjunto, y `{}` lo vacía. La UI conserva las claves adicionales cargadas al enviar los metadatos editados. `date: null` permite vaciar la fecha documental.

## Formulario

El editor existente, usado por Editor y Administrador, permite modificar código, título, descripción, fecha, área, tipo y metadatos. Los selectores usan los catálogos existentes. Identidad, responsable y estado se mantienen fuera de la edición normal. Los valores de área/tipo sin cambios se omiten del PATCH para conservar referencias históricas sin intentar reasignarlas.

No permite guardar antes de cargar el detalle y catálogos, después de un fallo de carga ni mientras otro guardado está en curso. El formulario se bloquea durante el envío y el aviso de éxito solo se emite después de la respuesta satisfactoria. Tras guardar, los campos se sincronizan con los valores devueltos por el backend.

## Verificación

Backend local contra Neon: **13 comprobaciones aprobadas**, registradas en [resultado backend](resultado_edicion_documental.json), mediante [script reproducible](verificar_edicion_documental.py). Todos sus datos de ensayo se revierten.

Incluyen modificación y GET posterior de los siete campos; Editor con `documentos.modificar` sin `documentos.gestionar`; Lector/Revisor rechazados con 403; rechazo de campos no autorizados, referencias y metadatos inválidos; controles de acceso documental y al área destino; PATCH multipart con archivo rechazado sin invocar almacenamiento; conservación y limpieza opcional de metadatos.

Se inyectó un fallo después de borrar claves y escribir un metadato: la comparación de filas confirma que documento, marcas de actualización y metadatos completos regresan exactamente al estado previo. Otro fallo propagado al final del PATCH también revierte las escrituras. No se respondió éxito en ninguno de los dos casos.

Prueba UI: [script de modificación y recarga](verificar_edicion_documental_ui.cjs). El error HTTP simulado en el navegador verifica el mensaje de fallo sin éxito aparente; la reversión real de PostgreSQL se verifica por separado en el script backend.

**UI aprobada:** modificación de los siete campos, bloqueo durante el envío, rechazo visible de un fallo y recarga/reapertura con los valores persistidos. Evidencia: [resultado UI](resultado_edicion_documental_ui.json) y [captura tras recargar](edicion_documental_recargada.png). Una consulta independiente mediante MCP de Neon confirmó datos y metadatos del documento `4a88fac7-242f-4e3c-a3a2-31b42c665034`, incluida la clave adicional conservada y cero versiones: [resultado Neon](resultado_edicion_documental_neon.json).

Las 16 comprobaciones anteriores de campos y unicidad también pasan (`verificar_campos_documentales.py`), incluidos códigos archivados y reversión ante el UNIQUE real. Compilación de producción del frontend y compilación Python aprobadas. Oxlint sin errores, con un aviso de estado en efecto; Vite conserva el aviso por tamaño del bundle. `git diff --check` sin errores.

## Entrega

Cambios locales y bundle actualizado. El commit/push anterior (`8613a12`) no contiene esta corrección. No se hizo un commit, push o despliegue nuevo durante este requisito.
