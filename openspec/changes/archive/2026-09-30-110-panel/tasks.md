# Tasks

13 requisitos, 39 escenarios.

## 1. Repositorio de lectura del panel

- [x] 1.1 `src/repos/panel.ts` con tipos e interfaces (`DatosPanel`, `ResumenCuentasPanel`, `GrupoConSobresPanel`, `DesbordeSobrePanel`, `TotalesPeriodoPanel`).
- [x] 1.2 `consultarDatosPanel` derivando en SQL: patrimonio con desglose, dinero suelto y sobreasignación, cuentas con saldo y separación de archivadas, sobres por grupo con orden prioritario de desbordes, ingresos y gastos del periodo excluyendo traspasos, conteo de movimientos sin asignar, y metas activas.
- [x] 1.3 Pruebas de integración del repositorio en `tests/panel/repositorio.test.ts`.

## 2. Componentes de UI del panel

- [x] 2.1 `src/components/panel.tsx` con `PanelResumen` y sus bloques: Bloque 1 Patrimonio, Bloque 2 Dinero suelto y tapado manual, Bloque 3 Cuentas, Bloque 4 Sobres agrupados y metas, Bloque 5 Gastos/Ingresos del mes, Bloque 6 Pendientes de asignar.
- [x] 2.2 Selector de carteras sin consolidación multimoneda ni arrastre de cifras.
- [x] 2.3 Pruebas de renderizado de componentes y verificación de solo lectura en `tests/panel/vista.test.tsx`.

## 3. Integración en la página de cartera

- [x] 3.1 Integrar `PanelResumen` en `src/app/(app)/cartera/[cartera]/page.tsx` para presentar el panel de resumen completo.

## 4. Verificación completa y matriz de escenarios

- [x] 4.1 `tests/panel/escenarios.test.tsx` cubriendo los 39 escenarios de los 13 requisitos de `openspec/specs/panel/spec.md`.
- [x] 4.2 Comprobar que `npm run typecheck` pasa sin errores.
- [x] 4.3 Validar con `npx @fission-ai/openspec validate --all`.
