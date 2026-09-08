# Requisito 18 — Alta documental

Verificado el 7 de septiembre de 2026 (Guatemala).

Se añadió Crear documento al listado del Editor, con formulario protegido por `documentos.crear`, envío multipart a POST `/api/documents/`, mensaje de éxito y recarga del listado. Campos: código, título, descripción, área y tipo. El backend ya exigía `CREATE_PERMISSION = 'documentos.crear'`; se conservaron autenticación, CSRF, validación de área/organización y transacción de creación. No se modificaron versiones ni otras operaciones documentales.

## Pruebas con inicio de sesión real

Frontend y backend locales, conectados a Neon; contraseñas suministradas por variable de entorno.

| Cuenta | Crear en UI | POST | Resultado |
|---|---|---|---|
| prueba.admin@test.local | Habilitado | 201 | Registro creado y consultado tras recargar |
| prueba.editor@test.local | Habilitado | 201 | Registro creado y consultado tras recargar |
| prueba.revisor@test.local | No disponible | 403 | Backend deniega |
| prueba.lector@test.local | No disponible | 403 | Backend deniega |

Evidencia: `resultado_alta_documental.json`; prueba reproducible: `verificar_alta_documental.cjs` con `DOCUMENT_TEST_PASSWORD` y opcional `DOCUMENT_TEST_BASE`.

## Verificación mediante MCP de Neon

Proyecto `red-sunset-06347686`, esquema `gestion_documental`. Consultas SELECT confirmaron rol y concesión `documentos.crear` para Administrador/Editor, ausencia de concesión para Revisor/Lector y persistencia de:

- `REQ18-ADMIN-1788841782091`, ID `ff52f656-b2ab-4161-af1c-dad5493bfa04`.
- `REQ18-EDITOR-1788841798016`, ID `9846dde5-df2f-4c8b-9fff-69a387466b9a`.

Ambos conservan título, descripción, área, tipo, creador correcto y organización del usuario. Ambos tienen cero versiones. Son registros de ensayo conservados en Neon.

## Sitio publicado

En https://sistema-documental-nw05.onrender.com se probaron los cuatro inicios de sesión y POST vacío: Administrador/Editor obtienen 400 de validación (superan autorización); Revisor/Lector, 403. El Editor publicado aún no muestra Crear documento. No se crearon registros mediante el sitio remoto ni se desplegaron cambios. Evidencia: `resultado_alta_documental_render.json`.

## Validación del código

`npm --prefix frontend run build` correcto; distribución compilada actualizada. `npm --prefix frontend run lint` termina sin errores, con advertencias existentes. El requisito queda corregido y probado localmente con Neon, pendiente de despliegue para verificar la interfaz publicada.
