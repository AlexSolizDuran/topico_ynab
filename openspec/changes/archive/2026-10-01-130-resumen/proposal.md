# Proposal

## Why

El panel y los comparativos miran una sola cartera a la vez. El usuario no tiene ninguna vista que reuna todas sus carteras. Se agrega la capacidad `resumen`: una vista global y de solo lectura que agrupa por moneda el capital, el flujo del periodo, la evolucion mensual y anual, el gasto diario y los principales comercios.

Como no hay conversion de moneda, la vista nunca suma monedas distintas: cada moneda es un grupo independiente, y el usuario elige cual mira. Agrupar por moneda es lo que hace que "todo el capital" y "todo el gasto" sean cifras honestas en vez de una suma entre divisas que no existe.

`resumen` abarca 9 requisitos y 16 escenarios:
1. `El resumen agrupa por moneda y nunca mezcla monedas` (3)
2. `El resumen muestra el capital por moneda` (2)
3. `El resumen muestra el flujo del periodo` (2)
4. `El resumen muestra la evolucion mensual` (2)
5. `El resumen muestra la evolucion anual` (1)
6. `El resumen muestra el gasto diario del periodo` (1)
7. `El resumen desglosa el capital por cartera` (2)
8. `El resumen lista los principales comercios del periodo` (1)
9. `El resumen es de solo lectura` (2)

## What Changes

1. **Repositorio de agregacion (`src/repos/resumen-global.ts`):**
   - `consultarResumenGlobal(db, usuario_id, periodo, meses)`: lectura de solo lectura sobre todas las carteras del usuario, agrupada por moneda.
   - Por moneda: capital (patrimonio, en sobres, sin asignar) al cierre del periodo, flujo del periodo (ingresado, gastado, neto), serie mensual de 12 puntos, acumulado por anio, gasto diario del periodo, y principales comercios.
   - Los traspasos no cuentan como ingreso ni como gasto.
   - Aritmetica de dinero exacta en SQL y consolidacion en `bigint`; nunca `number`.

2. **Componentes de la vista (`src/components/resumen.tsx` + `src/components/resumen.module.css`):**
   - `VistaResumen`: pestanas de moneda cuando hay mas de una, cifras de capital y flujo, desglose por cartera (marcando archivadas), series mensual y anual, barras de gasto diario y tabla de comercios.
   - El unico control propio es el filtro de periodo, un formulario GET que no modifica datos.

3. **Pagina (`src/app/(app)/resumen/page.tsx`):**
   - Server Component que exige sesion (redirige a `/entrar`) y al menos una cartera (redirige a `/carteras`); resuelve el periodo desde `?mes`.

4. **Navegacion (`src/components/navegacion.tsx`):**
   - Enlace nuevo `/resumen` entre Panel y Carteras.

5. **Spec (`openspec/specs/resumen/spec.md`):**
   - Capacidad nueva #13, validada con OpenSpec.

6. **Pruebas (`tests/resumen/`):**
   - `repositorio.test.ts`: agrupacion por moneda, sin mezcla entre divisas, series mensual y diaria y comercios.
   - `vista.test.tsx`: render de las cifras y de la condicion de solo lectura.
