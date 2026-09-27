---
name: auth-manual
description: Autenticacion a mano sobre Postgres con Argon2id y sesiones persistidas - sin NextAuth ni Auth.js. Usar al implementar o revisar registro, login, logout, cambio de contrasena, tabla sesiones, cookie de sesion, proteccion CSRF, o el bloqueo por intentos fallidos. Contiene los parametros exactos que el spec exige.
allowed-tools: Bash(openspec:*), Read, Edit, Write, Grep, Glob
license: MIT
metadata:
  appliesTo: "change 010-auth"
---

# Autenticacion a mano

## Por que no hay libreria

Este proyecto **no** usa NextAuth, Auth.js, Clerk ni Lucia. La autenticacion se
implementa a mano sobre Postgres con `@node-rs/argon2`.

La razon es operativa, no estetica: Vercel serverless **no conserva memoria
entre invocaciones**. Cualquier sesion en memoria, cookie firmada sin store, o
cache en el serverless pierde el estado entre requests. Por eso las sesiones
viven en una tabla.

El modelo de datos ya esta completo en `modelo.puml` (entidad `sesiones`).
Esta skill es el *como*; el *que* esta en `openspec/specs/autenticacion/spec.md`.

## Tabla `sesiones`

Tres detalles que no se deducen del nombre de las columnas:

| Columna | Regla |
|---|---|
| `token_hash` | Guarda el **hash**, nunca el identificador en claro. Si perdes la base, perdes las sesiones; eso es intencional. |
| `token_proteccion` | Caduca **con la sesion**. No se reutiliza entre sesiones distintas. |
| logout | **Elimina la fila.** No hay columna de revocacion, y no debe agregarse. |

Al hacer logout se borra la fila. La sesion deja de existir; no queda registro.

## El token de proteccion es el CSRF

`token_proteccion` + `token_proteccion_expira` son la defensa contra CSRF de
todo mutador. No es un extra opcional: es el mecanismo.

Se entrega en la respuesta de login y debe viajar en un header, **no** en la
cookie de sesion. La cookie de sesion es `httpOnly`; si el token de proteccion
tambien fuera `httpOnly`, el cliente no podria leerlo y no podria enviarlo.

## Cookie de sesion

```
httpOnly   -> true      (inaccesible desde JS: defense contra XSS)
sameSite   -> 'lax'     (el default correcto para la mayoria de la app)
secure     -> true      (en produccion)
path       -> '/'
```

## Bloqueo por intentos

```
5 intentos fallidos  -> bloquea 60 segundos
```

Al quinto fallo, `bloqueado_hasta = now() + 60s`. El contador **se reinicia tras
un login exitoso**. Sin ese reset, un usuario que falla cinco veces y despues
acierta sigue con el contador intacto.

El campo es `bloqueado_hasta`, no un contador permanente: se compara contra
`now()` en cada intento.

## Contrasena

**Minimo 6 caracteres, no 8.** El spec pide 6. Si pones 8, estas rompiendo un
requisito explicito de `autenticacion`.

Argon2id con parametros parametricos, no hardcodeados.

## `nombre_usuario` es case-insensitive

El spec exige insensibilidad a mayusculas. Postgres tiene `UNIQUE` sensible, asi
que hace falta un **indice unico funcional**:

```sql
create unique index usuarios_nombre_usuario_lower
  on usuarios (lower(nombre_usuario));
```

Con esto `Alex` y `alex` chocan. Con un `UNIQUE` normal coexisten, y el login se
vuelve ambiguo.

Buscar siempre con `lower(nombre_usuario) = lower($1)`, nunca con `=`.

## Procedimiento de implementacion

1. Leer la capacidad: `openspec show autenticacion --type spec`
2. Crear la migracion de `usuarios` y `sesiones` con los indices de arriba
3. Verificar el hash: Argon2id nunca es reversible, y el campo de la tabla es
   texto plano en longitud fija, no `numeric`
4. El registro **crea la cartera inicial** en la misma transaccion
5. Toda escritura de `sesiones` incluye `expires_at`; toda lectura filtra por
   `expires_at > now()`

## Al revisar codigo

- [ ] No aparece NextAuth, Auth.js, Clerk ni Lucia en dependencias
- [ ] `token_hash` es un hash, no el token en claro
- [ ] `token_proteccion` viaja en header, no en la cookie de sesion
- [ ] Cookie: `httpOnly`, `sameSite`, `secure` en produccion
- [ ] Bloqueo a los 5 intentos, 60 segundos, reinicio tras exito
- [ ] Contrasena: minimo 6, no 8
- [ ] Existe el indice unico funcional sobre `lower(nombre_usuario)`
- [ ] El login busca con `lower(nombre_usuario) = lower($1)`
- [ ] Logout **borra** la fila; no hay columna de revocacion
- [ ] Toda lectura de sesion filtra `expires_at > now()`

## Fuente

`openspec/specs/autenticacion/spec.md` (7 requisitos, 23 escenarios) y
`modelo.puml`. **El spec manda**: si el codigo discrepa, se corrige el codigo.
