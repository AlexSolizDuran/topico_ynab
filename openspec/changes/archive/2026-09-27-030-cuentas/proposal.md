# Proposal

## Why

`openspec/specs/cuentas/spec.md` define el segundo almacen del dinero: los lugares
fisicos donde el usuario tiene o debe dinero. `020-carteras` dio el contenedor, pero
sin cuentas no hay donde contabilizar nada.

Esta capacidad es la primera que mete **dinero de verdad**, y trae la regla central del
dominio: **el saldo no se almacena**. Se deriva de `saldo_inicial + sum(movimientos
.monto)`. De ahi sale casi todo lo demas de la capacidad, incluida la deuda de las
tarjetas, el archivado en cero y la reactivacion automatica.

## What Changes

- Crea `cuentas` con nombre unico por cartera, tipo de cuatro valores y
  `saldo_inicial numeric(16,2)`. **Sin columna `saldo`**, y hay una prueba que falla si
  alguien la agrega.
- Crea tambien `movimientos`, aunque `060-transacciones` sea su dueña, porque el
  requerimiento de saldo no se cumple sin la tabla de la que se deriva. Explicado en
  Impact.
- Deriva el saldo en SQL y lo devuelve como `string`. Toda la aritmetica vive en
  Postgres.
- Trata la cuenta de credito como deuda: el signo lo lleva el movimiento, y una
  corriente negativa se muestra igual que una tarjeta.
- Edita nombre y orden conservando saldo e historial, y **prohíbe cambiar el tipo** de
  una cuenta con movimientos.
- Archiva solo en cero, y reactiva sola cuando entra un movimiento.
- Aísla por `usuario_id` + `cartera_id` en cada lectura y escritura, incluida la
  lectura del saldo.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Los 6 requisitos de `cuentas` ya estan escritos y no cambian.

## Impact

- **Codigo nuevo**: `src/db/tablas/cuentas.ts`, `src/repos/cuentas.ts`,
  `src/cuentas/validacion.ts`, `src/cuentas/acciones.ts`,
  `src/app/(app)/cartera/[cartera]/page.tsx`, `src/components/cuentas.tsx`
- **Migracion nueva**: `drizzle/0001_flawless_pete_wisdom.sql`
- **Vistas nuevas**: `/cartera/[cartera]`, a la que entra desde la lista de carteras
- **Por que `movimientos` se crea aca**: mismo motivo por el que `010-auth` creo
  `carteras`. El saldo derivado necesita la tabla de la que se deriva, y esperar a
  `060` dejaria cuatro de los seis requisitos de `cuentas` sin comportamiento real.
  `060-transacciones` agrega el comportamiento —crear, editar, eliminar, clasificar,
  su UI— sobre esta tabla ya existente. `movimientos.sobre_id` queda sin FK a proposito:
  `050-sobres` la agrega en su migracion, cuando la tabla exista.
- **Se corrigio `0001` en el sitio**: el SQL generado por drizzle-kit salia sin los
  `CREATE TYPE` de los tres enums, asi que las pruebas fallaban con
  `type "tipo_cuenta" does not exist`. Editar una migracion esta prohibido **cuando ya
  corrio en un entorno**; esta nunca corrio en ninguno, solo en PGlite efimero, que se
  tira en cada prueba. Por eso se corrijo en el sitio y no con una migracion nueva: una
  `0002` con los tipos llegaria despues de un `CREATE TABLE` que ya los referencia, y
  Postgres no lo permite.
