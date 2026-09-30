# Proposal

## Why

`030-cuentas` creo la tabla `movimientos` y `050-sobres` escribio la aritmetica
derivada que la lee, pero **no hay forma de escribir un solo movimiento**. El saldo de
una cuenta y el disponible de un sobre se derivan de una tabla que nadie puede
llenar: hoy la app no registra ni un gasto. Es el hueco que separa un presupuesto de
una lista de intenciones.

`transacciones` es lo que cierra ese hueco, y es la ultima pieza grande del dominio
antes de las que ya son solo lectura (`patrimonio`, `panel`, `comparativos`). Son 10
requisitos y 33 escenarios: el CRUD completo, con edicion, borrado logico,
restauracion, filtros y busqueda.

Ademas es el change que **desbloquea a los demas**. `080-recurrencias` materializa
movimientos, `070-traspasos` los agrupa en parejas, `110-panel` los lee por periodo, y
`120-comparativos` los agrega por mes. Ninguno de los cuatro se puede escribir sin esta
tabla ya servida por un CRUD.

## What Changes

- Repositorio de movimientos: alta, busqueda, edicion, borrado logico y restauracion.
  El borrado es logico —`eliminado_en`— y por eso **no hay operacion de recalculo**:
  los derivados se vuelven a leer y basta.
- **La cartera no se acepta como parametro.** R10 exige deducirla de la cuenta, asi que
  `registrarMovimiento` recibe `usuario_id` y cruza `movimientos -> cuenta_id -> cuentas
  -> carteras -> usuarios` en cada lectura y cada escritura.
- **Asignar y quitar sobre a un movimiento es cambiar un unico `sobre_id`.** El saldo de
  la cuenta no se toca —R3 dice explicitamente que no cambia— porque el dinero ya se
  movio al registrarse. Los dos derivados se mueven solos porque los dos son sumas.
- Alta, edicion y baja con **fecha de un periodo ya cerrado**: permitido, y con aviso de
  que ese periodo y los siguientes cambian. No hay un solo dato guardado que
  recalcular, porque el periodo se deriva de la fecha.
- Filtros combinados y busqueda por texto sobre descripcion y comercio, con "sin filtros
  activos" cuando ninguno hay.
- **Esqueleto de traspasos, no traspasos.** Se crea `grupos_transferencia` y
  `movimientos.transferencia_id` —el esquema que `modelo.puml` declara y que la base no
  tiene—, y el borrado de una pata arrastra a las demas. **La pantalla de traspaso no
  entra**: es de `070-traspasos`, y acui solo se acepta el tipo y se garantiza la cascada.
- **Correcir el comentario de `src/repos/fragmentos.ts:41-43`**, que describe un traspaso
  entre carteras que `traspasos` R1 **rechaza** y que `PREGUNTAS.md` #1 da por cerrado
  asi. Hoy induce a error justo al escribir el codigo de traspasos.
- Mapa de trazabilidad de los 33 escenarios, con la referencia completa
  `tests/transacciones/archivo.ts:prueba`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Los 10 requisitos de `transacciones` ya estan escritos y no cambian, y el
esqueleto de traspasos no altera `traspasos` R1 ni R2: la pantalla de traspaso sigue
siendo de `070-traspasos`. Por eso el change declara `skip_specs: true`.

## Impact

- **Tablas nuevas**: `grupos_transferencia` (`id`, `descripcion`, `fecha`, `creado_en`).
- **Columna nueva**: `movimientos.transferencia_id`, nullable, con FK y `on delete
  cascade`.
- **Migracion**: `drizzle/0004_transacciones.sql`. No hay `drizzle/meta/`: el orden lo
  da el prefijo numerico y lo aplica `tests/helpers/pg.ts`.
- **Repositorio nuevo**: `src/repos/movimientos.ts`, `src/repos/errores-movimientos.ts`.
- **Entrada y vista**: `src/transacciones/validacion.ts`,
  `src/transacciones/acciones.ts`, `src/components/transacciones.tsx`.
- **Modificado**: `src/db/tablas/cuentas.ts` (la columna y la FK),
  `src/app/(app)/cartera/[cartera]/page.tsx` (historial y filtros),
  `src/repos/cuentas.ts` (listar movimientos de una cuenta), `src/repos/fragmentos.ts`
  (el comentario).
- **Pruebas**: `tests/transacciones/{escenarios,movimientos,validacion,acciones,pagina}.test.ts`.

### Decisiones tomadas al proponer

Las tres quedaron confirmadas con el usuario y se detallan en `design.md`:

1. **Solo el esqueleto de traspasos.** `transacciones` R1 dice "distinguir" el tipo;
   `traspasos` R1 dice "registrar las dos patas". La primera es de acui, la segunda de
   `070`.
2. **El comentario de `fragmentos.ts` se corrige en este change**, no se solo se
   documenta.
3. **Una devolucion es el efecto neto del par, no una excepcion al saldo.** R4 dice que
   "no modifica el patrimonio ni el dinero suelto"; `dinero_suelto` si queda igual,
   pero `patrimonio` —que es `sum(saldos)`— sube 200 al registrar el reembolso, porque
   el dinero vuelve a la cuenta. Se implementa la devolucion como `ingreso` positivo con
   `sobre_id`, sin tipo nuevo. Ver D3 en `design.md`.
