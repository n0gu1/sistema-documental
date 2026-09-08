# Requisito 10: desactivación y revocación

PATCH de usuario, DELETE lógico y POST de estado utilizan update_user_state. La actualización y la revocación de todas las sesiones no revocadas ocurren en una transacción. Se bloquea la fila del usuario, al igual que en login, para serializar creación de sesiones y desactivación. Reactivar no borra marcas de revocación. Repetir una desactivación también revoca sesiones pendientes.

Prueba: backend local contra BD configurada, usando login real y autenticación por cookie en /me/. Los cambios del ensayo se revirtieron al terminar. No se probó un despliegue en Render.

| Paso | Esperado | PATCH | DELETE | POST estado |
| --- | --- | --- | --- | --- |
| Login y sesión inicial | 200 | 200 | 200 | 200 |
| Token después de desactivar | 401 | 401 | 401 | 401 |
| Token antiguo tras reactivar | 401 | 401 | 401 | 401 |
| Segundo token, sin usar durante desactivación, tras reactivar | 401 | 401 | 401 | 401 |
| Nuevo login y nueva sesión | 200 | 200 | 200 | 200 |

Se verificó en BD que no quedaban sesiones sin revocar tras cada desactivación. Nueve pruebas de UserDeletionTests y AuthenticationTests aprobadas. Script: verificar_desactivacion.py; contraseña por variable de entorno ACL_TEST_PASSWORD. Resultado: resultado_desactivacion.json.

Cambio local pendiente de publicación. No necesita una migración nueva.
