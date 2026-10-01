# Tasks

9 requisitos, 16 escenarios.

## 1. Repositorio de agregacion del resumen

- [x] 1.1 `src/repos/resumen-global.ts` con tipos e interfaces (`DatosResumenGlobal`, `GrupoMoneda`, `CarteraResumen`, `ComercioResumen`, `PuntoFlujo`).
- [x] 1.2 `consultarResumenGlobal` agrupando por moneda: capital al cierre (patrimonio, en sobres, sin asignar), flujo del periodo, serie mensual de 12 puntos, acumulado anual, gasto diario y principales comercios, con aritmetica exacta en SQL y `bigint`.
- [x] 1.3 Incluir carteras archivadas y excluir traspasos del flujo.
- [x] 1.4 Pruebas del repositorio en `tests/resumen/repositorio.test.ts`.

## 2. Componentes de UI del resumen

- [x] 2.1 `src/components/resumen.tsx` con `VistaResumen`: pestanas de moneda, cifras de capital y flujo, desglose por cartera, series mensual y anual, barras de gasto diario y top comercios.
- [x] 2.2 `src/components/resumen.module.css` con los estilos propios de la pantalla.
- [x] 2.3 Pruebas de render y de solo lectura en `tests/resumen/vista.test.tsx`.

## 3. Integracion en la app

- [x] 3.1 Crear pagina `src/app/(app)/resumen/page.tsx` con guardas de sesion y de carteras, y periodo desde `?mes`.
- [x] 3.2 Agregar el enlace `/resumen` en `src/components/navegacion.tsx`.

## 4. Spec y verificacion

- [x] 4.1 Crear `openspec/specs/resumen/spec.md` (capacidad #13) y validar con `openspec validate resumen --type spec`.
- [x] 4.2 Comprobar que `npx tsc --noEmit` no agrega errores a la linea base.
- [x] 4.3 Correr `npx vitest run tests/resumen tests/panel`.
