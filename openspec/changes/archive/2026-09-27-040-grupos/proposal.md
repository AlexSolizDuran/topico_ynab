# Proposal

## Why

`020-carteras` dio el contenedor y `030-cuentas` los lugares fisicos del dinero. Falta
la categoria que hace legibles los sobres: el grupo.

Es la capacidad mas corta del sistema —3 requisitos— y tambien la que mejor define el
caracter del proyecto: **un grupo no tiene presupuesto**. No es una bolsa con saldo, es
una etiqueta que pliega, ordena y suma. Por eso el requerimiento dice que su total se
**calcula**, y la consecuencia tecnica es que la tabla `grupos` tiene seis columnas y
ninguna de dinero.

## What Changes

- Crea `grupos` con `cartera_id`, `nombre`, `archivado`, `orden` y `creado_en`. **Sin
  columna de total ni de padre**, y hay pruebas que fallan si aparecen.
- Un nombre unico por cartera, con el mismo criterio que `carteras` y `cuentas`.
- Archivar un grupo **no toca sus sobres**: no hay precondicion de saldo, porque un
  grupo no tiene saldo que preconditionar. Es lo que el requerimiento pide y lo que la
  ausencia de aritmetica en el repositorio hace inevitable.
- Archivar y restaurar son reversibles, y archivar dos veces se rechaza.
- Plegar y desplegar un grupo es estado del cliente, no una peticion al servidor.
- **Siete de los diez escenarios quedan diferidos a `050-sobres`**, con el motivo
  escrito. Ver Design.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Los 3 requisitos de `grupos` ya estan escritos y no cambian.

## Impact

- **Codigo nuevo**: `src/db/tablas/grupos.ts`, `src/repos/grupos.ts`,
  `src/grupos/validacion.ts`, `src/grupos/acciones.ts`, `src/components/grupos.tsx`
- **Migracion nueva**: `drizzle/0002_grupos.sql`
- **Modificado**: `src/db/schema.ts`, `src/app/(app)/cartera/[cartera]/page.tsx` — la
  pagina de cartera suma la seccion de grupos
- **Modificado**: `tests/helpers/pg.ts` y `tests/arnes-pg.test.ts` — la migracion
  `0002` hizo visible que el arnes ordenaba el **contenido** del `.sql` y no su
  **nombre**. Ordenaba bien por casualidad, y `0002_grupos.sql` empieza con
  `CREATE TABLE "grupos"`, que en orden alfabetico va antes que el
  `CREATE TABLE "cuentas"` de `0001`. Corregido: se ordena por nombre, y hay una prueba
  que lo verifica.
