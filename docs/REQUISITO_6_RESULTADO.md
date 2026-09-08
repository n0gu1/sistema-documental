# Requisito 6: creación con rol explícito

Verificación realizada el 7 de septiembre de 2026.

El formulario inicia con `role_id` vacío, muestra los nombres reales del catálogo
(`nombre`) y permite seleccionar un rol activo. Envía únicamente el ID elegido
en `role_ids`, conservando el contrato de la API. No usa el primer rol del catálogo
como valor automático.

`UserCreateSerializer` exige una lista no vacía de UUID. La vista de creación
comprueba que los roles existan, estén activos y pertenezcan a la organización
antes de crear el usuario. La falta de selección produce un error controlado 400.

## Pruebas ejecutadas

Se ejecutaron las vistas de creación y consulta del backend local corregido mediante
DRF APIRequestFactory, autenticado como el administrador de prueba, contra la BD Neon
configurada. No se ejecutó una prueba de navegador ni se desplegó en Render.

| Cuenta creada | Rol elegido | API | BD |
|---|---|---|---|
| req6.editor.20260907141658@test.local | EDITOR | EDITOR | EDITOR |
| req6.revisor.20260907141658@test.local | REVISOR | REVISOR | REVISOR |
| req6.lector.20260907141658@test.local | LECTOR | LECTOR | LECTOR |

Las tres altas devolvieron 201 y las tres consultas 200. Se comprobó que cada usuario
tuviera una sola asignación y que su ID coincidiera con el seleccionado. Ninguno
recibió ADMINISTRADOR. Las cuentas nuevas permanecen en la BD y requieren cambiar
la contraseña temporal al ingresar. Las cuentas originales no fueron modificadas.

Evidencia con IDs: `resultado_creacion_roles.json`.
Script: `verificar_creacion_roles.py` (requiere las dependencias del proyecto y
`ROLE_TEST_PASSWORD` en el entorno; cada ejecución crea tres cuentas nuevas).

La compilación del frontend pasó. No se ejecutaron pruebas de reasignación,
permisos, ACL ni documentos; tampoco pruebas negativas adicionales.
