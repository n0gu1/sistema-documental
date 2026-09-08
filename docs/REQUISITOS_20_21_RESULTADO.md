# Requisitos 20 y 21: campos documentales

Fecha de verificación: 8 de septiembre de 2026.

Alcance: fecha, observaciones, clasificación y unicidad del código documental archivado. Se revisó `AUDITORIA_FINAL.md` antes de intervenir. Se conservaron los cambios locales previos; no se modificaron modelos, migraciones ni la lógica de versiones.

## Contrato confirmado en el modelo y mediante MCP de Neon

| Dato | API | Persistencia | Validación |
|---|---|---|---|
| Fecha documental | `date` | `gestion_documental.documentos.fecha_documento` (DATE nullable) | Fecha válida; opcional; `null` permite vaciarla. |
| Clasificación | `metadata.classification` | `documentos_metadatos`, clave `classification` | Texto libre, hasta 100 caracteres; admite vacío. |
| Observaciones documentales | `metadata.observations` | `documentos_metadatos`, clave `observations` | Texto, hasta 5000 caracteres; admite vacío. |

`Documento` no tiene FK de clasificación ni columna de observaciones. Existe una declaración de modelo `ClasificacionDocumento`, pero no está vinculada a `Documento`, no participa en su flujo y su tabla no existe en el proyecto Neon consultado. Por tanto, no se añadió un catálogo, FK ni columna nueva. La clasificación es descriptiva y no altera permisos. Las observaciones documentales son independientes de los comentarios del revisor.

Se conserva el contrato existente de reemplazo del objeto `metadata`: omitirlo no modifica metadatos; al enviarlo, representa el conjunto completo. El Editor combina los valores cargados con los editados para conservar las otras claves.

## Cambios

- Alta de Administrador y Editor: captura de los tres campos y envío de fecha y JSON de metadatos, también en multipart.
- Editor: carga, edición y guardado de fecha y clasificación; pestaña Observaciones conectada al metadato correspondiente.
- Administrador: acción Ver permite consultar los campos recuperados del endpoint de detalle.
- Lector: fecha documental y etiquetas en español para clasificación y observaciones en la consulta existente. No se alteró la política de publicación/acceso.
- Backend: validación de tipos y longitudes; validación de metadatos antes de las escrituras; transacción para evitar persistencia parcial. Una edición solo de metadatos también actualiza `actualizado_en`.
- Código: prevalidación de alta y edición incluye archivados y excluye únicamente el propio documento al editar. Se captura exclusivamente la restricción `uq_documentos_organizacion_codigo` como HTTP 409; otros errores de integridad siguen propagándose.

Neon confirmó `UNIQUE (organizacion_id, codigo)`, sin condición de baja lógica. Archivar no libera el código; el mismo código puede existir en otra organización. No se modificó esta restricción.

## Pruebas

Backend local conectado a Neon: **16 comprobaciones aprobadas** en `verificar_campos_documentales.py`, con rollback completo de sus datos de ensayo. Incluyen alta, lectura posterior, edición, actualización solo de metadatos, limpieza opcional, fecha imposible, tipos/longitudes inválidos, rechazo sin guardado parcial, conservación del código propio y rechazo de códigos archivados en alta/edición. Un INSERT real que omite la prevalidación confirma el conflicto PostgreSQL convertido a 409 y la ausencia de duplicados.

Resultados: [backend](resultado_campos_documentales.json) y [UI](resultado_campos_documentales_ui.json). La prueba UI usa login real con las cuentas de Administrador y Editor suministradas, frontend/backend locales y persistencia en Neon; conserva documentos `REQ2021-*` identificables como evidencia. No carga archivos ni crea versiones.

**UI aprobada:** Administrador crea y consulta los tres campos; Editor crea, modifica y vuelve a abrir el documento tras recargar la página, conservando los valores editados. MCP de Neon confirmó los documentos `92cc09f9-aa5b-488d-8cd5-1653bf9d50ba` (Administrador) y `2330b93f-4af9-4410-8543-bcaa83779174` (Editor): este último conserva fecha `2026-08-31`, clasificación `Confidencial` y observaciones `Observación editada y consultada`. Ambos tienen cero archivos/versiones según el detalle API. No se ejecutó un recorrido UI nuevo de Lector o Revisor, porque este ensayo no publica ni crea versiones.

Frontend: compilación de producción aprobada; lint sin errores, con advertencias existentes en componentes ajenos y en efectos del listado del Editor. Advertencia de compilación por tamaño de bundle superior a 500 kB.

## Límite de entrega

Confirmación independiente: [consulta MCP de Neon](resultado_campos_documentales_neon.json), con valores persistidos y cero versiones para ambos documentos. Capturas revisadas: [Administrador](campos_documentales_admin.png) y [Editor](campos_documentales_editor.png). Se comprobó nuevamente la consulta del Editor después de ampliar el cuadro de observaciones.

Los cambios están en el espacio de trabajo y el bundle local. No se hizo push ni despliegue a Render. La URL pública no queda certificada con esta implementación hasta desplegarla. No se certifica el flujo de publicación, revisión o versiones dentro de este alcance.
