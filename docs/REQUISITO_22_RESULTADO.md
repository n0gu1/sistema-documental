# Requisito 22: selección del documento en Administrador

Fecha: 8 de septiembre de 2026.

Se revisó la fila #22 de `AUDITORIA_FINAL.md`. Alcance exclusivo: transportar y conservar la identidad del documento entre listado, detalle, edición e historial.

## Corrección

- `Dashboard` conserva `selectedDocumentId` como selección común. Ver, Editar e Historial reciben el ID de la fila pulsada.
- El detalle existente se extrajo a `DocumentDetailsDialog`, cargado por ese ID. Desde él se abre el editor existente o el historial del mismo documento.
- Editar abre `EditorDocumentEditView` con el ID seleccionado, reutilizando su consulta y su PATCH sin modificar su lógica.
- `VersionsView` recibe `documentId` y lo usa para detalle, versiones y timeline. Se eliminó la consulta `?limit=1` que elegía el primer documento.
- Al regresar al listado y entrar desde el menú Versiones, se mantiene la última selección. Elegir otra fila reemplaza la selección; cambiar de documento remonta las vistas mediante `key`, evitando conservar datos, comparaciones o formularios del anterior. Las respuestas de cargas desmontadas se ignoran.
- Sin selección, el historial pide elegir un documento; no usa un documento arbitrario. La selección vive en el estado del panel, no en una ruta persistente tras recargar la aplicación.

No se modificaron backend, modelos, permisos ni reglas de creación, publicación o restauración de versiones en este trabajo. Se conservaron las correcciones previas de los requisitos 20–21.

## Verificación

Prueba reproducible: `docs/verificar_seleccion_documental_ui.cjs`, con login real de Administrador, frontend/backend locales y Neon. Selecciona dos documentos de ensayo existentes distintos, omitiendo el primero de la lista inicial. Para cada uno comprueba:

1. Ver muestra código/título e ID correctos.
2. Detalle → Editar conserva el ID, también en el PATCH real al guardar los valores cargados.
3. Editar → Historial consulta detalle, versiones y timeline exclusivamente del mismo ID.
4. Editar y Ver versiones desde cada fila usan ese documento.
5. Regresar al listado y abrir Versiones desde el menú conserva la última selección.

Además, abrir Versiones antes de seleccionar un documento no consulta un ID arbitrario. Se comprueba que no se solicita `limit=1`. No se crean documentos, archivos ni versiones; el guardado de ensayo actualiza la fecha de modificación y registra el evento habitual.

Resultado: **13 comprobaciones aprobadas**, con los dos documentos distintos. [Evidencia UI y peticiones por ID](resultado_seleccion_documental_ui.json). Se revisaron las capturas de historial de ambos documentos.

Identidades confirmadas mediante [MCP de Neon](resultado_seleccion_documental_neon.json):

| Documento | ID |
|---|---|
| REQ2021-ADMIN-1788877205368 | `92cc09f9-aa5b-488d-8cd5-1653bf9d50ba` |
| REQ2021-EDITOR-1788877113398 | `0639a648-f999-4694-a549-d4400c9777d5` |

Ambos tienen cero versiones. La prueba de historial valida las peticiones y la identidad visible, no el funcionamiento de creación de versiones.

Compilación de producción aprobada. Lint de los componentes afectados sin errores; permanecen advertencias previas de efectos/dependencias en `Dashboard` y `DocumentsView`. `git diff --check` aprobado.

Los cambios y el bundle están en el espacio de trabajo. No se hizo push ni despliegue a Render; no se certifica esta corrección en la URL pública hasta desplegarla.
