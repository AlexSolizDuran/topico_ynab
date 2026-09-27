# Proposal

## Why

`openspec/specs/carteras/spec.md` define la cartera como entidad raiz: es el
contenedor que posee cuentas, sobres, grupos y movimientos, y el que fija la
moneda de todo su contenido. `010-auth` creo la tabla y la cartera inicial del
registro, pero no el comportamiento: crear carteras, editarlas, archivarlas, ni las
reglas que las aisan.

Sin estas reglas, las otras nueve capacidades no tienen sobre que escriba: cada
una empieza exigiendo `cartera_id`, y aqui se define quien puede usar ese id.

## What Changes

- Materializa **Cada usuario tiene al menos una cartera**: la cartera inicial del
  registro ya se crea en `010-auth`; aqui se completa el acceso exclusivo, negando
  la operacion cuando la cartera pertenece a otro usuario.
- Materializa **Cada cartera tiene una moneda que aplica a todo su contenido**:
  la moneda se fija al crear y **no se puede cambiar**, con un error que explica
  que solo puede definirse al crear. Las carteras de distinta moneda se
  presentan por separado y el sistema no calcula ningun total combinado.
- Materializa **Una cartera es propietaria de sus cuentas y sobres**: crea el
  helper que deduce la cartera de un movimiento a partir de su cuenta, y la regla
  que rechaza mezclar una cuenta de una cartera con un sobre de otra.
- Materializa **No se puede mover dinero entre carteras de distinta moneda**:
  la comparacion de monedas es unica y la comparten `070-traspasos` y
  `080-recurrencias`.
- Materializa **El usuario crea, edita y archiva carteras**, con la vista de
  lista de carteras y su formulario.
- **Archivar exige vaciar antes**: la precondicion de saldo cero se implementa en
  `050-sobres`, no aca. La razon esta al final de Impact.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Los 5 requisitos de `carteras` ya estan escritos y no cambian.

## Impact

- **Codigo nuevo**: `src/repos/carteras.ts` se completa con el comportamiento
  faltante; `src/carteras/validacion.ts`; `src/carteras/acciones.ts`;
  `src/app/(app)/carteras/page.tsx`; `src/components/carteras.tsx`
- **Vistas nuevas**: `/carteras`, la primera pantalla despues de entrar
- **Sin migracion nueva**: la tabla `carteras` ya existe con todas sus columnas,
  creada en `010-auth` porque el registro la necesita. Agregar columnas despues
  seria una segunda migracion sin motivo.
- **Fuera de este change, a proposito**: la comprobacion de que cuentas y sobres
  esten en cero antes de archivar. `carteras` R5 y sus escenarios "Archivar una
  cartera vacia" y "Archivar una cartera con saldo" no tienen sentido hasta que
  existan `cuentas` y `sobres`, que son de `030-cuentas` y `050-sobres`. Se
  implementa ahi y la trazabilidad de `carteras` lo declara. Archivar sin ese
  control dejaria una cartera con saldo perdida a la vista, que es peor que
  archivar de mas; por eso el archivado queda documentado como incompleto hasta
  que `050-sobres` este aplicado.
