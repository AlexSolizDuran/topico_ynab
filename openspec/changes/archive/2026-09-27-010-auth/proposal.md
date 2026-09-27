# Proposal

## Why

`openspec/specs/autenticacion/spec.md` describe 7 requisitos y 23 escenarios que
hoy no tienen nada que los cumpla: no existe `usuarios`, no existe `sesiones`, y
ninguna de las 11 capacidades siguientes puede aislar datos entre usuarios sin
esta base. Es la unica capacidad de la que dependen las otras once.

## What Changes

- Crea las tablas `usuarios` y `sesiones`, con el indice unico funcional sobre
  `lower(nombre_usuario)` que exige el aislamiento insensible a mayusculas.
- Materializa **El usuario se registra con datos unicos**: nombre, apellido,
  nombre de usuario, correo y contrasena de al menos 6 caracteres, rechazo de
  duplicados por nombre de usuario sin distinguir mayusculas y por correo, y
  sesion iniciada tras el registro. El registro crea la cartera inicial en la
  misma transaccion.
- Materializa **El usuario inicia sesion con nombre de usuario y contrasena**,
  con la misma insensibilidad a mayusculas y un error unico para credenciales
  incorrectas, que no revela si el nombre de usuario existe.
- Materializa **La sesion esta endurecida**: identificador nuevo en cada inicio
  de sesion, cookie inaccesible desde los scripts de la pagina, envio limitado a
  peticiones del mismo sitio, y destruccion de la sesion al cerrar sesion. El
  identificador se guarda hasheado; cerrar sesion elimina la fila, no la marca.
- Materializa **El sistema limita los intentos fallidos de inicio de sesion**:
  5 intentos consecutivos fallidos bloquean 60 segundos, el contador se reinicia
  tras un inicio exitoso, y el periodo de bloqueo se comunica al usuario.
- Materializa **El usuario cambia su contrasena**, exigiendo la contrasena
  actual, un minimo de 6 caracteres en la nueva, y dejando al usuario
  autenticado con la nueva credencial.
- Materializa **El sistema protege las operaciones que cambian estado** con un
  token de proteccion por sesion, exigido en registro, inicio de sesion, cierre
  de sesion y cambio de contrasena, y que caduca con la sesion: no se reutiliza
  entre sesiones distintas.
- Materializa **El usuario solo accede a sus propios datos** con el patron de
  aislamiento por capa de aplicacion: sin RLS, con `usuarioId` y `carteraId`
  obligatorios en la firma de cada lectura y escritura, y respuesta de recurso
  inexistente —no de recurso ajeno— cuando la pertenencia no se puede verificar.
- Agrega las vistas de inicio de sesion, registro y cambio de contrasena.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Los 7 requisitos de `autenticacion` ya estan escritos y no cambian: este
change los implementa. `carteras` exige que exista una cartera desde el
registro, y esa cartera la crea aqui, pero su comportamiento no se define aqui.

## Impact

- **Migracion**: `usuarios` y `sesiones`, con el indice unico funcional
  `usuarios_nombre_usuario_lower` y los contadores de intento fallido
- **Codigo nuevo**: `src/db/tablas/usuarios.ts`, `src/db/tablas/sesiones.ts`,
  `src/sesion/` (argon2, cookies, token de proteccion), `src/repos/usuarios.ts`,
  `src/repos/sesiones.ts`, `src/repos/carteras.ts` con la cartera inicial
- **Vistas**: `src/app/(sesion)/entrar/`, `src/app/(sesion)/registro/`,
  `src/app/(sesion)/contrasena/`
- **Dependencias**: `@node-rs/argon2`, ya instalada en `000-base`
- **Sin impacto en specs**: `openspec/specs/` no se toca
