# Proposal

## Why

`060-transacciones` creo `grupos_transferencia` y `movimientos.transferencia_id`, y
garantizo la cascada de borrado entre patas. Tambien dejo escrito, en el propio codigo,
que el formulario de traspaso no entra en ese change. El resultado es un esquema sin
consumo: la columna existe, el indice parcial existe, la cascada esta probada, y
`registrarMovimiento` **rechaza** `tipo = 'traspaso'` con `TraspasoNoRegistrable`.

O sea que hoy la app no puede mover dinero de una cuenta a otra. Es el hueco mas visible
que queda del dominio, y es el que bloquea a `080-recurrencias`, que materializa
movimientos y necesita poder pagar una cuota desde una cuenta a otra.

`traspasos` son 4 requisitos y 15 escenarios: el alta del par de patas, la pata unica con
aviso, la prohibicion entre carteras, la reactivacion de la cuenta de destino, y el pago
del adeudo de una tarjeta.

## Correccion de spec previa a este change

Al proponer `070` aparecieron **tres contradicciones aritmeticas dentro de
`openspec/specs/traspasos/spec.md`** que no se pueden cumplir a la vez. Se resolvieron
editando el spec principal de forma directa, segun la regla 1 del repo ("el spec manda
sobre el codigo"), y **antes** de escribir este change. `openspec validate --specs
--strict` pasa con las 12 capacidades y el conteo se mantiene en 4 requisitos y 15
escenarios.

1. **R1 contra R3.** R1 exige permitir un traspaso de una sola pata. R3 decia que un
   traspaso no altera ni el dinero suelto ni el patrimonio, con el escenario "el
   patrimonio no cambia por cualquier importe". Una pata sola mueve `sum(saldos)` por el
   importe, asi que las dos no pueden ser ciertas a la vez.
   **Decidido: se acota R3 a los traspasos emparejados.** La neutralidad se exige solo
   cuando el grupo tiene las dos patas. Una pata unica si mueve el dinero suelto y el
   patrimonio, y R1 exige ahora que el aviso diga eso. El escenario nuevo "Una pata sola
   si mueve el dinero suelto" compensa en el conteo el ajuste del WHEN de "El patrimonio
   no cambia", que pasa a exigir las dos patas.
2. **R4 contra R3, y R4 contra si mismo.** R4 pedia "decrementar el dinero suelto en la
   magnitud de la deuda que salda", y al mismo tiempo que "la deuda queda saldada". Son
   mutuamente excluyentes: con la formula implementada, `dinero_suelto = sum(saldos) -
   sum(disponibles)`, saldar una deuda es un traspaso de dos patas, `sum(saldos)` no se
   mueve, y por lo tanto el dinero suelto tampoco.
   **Decidido: el pago de tarjeta es neutro.** Se elimino la clausula del decremento y el
   escenario "El pago reduce el dinero suelto". La formula no se toca, que es lo que
   sostiene la invariante de `050-sobres` y `060-transacciones`.
3. **Editar una pata.** `060` dejo la decision abierta en su `design.md` D6 y rechazo
   editar cualquier pata. Como `070` si crea las patas, la limitacion seria alcanzable.
   **Decidido: reescribir el grupo en espejo.** Editar una pata ajusta la opuesta en la
   misma instruccion. Cumple `transacciones` R5, que dice que se puede editar cualquier
   dato de un movimiento.
4. **Entre carteras.** `PREGUNTAS.md` #1 quedo abierta.
   **Decidido: prohibicion total**, sin importar que compartan moneda. Se registro en
   `PREGUNTAS.md` como confirmada, no provisional.

## What Changes

- Repositorio de traspasos: alta del **grupo y sus patas en una sola transaccion**, con
  las dos filas recibiendo el mismo `transferencia_id` y el `monto` con el signo que
  corresponde a cada lado.
- **La cartera no se acepta como parametro** para cada pata: se cruza
  `cuentas -> carteras -> usuarios`, igual que en `060`. Las dos cuentas tienen que ser de
  la misma cartera, y la comprobacion vive en el mismo `where` que exige la pertenencia.
- **Pata unica permitida, con aviso** que nombra el efecto sobre el dinero suelto y el
  patrimonio, ahora exigida por R1.
- **Prohibicion total entre carteras**, con error propio, distinto del de "no existe".
- **Reactivacion de la cuenta de destino** cuando el traspaso entra en una cuenta
  archivada. `reactivarCuenta` ya existe desde `030-cuentas`; `070` la invoca.
- **Edicion en espejo**: editar una pata reescribe la opuesta en la misma instruccion, y
  un traspaso de una pata sigue siendo editable.
- **Ningun sobre, en ninguna pata.** `disponibleDeSobre` ya excluye `tipo = 'traspaso'`,
  asi que la exclusion del disponible es del derivado, no una resta: R2 se cumple sin
  tocar la aritmetica.
- **Sin importe minimo**, aplicando la decision de `060` D9.
- Entrada y vista: Server Actions con sesion y token de proteccion, y el formulario de
  traspaso en la pagina de cartera.
- **Mapa de trazabilidad de los 15 escenarios**, con referencia completa
  `tests/traspasos/archivo.ts:prueba`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Los 4 requisitos de `traspasos` ya estan escritos y este change no los cambia.

Las cuatro correcciones de la seccion anterior se aplicaron **directamente sobre
`openspec/specs/traspasos/spec.md`**, no como delta de este change: el comportamiento
correcto ya esta en el spec principal antes de empezar a implementar. Por eso el change
declara `skip_specs: true` y no genera `specs/`.

## Impact

- **Repositorio nuevo**: `src/repos/traspasos.ts`, `src/repos/errores-traspasos.ts`.
- **Entrada y vista**: `src/traspasos/validacion.ts`, `src/traspasos/acciones.ts`,
  `src/components/traspasos.tsx`.
- **Modificado**: `src/repos/movimientos.ts` (el alta de una pata simple se extrae para que
  `registrarTraspaso` la reuse en la misma transaccion),
  `src/repos/errores-movimientos.ts` (`TraspasoNoRegistrable` pasa a ser el error del
  alta simple, no del dominio), `src/app/(app)/cartera/[cartera]/page.tsx`,
  `src/components/transacciones.tsx` (el tipo `traspaso` deja de ofrecerse en el alta
  simple, que ya no puede aceptarlo).
- **Sin migracion**: `grupos_transferencia` y `transferencia_id` ya estan en
  `drizzle/0004_transacciones.sql` desde `060`.
- **Pruebas**: `tests/traspasos/{escenarios,traspasos,validacion,acciones,pagina}.test.ts`.
