# Proposal

## Why

El panel es la vista de resumen central donde el usuario consulta de un vistazo la salud financiera de una cartera abierta. Es una vista de solo lectura que consolida todos los datos derivados sin almacenar saldos estáticos: patrimonio neto con desglose, saldos por cuenta, disponibles agrupados por grupo, dinero suelto y advertencia de sobreasignación, sobres en desborde ordenados primero con opción de tapado manual si hay cobertura, totales de gasto e ingreso del periodo excluyendo traspasos, conteo de movimientos sin asignar, avance de metas activas destacando las retrasadas, selector de cartera sin consolidación multimoneda, y aviso ante recálculos retroactivos.

`panel` abarca 13 requisitos y 39 escenarios:
1. `El panel muestra el patrimonio de la cartera abierta` (3)
2. `El panel muestra el saldo de cada cuenta` (3)
3. `El panel muestra el disponible de cada sobre` (3)
4. `El panel muestra el dinero suelto` (3)
5. `El panel destaca los sobres con disponible negativo` (3)
6. `El panel ofrece el acceso para tapar un desborde` (3)
7. `El panel muestra el gasto y el ingreso del periodo` (4)
8. `El panel muestra los movimientos pendientes de asignar` (3)
9. `El panel muestra el progreso de las metas activas` (3)
10. `El panel permite cambiar de cartera` (3)
11. `El panel no muestra totales entre carteras de distinta moneda` (3)
12. `El panel es de solo lectura` (3)
13. `El panel informa cuando los datos se recalculan` (3)

## What Changes

1. **Repositorio de Consulta para el Panel (`src/repos/panel.ts`):**
   - `consultarDatosPanel`: consulta integral de solo lectura para la cartera abierta y el periodo seleccionado.
   - Agregación de patrimonio neto (`suma(disponibles) + dinero_suelto`), cuentas activas y archivadas (con total de activas y saldo de crédito en negativo), sobres agrupados por grupo (con total por grupo y sobres negativos destacados primero), cálculo de dinero suelto (aviso de sobreasignación si < 0), verificación de cobertura de desbordes, totales de ingresos y gastos del periodo excluyendo traspasos, conteo de movimientos sin sobre asignado, y lista de metas activas con progreso e indicador de retraso.
   - Exclusión estricta de consolidación multimoneda o suma entre carteras distintas.

2. **Componentes Visuales del Panel (`src/components/panel.tsx`):**
   - `PanelResumen`: layout completo de resumen de solo lectura según Stitch (Tanda 1, vista 1.3).
   - Bloque 1: Patrimonio destacado con desplegable explicativo del desglose.
   - Bloque 2: Dinero suelto con badge de advertencia si es negativo y botón para tapar desborde si existe cobertura.
   - Bloque 3: Resumen de cuentas con totales al pie y sección colapsada de archivadas.
   - Bloque 4: Sobres agrupados con pliegue de grupos, desbordes en rojo primero, y avance de metas.
   - Bloque 5: Tarjeta de gasto e ingreso del periodo seleccionado con selector de mes.
   - Bloque 6: Contador de movimientos sin asignar con enlace de asignación rápida.
   - Selector de cambio de cartera sin combinación de saldos ni totales globales.
   - Banner de recálculo retroactivo.

3. **Integración en la Página de Cartera (`src/app/(app)/cartera/[cartera]/page.tsx`):**
   - Estructuración limpia donde el panel de resumen actúa como Server Component de solo lectura con enlaces a modales/vistas de acción.

4. **Pruebas y Verificación (`tests/panel/`):**
   - Pruebas del repositorio con Postgres (`tests/panel/repositorio.test.ts`).
   - Pruebas de renderizado de componentes y naturaleza de solo lectura (`tests/panel/vista.test.tsx`).
   - Matriz de verificación exhaustiva de los 39 escenarios (`tests/panel/escenarios.test.ts`).
