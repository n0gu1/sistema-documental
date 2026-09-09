# Requisitos 26–30 y 32: filtros documentales

Fecha: 8 de septiembre de 2026. Alcance limitado a búsqueda, tras revisar `AUDITORIA_FINAL.md`.

## Contrato común

`documentos/document_filters.py` concentra la validación y aplicación de filtros. `/api/documents/` para lector delega en el mismo listado de `/api/reader/documents/`; se mantienen las respuestas propias de cada perfil. La autorización documental y por organización se aplica antes de paginar.

| Parámetro | Comportamiento |
|---|---|
| `search` | Coincidencia parcial, sin distinguir mayúsculas, en nombre, código o descripción. |
| `type_id` | Identificador numérico positivo del tipo. |
| `area_id` | UUID del área; nunca amplía el acceso del usuario. |
| `status_code` | Estado de la versión vigente en gestión; para lector, estado de la publicación accesible. |
| `date_from`, `date_to` | Límites inclusivos sobre `fecha_documento`. |
| `updated_from`, `updated_to` | Límites inclusivos de días sobre `actualizado_en`, usando la zona horaria configurada. |

Las fechas usan `YYYY-MM-DD`; valores inválidos e intervalos invertidos devuelven 400. Identificadores válidos sin coincidencias producen un listado vacío. Sin fecha documental, el documento no coincide con un límite de fecha documental. Sin versión vigente, no coincide con un estado de gestión. La baja lógica conserva su exclusión habitual.

El lector solo consulta publicaciones autorizadas. Si existe una publicación anterior y un borrador vigente, `PUBLICADO` encuentra la publicación para el lector; solicitar `BORRADOR` no expone el borrador. Ambas rutas lectoras aplican esa misma regla. No se modificó el versionado.

Neon confirma que `documentos.buscar` continúa activo. Se exige al enviar filtros en ambos listados y en la exportación general filtrada; la consulta básica y paginación conservan `documentos.consultar`. Se preservan los filtros auxiliares de responsable/favoritos y el ordenamiento.

## UI

Los tres listados usan el mismo constructor de parámetros. Los controles de fecha ahora indican “Fecha documental” y envían `date_from/to`; la biblioteca lectora incorpora ambos límites. Un filtro rechazado limpia resultados anteriores y muestra el error, para evitar presentar datos que no corresponden a la búsqueda solicitada.

## Verificación

El [script backend](verificar_filtros_documentales.py) utiliza fixtures en Neon dentro de una transacción que se revierte. Cada petición de búsqueda prueba un solo filtro. Las únicas peticiones con dos límites comprueban validación de un mismo intervalo. Se ensayan coincidencias, vacíos, formato inválido, estado publicado anterior, área ajena y ausencia de `documentos.buscar` en las tres variantes de ruta/perfil.

El [script UI](verificar_filtros_documentales_ui.cjs) usa el lector real, opera un control cada vez y coteja la respuesta de la ruta lectora con la ruta general para los mismos parámetros.

**Resultados:** [49 comprobaciones backend aprobadas](resultado_filtros_documentales.json) y [seis controles UI aprobados](resultado_filtros_documentales_ui.json): nombre, tipo, área, estado, fecha desde y fecha hasta. [Captura de la biblioteca](filtros_lector_ui.png).

La [consulta independiente mediante MCP de Neon](resultado_filtros_neon.json) confirma el permiso activo y que el documento publicado usado en UI carece de fecha documental: los dos límites devuelven cero coincidencias en ambas rutas, como corresponde. Las coincidencias positivas y los límites inclusivos de fechas documentales y de actualización se prueban por separado en backend con fixtures de fechas conocidas, sin conservar esos registros de ensayo.

Cambios locales, pendientes de commit y despliegue. La compilación frontend pasa con el aviso de tamaño del bundle. Oxlint no reporta errores; mantiene tres avisos de estado dentro de efectos existentes.
