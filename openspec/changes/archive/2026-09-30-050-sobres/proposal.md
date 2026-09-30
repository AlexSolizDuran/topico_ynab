# Proposal

## Why

`020-carteras` dio el contenedor, `030-cuentas` los lugares fisicos del dinero y
`040-grupos` la etiqueta que los ordena. Falta la pieza que hace que esto sea
presupuesto y no un libro de cuentas: **el sobre**.

Es la capacidad mas grande del sistema hasta ahora —11 requisitos y 37 escenarios— y
la que fija la aritmetica que el resto hereda. Si el disponible se guardara como
columna, `patrimonio`, `comparativos` y `panel` nacen equivocados y no hay forma
barata de arreglarlo despues. Por eso el requerimiento dice que el disponible **se
calcula y nunca se almacena**, y la consecuencia tecnica es que la tabla `sobres` no
tiene columna de disponible.

Ademas absorbe **los siete escenarios que `040-grupos` difirio** con el motivo
escrito: sobres que se crean, se mueven, un total que se suma y un grupo que se
pliega. `040` los dejo explicitamente para este change, y `tests/grupos/escenarios.test.ts`
falla si alguno sigue diferido sin que este change lo mueva de `DIFERIDOS` a `MAPA`.

## What Changes

- Crea `sobres` (`cartera_id`, `grupo_id`, `nombre`, `archivado`, `orden`,
  `eliminado_en`) y `asignaciones` (`sobre_id`, `periodo`, `motivo`, `monto`). El enum
  `motivo_de_asignacion` distingue `usuario` de `reasignacion`.
- **El disponible se deriva en SQL** y no es una columna. Hay una prueba que recorta
  el schema y falla si aparece `disponible`, igual que `040` impedia que apareciera
  `total` en `grupos`.
- **El disponible se acumula entre periodos**: nada se reinicia en el cambio de mes.
- Asignar es siempre positivo. El gasto que excede lo asignado es un movimiento, y
  el sistema **no lo impide** ni lo compensa solo.
- Mover dinero entre sobres usa una asignacion negativa con `motivo = 'reasignacion'`
  en el origen, y no un par de movimientos. Es la decision que sostiene el requisito
  *"mover ni crea ni destruye dinero"*: los movimientos se inaplican a cuentas, y
  aplicarlos moveria el patrimonio de la cartera. Un gasto y un ingreso que se
  cancelan dan el mismo disponible de un sobre, pero tocan saldos de cuenta.
- Tapar un desborde es una asignacion. Parcial o total, y rechaza tapar mas de lo
  que el sobre debe.
- Archivar exige disponible `0` en el periodo que manda el formulario. Borrar es
  distinto: solo sin movimientos, y es definitivo. Con saldo o con movimientos, se
  archiva.
- Un sobre archivado **acepta devoluciones** y se vuelve a ver. Un archivado en
  negativo sale en el panel de desbordes, porque R11 pide que siga visible.
- Añade `totalDeGrupo` al repositorio de grupos y el total por grupo a la pagina, con
  el total **fuera** del desplegable: al plegar se ocultan los sobres, no la cifra.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Los 11 requisitos de `sobres` ya estan escritos y no cambian, y los siete
escenarios de `grupos` que este change absorbe tambien existen: no hay comportamiento
nuevo que definir, solo que materializar. Por eso el change declara `skip_specs: true`.

## Impact

- **Tablas nuevas**: `src/db/tablas/sobres.ts`; migracion `drizzle/0003_sobres.sql`.
- **Repositorios nuevos**: `src/repos/sobres.ts`, `src/repos/asignaciones.ts`,
  `src/repos/dinero-suelto.ts`, `src/repos/errores-asignaciones.ts`,
  `src/repos/fragmentos.ts`, `src/repos/filas.ts`.
- **Modificado**: `src/repos/grupos.ts` (gana `totalDeGrupo`), `src/carteras/saldos.ts`
  y `src/repos/dinero-suelto.ts` (pasan a las formulas de `fragmentos.ts`),
  `src/app/(app)/cartera/[cartera]/page.tsx`, `tests/cuentas/pagina.test.ts`.
- **Vista y entrada**: `src/sobres/validacion.ts`, `src/sobres/acciones.ts`,
  `src/components/sobres.tsx`.
- **Pruebas**: `tests/sobres/{sobres,dinero-suelto,pagina}.test.ts`, y el mapa de
  trazabilidad de `tests/grupos/escenarios.test.ts`.

### Nota sobre el orden

Este change se escribio **despues** de implementar. El codigo existia cuando se
redactaron estos artefactos, y eso quedo registrado en `design.md` con los cuatro
defectos que las pruebas encontraron y que el diseno inicial no previa. El ciclo
normal —`new change`, propose, revision humana, apply— se respeta desde
`060-transacciones`.
