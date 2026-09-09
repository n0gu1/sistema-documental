# Requisitos 47–48: recepción del motivo de rechazo

Fecha: 9 de septiembre de 2026.

## Alcance

Únicamente Revisor rechaza → backend guarda motivo → Editor ve motivo. El backend ya devuelve `resolution_comment` en las revisiones del documento; el Editor las consultaba, pero su panel mostraba siempre «No hay comentarios registrados».

`EditorDocumentEditView.jsx` ahora muestra «Motivos de rechazo» en la ficha del documento, con cada solicitud RECHAZADA, versión, revisor, fecha y motivo completo. Conserva saltos de línea y ajusta texto largo. Muestra carga, error o ausencia de rechazos según la respuesta; al cambiar de documento no muestra resultados del anterior. Estilos limitados al nuevo panel en `EditorDocumentEditView.css`; distribución compilada actualizada.

No hay cambios backend, permisos, estados, asignación ni reenvío en esta reparación. El resto del requisito #48 permanece fuera de alcance.

## Prueba integrada aprobada

`verificar_motivo_rechazo.py` crea dos documentos temporales y una solicitud en Neon. Arranca un puente HTTP de prueba en loopback que ejecuta las vistas Django reales, con autenticación DRF de las cuentas existentes Editor y Revisor. `verificar_motivo_rechazo_ui.cjs` opera los componentes reales con Playwright:

1. Revisor abre su solicitud y confirma el rechazo desde el formulario, con el texto:

   ```text
   RECHAZO-47-48-NEON: Falta la firma del responsable.
   Corregir la fecha del anexo 7.
   ```

2. POST `reject/` devuelve 200. Lectura posterior desde ORM confirma motivo idéntico, solicitud RECHAZADA, versión RECHAZADO y comentario atribuido al Revisor.
3. Editor abre el mismo documento; GET de revisiones devuelve 200 y el panel muestra ambas líneas completas, versión 1.0, nombre del Revisor y fecha.
4. Recarga del Editor consulta nuevamente la API y conserva el motivo exacto.
5. Abrir el segundo documento muestra «No hay rechazos registrados», sin heredar el motivo anterior.
6. El navegador envió un único POST: rechazo. No hubo reenvío.

La prueba usa una transacción externa para revertir todos los datos y almacenamiento local temporal. MCP Neon confirmó cero documentos y solicitudes de prueba después del rollback. No certifica login/middleware de sesión, correos, S3 ni la aplicación desplegada en Render. El panel preexistente de permisos devuelve 403 para Editor; ese comportamiento y los avisos de catálogo de auditoría ARCHIVO quedan fuera de alcance.

Evidencia: `resultado_motivo_rechazo.json` contiene las peticiones, estados e IDs revertidos. Captura inspeccionada visualmente: `motivo_rechazo_editor.png`.

Build, lint y `git diff --check` aprobados; permanecen advertencias de tamaño de paquete y React. Cambios locales pendientes de commit y despliegue.
