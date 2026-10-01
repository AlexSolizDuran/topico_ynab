# resumen Specification

## Purpose
Proveer una vista global de las finanzas del usuario que abarca todas sus carteras a la vez. Como cada cartera tiene una moneda y no existe conversion, el resumen agrupa la informacion por moneda y nunca suma dos monedas distintas. Dentro de cada moneda presenta el capital total, el flujo del periodo, la evolucion en el tiempo y los principales comercios. El resumen es de solo lectura: su unico control propio es la eleccion de moneda y de periodo, y ninguno de los dos modifica datos.

## Requirements

### Requirement: El resumen agrupa por moneda y nunca mezcla monedas
El sistema SHALL organizar toda la informacion del resumen en un grupo por cada moneda presente en las carteras del usuario. El sistema SHALL NOT sumar importes de monedas distintas en ninguna cifra. El sistema SHALL mostrar por separado el grupo de cada moneda aunque el usuario tenga una sola cartera.

#### Scenario: Dos monedas, dos grupos
- **WHEN** el usuario tiene carteras en MXN y en USD
- **THEN** el resumen muestra un grupo para MXN y otro para USD

#### Scenario: Los totales no mezclan monedas
- **WHEN** el usuario tiene una cartera con 10,000 MXN y otra con 500 USD
- **THEN** el capital del grupo MXN no incluye los 500 USD ni el grupo USD incluye los 10,000 MXN

#### Scenario: El usuario elige la moneda que mira
- **WHEN** el resumen tiene mas de un grupo y el usuario selecciona una moneda
- **THEN** el resumen muestra los detalles de esa moneda

### Requirement: El resumen muestra el capital por moneda
El sistema SHALL presentar, para cada moneda, el capital total como la suma de los patrimonios de las carteras de esa moneda. El sistema SHALL desglosar ese capital en la parte retenida en sobres y la parte sin asignar. El sistema SHALL calcular el capital al cierre del periodo elegido.

#### Scenario: Capital de una moneda
- **WHEN** el usuario tiene dos carteras en MXN con patrimonios de 30,000 y 20,000
- **THEN** el resumen muestra un capital de 50,000 para MXN

#### Scenario: Desglose del capital
- **WHEN** el resumen muestra el capital de una moneda
- **THEN** el sistema indica cuanto de ese capital esta en sobres y cuanto sin asignar

### Requirement: El resumen muestra el flujo del periodo
El sistema SHALL presentar, para cada moneda, el total de ingresos, el total de gastos y el neto del periodo elegido. El sistema SHALL NOT contar los traspasos como ingreso ni como gasto. El sistema SHALL recalcular el flujo al cambiar el periodo.

#### Scenario: Ingresos, gastos y neto
- **WHEN** una moneda tiene 30,000 de ingresos y 12,000 de gastos en el periodo
- **THEN** el resumen muestra 30,000 de ingresos, 12,000 de gastos y un neto de 18,000

#### Scenario: Los traspasos no son flujo
- **WHEN** el usuario mueve dinero entre carteras de la misma moneda
- **THEN** el ingreso y el gasto de esa moneda no cambian

### Requirement: El resumen muestra la evolucion mensual
El sistema SHALL presentar, para cada moneda, los ingresos, los gastos y el neto de los ultimos doce periodos, ordenados del mas antiguo al mas reciente. El sistema SHALL incluir los periodos sin movimientos con valores en cero.

#### Scenario: Doce periodos
- **WHEN** el usuario abre el resumen
- **THEN** el sistema muestra doce puntos mensuales por moneda, incluido el periodo elegido

#### Scenario: Un periodo sin actividad
- **WHEN** una moneda no tuvo movimientos en un mes
- **THEN** el resumen muestra ese mes con ingresos, gastos y neto en cero

### Requirement: El resumen muestra la evolucion anual
El sistema SHALL presentar, para cada moneda, los ingresos, los gastos y el neto acumulados por anio. El sistema SHALL incluir solo los anios con actividad.

#### Scenario: Acumulado por anio
- **WHEN** una moneda tuvo actividad en dos anios distintos
- **THEN** el resumen muestra un acumulado por cada anio

### Requirement: El resumen muestra el gasto diario del periodo
El sistema SHALL presentar, para cada moneda, el gasto de cada dia del periodo elegido. El sistema SHALL incluir los dias sin gasto con valor cero.

#### Scenario: Gasto por dia
- **WHEN** una moneda registro un gasto de 1,200 el dia 5 del periodo
- **THEN** el resumen muestra 1,200 en el dia 5 y cero en los dias sin gasto

### Requirement: El resumen desglosa el capital por cartera
El sistema SHALL listar, dentro de cada moneda, las carteras que la componen con su patrimonio, su dinero en sobres y su dinero sin asignar. El sistema SHALL marcar las carteras archivadas.

#### Scenario: Desglose por cartera
- **WHEN** una moneda agrupa tres carteras
- **THEN** el resumen muestra el capital de cada una y su parte en sobres y sin asignar

#### Scenario: Cartera archivada identificada
- **WHEN** una de las carteras del grupo esta archivada
- **THEN** el resumen la muestra marcada como archivada

### Requirement: El resumen lista los principales comercios del periodo
El sistema SHALL presentar, para cada moneda, los comercios con mayor gasto en el periodo elegido, ordenados de mayor a menor. El sistema SHALL considerar solo los gastos que tienen comercio.

#### Scenario: Comercios ordenados por gasto
- **WHEN** una moneda gasto 12,000 en un comercio y 3,000 en otro durante el periodo
- **THEN** el resumen muestra primero el comercio con 12,000

### Requirement: El resumen es de solo lectura
El sistema SHALL NOT permitir capturar ni modificar cuentas, sobres, asignaciones, movimientos ni carteras desde el resumen. El sistema SHALL limitar sus controles a la eleccion de moneda y de periodo.

#### Scenario: Sin controles de edicion
- **WHEN** el usuario abre el resumen
- **THEN** el sistema no ofrece acciones para crear, editar ni eliminar nada

#### Scenario: Cambiar el periodo no modifica datos
- **WHEN** el usuario elige otro periodo en el resumen
- **THEN** el sistema solo vuelve a calcular las cifras y no altera ningun registro
