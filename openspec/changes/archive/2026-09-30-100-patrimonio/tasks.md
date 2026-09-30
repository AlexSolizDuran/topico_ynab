# Tasks

4 requisitos, 12 escenarios.

## 1. Módulo de cálculo puro y detección de retroactividad

- [x] 1.1 `src/patrimonio/calculos.ts` con funciones de variación absoluta y porcentual con BigInt.
- [x] 1.2 `src/patrimonio/retroactividad.ts` con funciones `esPeriodoCerrado` y detección de mutaciones en periodos anteriores.
- [x] 1.3 Pruebas unitarias de cálculos y formatos en `tests/patrimonio/calculos.test.ts`.

## 2. Repositorio de patrimonio

- [x] 2.1 `src/repos/patrimonio.ts` con `consultarPatrimonioAlCierre` implementando la invariante `patrimonio = suma(disponibles) + dinero_suelto`.
- [x] 2.2 `consultarHistorialPatrimonio` con orden cronológico (del más antiguo al más reciente), cálculo de variaciones mes a mes y rango opcional `desde`/`hasta`.
- [x] 2.3 Exclusión de periodos sin datos (sin movimientos, asignaciones ni cuentas con saldo).
- [x] 2.4 Aislamiento estricto por `cartera_id` y `usuario_id`, operando exclusivamente en la moneda de la cartera.
- [x] 2.5 Pruebas de integración del repositorio con Postgres en `tests/patrimonio/repositorio.test.ts`.

## 3. Integración de retroactividad y aviso

- [x] 3.1 Integrar detección de periodo cerrado en `src/transacciones/acciones.ts` para emitir el aviso de historia modificada ante mutaciones en periodos pasados.
- [x] 3.2 Pruebas de retroactividad y recálculo automático en `tests/patrimonio/retroactividad.test.ts`.

## 4. Componentes de UI

- [x] 4.1 `src/components/patrimonio.tsx` con componentes `TarjetaPatrimonio`, `EvolucionPatrimonio` y banner de `AvisoHistoriaModificada`.
- [x] 4.2 Pruebas de renderizado de componentes de vista en `tests/patrimonio/vista.test.tsx`.

## 5. Verificación completa y escenarios

- [x] 5.1 `tests/patrimonio/escenarios.test.ts` cubriendo los 12 escenarios de `openspec/specs/patrimonio/spec.md`.
- [x] 5.2 Comprobar que `npm run typecheck` pasa sin errores.
- [x] 5.3 Validar con `npx @fission-ai/openspec validate --all`.
