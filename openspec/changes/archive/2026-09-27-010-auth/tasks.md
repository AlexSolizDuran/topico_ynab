# Tasks

Cada grupo aterriza sus propias pruebas. No se acumulan al final: un fallo en el
primer grupo reencadena a todos los siguientes.

## 1. Migración y tablas

- [x] 1.1 Crear `src/db/tablas/usuarios.ts` con `usuarios`: `id`, `nombre`, `apellido`, `nombre_usuario`, `correo`, `hash_contrasena`, `activo`, `zona_horaria`, `intentos_fallidos`, `bloqueado_hasta`, `creado_en`. Verificar con `npx drizzle-kit generate` que la migración contiene la tabla
- [x] 1.2 Crear el índice único funcional `usuarios_nombre_usuario_lower` sobre `lower(nombre_usuario)` y el `UNIQUE` de `correo`, y exportarlos en `src/db/schema.ts`. Verificar con una prueba que un `UNIQUE` normal dejaría coexistir `Alex` y `alex`, y que este índice no
- [x] 1.3 Crear `src/db/tablas/sesiones.ts` con `sesiones`: `id`, `usuario_id`, `token_hash`, `token_proteccion`, `expira_en`, `creada_en`, sin columna de revocación. Verificar con una prueba que el cierre de sesión borra la fila y que no existe columna de revocación
- [x] 1.4 Correr `npx drizzle-kit generate`, aplicar las migraciones sobre PGlite y verificar con una prueba que `pg_tables` lista `usuarios` y `sesiones`. Verificar que el arnés las aplica de verdad, no que el test pasa porque no hay migraciones

## 2. Sesión: primitivas

- [x] 2.1 Crear `src/sesion/argon.ts` con `hashearContrasena` y `verificarContrasena` sobre Argon2id con parámetros configurables. Verificar con una prueba que un hash verifica con su contraseña, no con otra, y que el hash no contiene la contraseña
- [x] 2.2 Crear `src/sesion/tokens.ts` con `generarToken`, `hashearToken` y `tokenDesdeCookie`: identificador de 32 bytes aleatorios en base64url, guardado siempre como SHA-256. Verificar con una prueba que el token guardado no es el token entregado y que el hash es determinista
- [x] 2.3 Crear `src/sesion/cookies.ts` con las dos cookies: `sesion` con `httpOnly`, `sameSite: 'lax'`, `secure` en producción y `path: '/'`; `token_proteccion` sin `httpOnly` para que el cliente lo envíe, con `sameSite: 'lax'`. Verificar con una prueba que los atributos de cada una son los exigidos y que son cookies distintas

## 3. Repositorios

- [x] 3.1 Crear `src/repos/usuarios.ts` con `crearUsuario`, `buscarPorNombreUsuario` (con `lower(nombre_usuario) = lower($1)`) y `buscarPorCorreo`, todos exigiendo lo mínimo para no filtrar datos ajenos. Verificar con una prueba que la búsqueda es insensible a mayúsculas
- [x] 3.2 Crear `src/repos/sesiones.ts` con `crearSesion`, `buscarSesionVigente` (filtra `expira_en > now()`), `renovarTokenProteccion`, `eliminarSesion` (borrado de fila) y `reiniciarIntentos`. Verificar con una prueba que una sesión expirada no se encuentra y que eliminar la deja de existir
- [x] 3.3 Crear `src/repos/carteras.ts` con lo mínimo para `carteras` R1: crear la cartera inicial de un usuario. Verificar con una prueba que el registro deja al usuario con una cartera asociada
- [x] 3.4 Añadir una prueba de aislamiento que recorra las firmas de los repositorios y falle si alguna no exige `usuarioId`. Verificar que el test falla al quitar `usuarioId` de una firma

## 4. Registro

- [x] 4.1 Crear `src/sesion/validacion.ts` con el esquema de entrada de registro: nombre, apellido, nombre de usuario, correo y contraseña de al menos 6 caracteres. Verificar con pruebas los dos rechazos: contraseña corta y campos faltantes
- [x] 4.2 Implementar `registrarUsuario` en una transacción que cree `usuarios`, cree la cartera inicial y cree la `sesiones`, y rechace por duplicado de nombre de usuario o correo. Verificar con pruebas: registro exitoso con sesión iniciada, nombre de usuario duplicado por mayúsculas rechazado, correo duplicado rechazado, contraseña corta rechazada
- [x] 4.3 Crear la Server Action de registro y la vista `src/app/(sesion)/registro/page.tsx` con validación en línea de nombre de usuario y correo ya existentes. Verificar que la vista compila y que la acción devuelve los errores por campo

## 5. Inicio y cierre de sesión

- [x] 5.1 Implementar `iniciarSesion` con la búsqueda insensible a mayúsculas, la verificación de Argon2id, el identificador nuevo, el registro del intento fallido y el reinicio del contador tras el éxito. Verificar con pruebas: acceso exitoso, credenciales incorrectas, nombre de usuario con distinta capitalización, bloqueo tras 5 intentos, reinicio del contador tras un éxito, y mensaje de bloqueo
- [x] 5.2 Crear la Server Action de inicio de sesión y la vista `src/app/(sesion)/entrar/page.tsx` con estado de carga al enviar. Verificar que la acción exige token de protección válido y rechaza el ausente
- [x] 5.3 Implementar `cerrarSesion`: elimina la fila de `sesiones` y ambas cookies. Verificar con una prueba que después de cerrar, la fila no existe y el token anterior no sirve

## 6. Cambio de contraseña

- [x] 6.1 Implementar `cambiarContrasena` exigiendo la contraseña actual correcta, el mínimo de 6 caracteres en la nueva, y la renovación de la sesión para que el usuario quede autenticado con la credencial nueva. Verificar con pruebas: contraseña actual incorrecta rechazada, contraseña nueva corta rechazada, contraseña cambiada con la anterior invalidada
- [x] 6.2 Crear la Server Action y la vista `src/app/(sesion)/contrasena/page.tsx` con confirmación de que las contraseñas coinciden. Verificar que compila

## 7. Protección y aislamiento

- [x] 7.1 Implementar `exigirTokenProteccion` y aplicarlo a registro, inicio de sesión, cierre de sesión y cambio de contraseña, aceptando el token en la cookie propia o en el header `x-token-proteccion`. Verificar con pruebas: token ausente rechazado, token inválido rechazado, token válido aceptado, y token de una sesión anterior rechazado tras cerrar sesión
- [x] 7.2 Implementar `obtenerSesionActual` para las rutas de la aplicación, y proteger `/panel` redirigiendo a la pantalla de inicio de sesión. Verificar con pruebas: sin sesión la solicitud se rechaza, con sesión válida se resuelve el usuario
- [x] 7.3 Añadir la prueba de respuesta indistinguible: pedir un recurso de otro usuario responde igual que pedir un identificador inexistente. Verificar que ambos dan el mismo resultado

## 8. Verificación

- [x] 8.1 Verificar que los 23 escenarios de `autenticacion` tienen su prueba y que sus títulos coinciden con los del spec. Verificar con un conteo de `#### Scenario:` en el spec contra el de `it(` en el archivo de pruebas
- [x] 8.2 Verificar que `openspec validate --specs --strict` sigue pasando con 12 capacidades, que `npm run typecheck` no reporta errores y que `npm test` pasa completo
