# Design

## Context

Ver **proposal.md — Why** para la motivacion. La restriccion que condiciona el
diseno no es de negocio sino operativa: Vercel serverless no conserva memoria
entre invocaciones, asi que el estado de sesion no puede vivir en memoria ni en
una cookie firmada sin store. De ahi que `sesiones` sea una tabla.

`modelo.puml` ya fija las dos entidades, sus columnas y sus notas. Ver la skill
`auth-manual`.

## Goals / Non-Goals

**Goals:**

- 7 requisitos y 23 escenarios de `autenticacion` cumplidos y verificados.
- Que ningun metodo de repositorio pueda leer o escribir sin `usuarioId`.
- Que un intento de leer datos ajenos responda igual que un identificador
  inexistente.

**Non-Goals:**

- Recuperacion de contrasena. Esta fuera de alcance y ningun requisito la pide.
- Un selector de cartera en la sesion. Lo agrega `110-panel`.
- RLS. El aislamiento es por capa de aplicacion, por decision consciente.

## Decisions

### Argon2id con parametros configurables, minimo 6 caracteres

`@node-rs/argon2` con `algorithm: argon2id` y parametros explicitos en un solo
modulo, para poder subirlos sin tocar el resto del codigo.

El minimo es **6**, no 8, porque `autenticacion` R1 y R5 piden 6. Poner 8 rompe
un requisito explicito.

### El identificador de sesion se guarda hasheado

`sesiones.token_hash` guarda el SHA-256 del identificador, no el identificador. La
cookie lleva el identificador en claro; el servidor lo hashea y busca por el
hash. Si se pierde la base, se pierden las sesiones: es el comportamiento
deseado, no un accidente.

`token_proteccion` tambien se guarda hasheado, por el mismo motivo. Se entrega
al cliente una sola vez, al iniciar sesion, y nunca vuelve a salir del servidor.

### El token de proteccion viaja en su propia cookie, no en la de sesion

El token de proteccion es un doble submit: el navegador lo envia automaticamente
y el servidor lo compara con el hash guardado en `sesiones`. Tiene que ser
**legible por el cliente**, asi que va en una cookie propia con
`httpOnly: false`; si compartiera cookie con la de sesion, esa cookie tendria que
ser legible y se perderia la defensa contra XSS que `La sesion esta endurecida`
exige.

Es una cookie separada, con su propio nombre: la de sesion sigue siendo
`httpOnly`. El token tambien se acepta en el header `x-token-proteccion`, que es
lo que consumiran los clientes que no dependan de cookies.

Se descarta: mandarlo como header unicamente. En App Router, un `<form
action={serverAction}>` no permite agregar headers sin JavaScript, y la app
funcionaria solo con JS activo. La cookie conserva el envio automatico y hace
que cada mutacion quede protegida aunque el cliente no corra script.

### El bloqueo por intentos vive en `usuarios`

`intentos_fallidos` y `bloqueado_hasta` estan en `usuarios`, no en una tabla
aparte. El limite es por cuenta, no por IP ni por sesion: es lo que el
especificacion describe, y una tabla por IP exigiria limpiar y protege un
atributo que nadie consulta.

La comparacion es `bloqueado_hasta > now()` en cada intento. Al quinto fallo se
fija `bloqueado_hasta = now() + 60s` y el contador se reinicia tras un inicio de
sesion exitoso; sin ese reset, un usuario que falla cinco veces y despues
acierta queda con el contador intacto.

### La pertenencia se exige en la firma, no en el where

Sin RLS, la unica frontera de seguridad es el repositorio. Por eso `usuarioId` y
`carteraId` son **parametros obligatorios** de todo metodo que toque datos
financieros, y no una opcion dentro de un objeto de filtros: un metodo que
acepta solo un identificador es un bug, no una excepcion.

Cuando la pertenencia no se puede verificar, la respuesta es la de un recurso
inexistente. Distinguir "no existe" de "es de otro" convierte la aplicacion en
un oraculo de que identificadores existen.

### La cartera inicial se crea en la misma transaccion

`carteras` R1 exige que el usuario tenga al menos una cartera desde el registro.
Crear el usuario y la cartera por separado deja la posibilidad de un usuario sin
contenedor valido si la segunda falla. Se crean juntas, y el nombre por defecto
es el nombre del usuario.

La tabla `carteras` la define `020-carteras` en detalle; aqui solo se crea con las
columnas necesarias para cumplir este requisito.

## Risks / Trade-offs

- **Cookie de proteccion legible desde el cliente** → si un XSS logra ejecutar
  script, tambien lee el token. Mitigacion: `token_proteccion` caduca con la
  sesion y no sirve fuera de ella, `token_hash` se compara en cada mutacion, y el
  cierre de sesion elimina la fila, que invalida el token. El daño de un XSS se
  limita a la sesion del usuario que lo sufra, no a la de otro.
- **El bloqueo vive en la fila del usuario** → un atacante puede agotar los
  intentos de otra cuenta y bloquearla 60 segundos. Es aceptable en un MVP con
  5 intentos y una ventana de 1 minuto, y es lo que el especificacion pide.
  Levantar el limite o hacerlo por IP es una mejora posterior, no un defecto.
- **Argon2id es costoso a proposito** → en serverless, un millisegundo de CPU se
  paga por invocacion. Es el costo de no.store contrasenas reversibles.
- **PGlite en las pruebas y Neon en produccion** → una divergencia de version de
  Postgres pasaria inadvertida. Se mitiga limitandose a las construcciones que el
  proyecto ya necesita: `numeric`, `enum`, indices funcionales e indices parciales.
