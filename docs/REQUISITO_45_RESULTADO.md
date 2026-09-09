# Requisito 45: revisión de la versión asignada

Fecha: 9 de septiembre de 2026.

Único cambio funcional: `ReviewerDocumentReviewView.jsx`. El contrato existente devuelve el identificador en `review.document.version_id`. La pantalla filtra los archivos por ese ID, conserva número e identidad de versión de la solicitud al combinar los metadatos documentales y utiliza el mismo archivo para preview, apertura alternativa y descarga. Si falta, muestra error sin ofrecer otra versión ni decisiones. Al cambiar de solicitud limpia el preview y los errores anteriores. La decisión mantiene el endpoint de la solicitud, cuyo backend ya utiliza `version_documento_id`; no se modificaron estados, permisos ni concurrencia.

## Validación

- `verificar_revision_version.py`: backend local conectado a Neon real, autenticación de prueba con las cuentas Editor y Revisor existentes, almacenamiento temporal y transacción revertida. Crea 1.0 roja y 1.1 azul, solicita revisión explícita de 1.0 cuando 1.1 es vigente, comprueba preview y descarga byte a byte y aprueba la solicitud. Solo 1.0 queda APROBADO; 1.1 permanece BORRADOR vigente.
- `verificar_revision_version_ui.cjs`: cuatro casos con el componente real y API controlada. La vigente global aparece primero y tiene otro ID/número. Comprueba contenido del blob, descarga, ID de decisión, archivo ausente sin fallback, apertura alternativa tras fallo y eliminación del preview anterior al cambiar de solicitud.
- Build y lint terminan con código 0; advertencias de tamaño de paquete y React. Se actualiza el bundle de distribución.
- MCP Neon confirma cero versiones y solicitudes de prueba después del rollback. IDs y resultados en `resultado_revision_version.json` y `resultado_revision_version_ui.json`.

Durante la prueba se observan avisos preexistentes de catálogo de auditoría para el recurso ARCHIVO. No se corrigen porque quedan fuera del requisito solicitado. No se certifica S3 ni la interfaz desplegada: las pruebas usan archivos locales temporales. No se hizo commit ni despliegue a Render; su MCP no tiene workspace seleccionado.
