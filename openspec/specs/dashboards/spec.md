# dashboards Specification

## Purpose
Renderiza el panel de finanzas personales autenticado a partir de datos por usuario: métricas rápidas, liquidez y saldos, evolución mensual, curva de saldo, gasto por día de la semana, flujo de efectivo por cuenta, las cinco operaciones más grandes, resumen de presupuesto con alertas, y detalles al pasar el cursor para más información sin saturar la vista principal.

## Requirements

### Requirement: El panel muestra el resumen financiero por usuario
El panel SHALL mostrar, solo para el usuario autenticado: liquidez total, saldo por cuenta (incluyendo transferencias), ingresos/gastos/diferencia del mes, identificador del mes, y métricas rápidas (tasa de ahorro, promedio diario de gasto, proyección a fin de mes, promedios de 3 meses, volumen transferido).

#### Scenario: Panel no autenticado
- **WHEN** el panel se carga sin una sesión válida
- **THEN** la app redirige a la página de inicio de sesión

#### Scenario: Panel autenticado con datos
- **WHEN** un usuario autenticado abre el panel
- **THEN** las tarjetas de resumen muestran los totales y las métricas rápidas del propio usuario

#### Scenario: Usuario nuevo sin datos
- **WHEN** un usuario autenticado no tiene cuentas ni transacciones
- **THEN** los widgets muestran mensajes de estado vacío y un total de cero

### Requirement: Las gráficas muestran la evolución en el tiempo
El panel SHALL renderizar una gráfica mensual de ingresos contra gastos y una curva de saldo de 12 meses, incluyendo una línea de referencia en cero cuando los saldos son negativos.

#### Scenario: Gráfica de evolución mensual
- **WHEN** un usuario autenticado con datos históricos ve la gráfica de evolución
- **THEN** cada mes muestra barras de ingreso y gasto con las etiquetas de mes correctas

#### Scenario: Curva de saldo
- **WHEN** un usuario autenticado ve la curva de saldo
- **THEN** la curva refleja el saldo de cierre de cada mes (saldos iniciales, transacciones y transferencias)

### Requirement: Resumen de presupuesto con alertas
El panel SHALL mostrar el presupuesto total del mes (asignado, gastado, porcentaje) y marcar las categorías que se acercan al límite (≥80%) o lo superan.

#### Scenario: Se muestra el porcentaje de presupuesto
- **WHEN** el mes actual tiene un presupuesto asignado
- **THEN** se muestra el porcentaje global usado junto con los montos gastado y asignado

#### Scenario: Alertas de cerca del límite y de presupuesto excedido
- **WHEN** una categoría alcanza el 80% o supera su presupuesto
- **THEN** una alerta visible la etiqueta como cerca del límite o excedida

#### Scenario: Sin presupuesto para el mes
- **WHEN** no existe presupuesto para el mes actual
- **THEN** el widget indica que no hay presupuesto asignado

### Requirement: El hover revela detalles sin saturar
Los widgets interactivos SHALL mostrar un tooltip con detalle adicional al pasar el cursor (valores de las gráficas, desglose por categoría, flujo de efectivo por cuenta).

#### Scenario: Hover sobre una gráfica
- **WHEN** el usuario pasa el cursor sobre una barra, un punto de la curva o una fila de un desglose
- **THEN** un tooltip muestra los montos y las etiquetas correspondientes

#### Scenario: Hover sobre las filas de un desglose
- **WHEN** el usuario pasa el cursor sobre una fila de distribución de gastos o de día de la semana
- **THEN** el tooltip muestra la categoría, el monto y el porcentaje o la cantidad
