# traspasos Specification

## Purpose
Definir el movimiento de dinero entre cuentas propias como una operacion que no representa gasto. Un traspaso cambia de donde esta el dinero, no cuanto dinero tiene el usuario, y por eso no toca sobres ni dinero suelto. El sistema modela un traspaso como un grupo que empareja las dos patas, de modo que ambos saldos cambien siempre de forma conjunta.

## Requirements

### Requirement: El usuario transfiere dinero entre sus propias cuentas
El sistema SHALL permitir al usuario mover un importe desde una cuenta a otra de la misma cartera, indicando importe, fecha y descripcion. El sistema SHALL registrar el traspaso como un grupo que empareja las dos patas, una por cada cuenta involucrada, con importes de signo opuesto. El sistema SHALL permitir registrar un traspaso con una sola pata, y en ese caso SHALL avisar al usuario de que no tiene contraparte y de que esa pata mueve el dinero suelto y el patrimonio por el importe completo, porque no hay pata opuesta que lo compense.

#### Scenario: Traspaso entre dos cuentas
- **WHEN** el usuario mueve 5,000 de una cuenta corriente a una de ahorro
- **THEN** el sistema registra las dos patas emparejadas, la cuenta de origen disminuye 5,000 y la de destino aumenta 5,000

#### Scenario: Traspaso con una sola pata
- **WHEN** el usuario registra un traspaso con una sola pata
- **THEN** el sistema lo registra y advierte que esa pata no tiene contraparte y que por eso el dinero suelto y el patrimonio se mueven por el importe completo, sin bloquear la operacion

#### Scenario: Traspaso entre cuentas de carteras distintas
- **WHEN** el usuario intenta mover dinero entre cuentas que pertenecen a carteras distintas
- **THEN** el sistema rechaza la operacion

#### Scenario: Traspaso a una cuenta archivada
- **WHEN** el usuario recibe un traspaso en una cuenta archivada
- **THEN** el sistema lo registra y reactiva la cuenta en la lista de cuentas activas

---

### Requirement: Un traspaso no es gasto y no modifica ningun sobre
El sistema SHALL excluir los traspasos del calculo del disponible de los sobres, y SHALL requerir que un traspaso no tenga sobre asociado. El sistema SHALL NOT registrar un traspaso como gasto ni como ingreso, de modo que registrar uno nunca modifique el disponible de un sobre. El sistema SHALL mostrar los traspasos en el historial de movimientos de forma distinguible de los gastos y los ingresos.

#### Scenario: Un traspaso no toca los sobres
- **WHEN** el usuario registra un traspaso entre dos cuentas
- **THEN** el disponible de todos los sobres permanece sin cambios

#### Scenario: No se puede asignar un sobre a un traspaso
- **WHEN** el usuario intenta registrar un traspaso indicando un sobre
- **THEN** el sistema rechaza la operacion e indica que un traspaso no se asigna a un sobre

#### Scenario: Traspaso distinguible en el historial
- **WHEN** el usuario consulta sus movimientos
- **THEN** los traspasos aparecen identificados como tales y no se confunden con un gasto

#### Scenario: Contabilidad del gasto original
- **WHEN** el usuario pago una compra con tarjeta y despues liquida la tarjeta
- **THEN** el pago aparece como traspaso y no como un gasto nuevo, porque el gasto se registro al comprar

---

### Requirement: Un traspaso emparejado no altera el dinero suelto ni el patrimonio
El sistema SHALL incluir los traspasos en el calculo del saldo de las cuentas y SHALL excluirlos del calculo del disponible de los sobres. Un traspaso con sus dos patas emparejadas mueve la suma de los saldos en cero, porque las dos patas tienen importes de signo opuesto, y no mueve la suma de los disponibles, porque un traspaso no se asigna a ningun sobre. El sistema SHALL garantizar que un traspaso emparejado no modifica ni el dinero suelto ni el patrimonio neto de la cartera. Un traspaso de una sola pata no esta emparejado, y si mueve ambas cantidades en el importe de esa pata.

#### Scenario: El dinero suelto no cambia
- **WHEN** el usuario registra un traspaso entre dos cuentas de la misma cartera
- **THEN** el dinero suelto de la cartera permanece sin cambios

#### Scenario: El patrimonio no cambia
- **WHEN** el usuario registra un traspaso con sus dos patas, por cualquier importe
- **THEN** el patrimonio neto de la cartera es identico antes y despues

#### Scenario: Una pata sola si mueve el dinero suelto
- **WHEN** el usuario registra un traspaso de una sola pata por 500
- **THEN** el dinero suelto y el patrimonio de la cartera se mueven en 500, porque no hay pata opuesta que compense, y el sistema ya habia avisado de que la pata no tiene contraparte

#### Scenario: Transferir dinero de una cuenta a un sobre
- **WHEN** el usuario quiere pasar dinero de su cuenta corriente a un sobre
- **THEN** lo hace asignando ese importe al sobre, que es una asignacion y no un traspaso, y el dinero suelto disminuye

---

### Requirement: Pagar el adeudo de una tarjeta es un traspaso
El sistema SHALL tratar el pago del adeudo de una cuenta de credito como un traspaso desde la cuenta de origen hacia la cuenta de credito, y SHALL NOT requerir que el usuario asigne ese importe a ningun sobre. El sistema SHALL informar al usuario cuando un traspaso reduce la deuda de una cuenta de credito. El pago de un adeudo es un traspaso emparejado, y por eso no altera el dinero suelto ni el patrimonio: la pata que suma a la cuenta de credito compensa exactamente a la que resta de la cuenta de origen.

#### Scenario: Pago de tarjeta sin sobre
- **WHEN** el usuario paga 600 a una cuenta de credito que debia 600
- **THEN** el sistema registra un traspaso, la deuda queda saldada y no se pide asignar el importe a ningun sobre

#### Scenario: Usuario que paga con tarjeta
- **WHEN** el usuario registra un gasto de 600 en una cuenta de credito
- **THEN** el sistema registra el gasto contra el sobre que el usuario elija, y ese mismo importe queda disponible para tapar el desborde

#### Scenario: Pago parcial de tarjeta
- **WHEN** el usuario paga 300 a una cuenta de credito que debia 600
- **THEN** la deuda baja a 300 y no se pide asignar el importe a ningun sobre
