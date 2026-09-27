# transacciones Specification

## Purpose
Definir el registro de cada evento de dinero del usuario: gastos, ingresos, devoluciones y traspasos. Un movimiento es la unica fuente de verdad de los saldos y los disponibles, y ninguno de esos valores se guarda por separado. El periodo al que pertenece un movimiento es el mes calendario de su fecha, no el mes en que se registro, y por lo tanto los meses pasados pueden recalcularse cuando el usuario corrige un dato.

## Requirements

### Requirement: El usuario registra movimientos de gasto e ingreso
El sistema SHALL permitir al usuario registrar un movimiento con cuenta, sobre, importe, fecha y descripcion, y SHALL distinguir entre gasto, ingreso y traspaso. El importe SHALL llevar signo segun el tipo: negativo para gastos, positivo para ingresos y devoluciones. El sistema SHALL permitir omitir el comercio.

#### Scenario: Registrar un gasto
- **WHEN** el usuario registra un gasto de 450 en una cuenta con un sobre asignado
- **THEN** el sistema registra el movimiento con importe negativo y actualiza el saldo de la cuenta y el disponible del sobre

#### Scenario: Registrar un ingreso
- **WHEN** el usuario registra un ingreso de 25,000 con descripcion Quincena
- **THEN** el sistema registra el movimiento con importe positivo, sin asignar a ningun sobre, y el dinero suelto aumenta en 25,000

#### Scenario: Registrar un gasto con comercio
- **WHEN** el usuario registra un gasto indicando el comercio
- **THEN** el sistema guarda el comercio para poder buscarlo e identificarlo despues

#### Scenario: Registrar un movimiento con importe cero
- **WHEN** el usuario intenta registrar un movimiento con importe cero
- **THEN** el sistema rechaza la operacion e indica que el importe debe ser distinto de cero

---

### Requirement: Un movimiento puede quedar sin asignar
El sistema SHALL permitir registrar un movimiento sin asignar un sobre, interpretandolo como dinero que todavia no pertenece a ningun sobre. El sistema SHALL identificar estos movimientos como pendientes de asignacion y SHALL mantener su importe dentro del dinero suelto de la cartera. El sistema SHALL NOT impedir el registro de un gasto por no tener todavia un sobre asignado.

#### Scenario: Gasto registrado sin sobre
- **WHEN** el usuario registra un gasto de 200 sin indicar sobre
- **THEN** el sistema lo registra como pendiente de asignar y el dinero suelto disminuye en 200

#### Scenario: Movimiento pendiente en la lista
- **WHEN** el usuario consulta sus movimientos
- **THEN** los que no tienen sobre aparecen marcados como sin asignar y ofrecen la accion de asignarles uno

#### Scenario: El dinero pendiente no desaparece
- **WHEN** existen movimientos sin asignar
- **THEN** su importe permanece incluido en el dinero suelto de la cartera hasta que se les asigne un sobre

---

### Requirement: El usuario asigna un sobre a un movimiento pendiente
El sistema SHALL permitir al usuario asignar un sobre a un movimiento que fue registrado sin asignar. Al asignarlo, el sistema SHALL mover el importe del dinero suelto al disponible del sobre elegido, sin alterar el saldo de la cuenta, que ya habia cambiado cuando se registro el movimiento. El sistema SHALL rechazar la asignacion cuando la cuenta y el sobre pertenezcan a carteras distintas.

#### Scenario: Asignar sobre a un movimiento pendiente
- **WHEN** el usuario asigna el sobre Comida a un gasto de 200 que estaba sin asignar
- **THEN** el disponible de Comida disminuye en 200 y el dinero suelto aumenta en 200

#### Scenario: El saldo de la cuenta no cambia
- **WHEN** el usuario asigna un sobre a un movimiento ya registrado
- **THEN** el saldo de la cuenta permanece igual, porque el dinero ya se movio al registrarse

#### Scenario: Asignar un sobre de otra cartera
- **WHEN** el usuario intenta asignar a un movimiento un sobre que pertenece a una cartera distinta de la de su cuenta
- **THEN** el sistema rechaza la operacion por pertenecer los elementos a carteras distintas

#### Scenario: Quitar el sobre de un movimiento
- **WHEN** el usuario retira el sobre de un movimiento asignado
- **THEN** el importe regresa al dinero suelto y el disponible del sobre aumenta en consecuencia

---

### Requirement: El disponible de un sobre aumenta con devoluciones y reembolsos
El sistema SHALL registrar una devolucion o reembolso como un movimiento de importe positivo asociado al sobre al que corresponde, y SHALL incrementar el disponible de ese sobre. El sistema SHALL tratar la devolucion como una reduccion del gasto original y SHALL NOT considerarla dinero nuevo, de modo que no modifique el patrimonio ni el dinero suelto de la cartera.

#### Scenario: Devolucion de una compra
- **WHEN** el usuario registra una devolucion de 200 asociada al sobre donde se registro la compra original
- **THEN** el disponible de ese sobre aumenta en 200

#### Scenario: Devolucion a un sobre archivado
- **WHEN** el usuario registra una devolucion asociada a un sobre archivado
- **THEN** el importe se acumula en ese sobre y el sistema lo muestra nuevamente aunque continue archivado

#### Scenario: Una devolucion no crea dinero
- **WHEN** el usuario registra una devolucion que corresponde a una compra ya registrada
- **THEN** el patrimonio y el dinero suelto de la cartera no varian

---

### Requirement: El usuario edita un movimiento y los derivados se recalculan
El sistema SHALL permitir al usuario editar cualquier dato de un movimiento registrado, incluidos cuenta, sobre, importe, fecha y descripcion. Tras la edicion, el sistema SHALL recalcular el saldo de la cuenta afectada, el disponible de los sobres involucrados, el dinero suelto y cualquier otro valor derivado. El sistema SHALL validar que la cuenta y el sobre sigan perteneciendo a la misma cartera.

#### Scenario: Corregir el importe de un gasto
- **WHEN** el usuario corrige un gasto de 450 a 380
- **THEN** el saldo de la cuenta y el disponible del sobre se ajustan automaticamente

#### Scenario: Corregir la cuenta de un movimiento
- **WHEN** el usuario cambia el movimiento de una cuenta a otra de la misma cartera
- **THEN** el saldo de ambas cuentas se recalcula y el disponible del sobre no se altera

#### Scenario: Corregir la fecha al periodo anterior
- **WHEN** el usuario cambia la fecha de un movimiento al mes anterior
- **THEN** el disponible del sobre se recalcula para ambos periodos afectados

---

### Requirement: El usuario borra un movimiento y los derivados se recalculan
El sistema SHALL permitir al usuario eliminar un movimiento registrado mediante un borrado logico, de modo que el registro se conserve marcado pero deje de contar en los calculos. Tras el borrado, el sistema SHALL recalcular el saldo de la cuenta, los disponibles de los sobres afectados y el dinero suelto. El sistema SHALL permitir restablecer un movimiento eliminado, y SHALL eliminar tambien todas las patas de un traspaso cuando se borra cualquiera de ellas.

#### Scenario: Borrado logico de un gasto
- **WHEN** el usuario elimina un gasto de 450
- **THEN** el saldo de la cuenta aumenta en 450 y el disponible del sobre aumenta en 450, sin que el registro se borre fisicamente

#### Scenario: Restaurar un movimiento eliminado
- **WHEN** el usuario restaura un movimiento previamente eliminado
- **THEN** el sistema lo vuelve a considerar en todos los calculos y su saldo reaparece

#### Scenario: Borrar un traspaso completo
- **WHEN** el usuario elimina una de las dos patas de un traspaso
- **THEN** el sistema elimina tambien la otra pata y ambos saldos quedan restaurados

---

### Requirement: El periodo de un movimiento es el mes calendario de su fecha
El sistema SHALL asignar a cada movimiento el periodo que corresponde al mes calendario de su fecha, y SHALL NOT asignarlo al periodo en que fue registrado. Cuando la fecha y el periodo de registro difieren, el sistema SHALL reportar el movimiento en el periodo de su fecha. El sistema SHALL determinar el dia del mes a partir de la zona horaria del usuario.

#### Scenario: Movimiento registrado tarde
- **WHEN** el usuario registra el 20 de junio un movimiento con fecha del 28 de mayo
- **THEN** el movimiento pertenece a mayo y no a junio

#### Scenario: Movimiento de fin de mes
- **WHEN** el usuario registra un movimiento con fecha del 31 de marzo a las 23:30
- **THEN** el movimiento pertenece a marzo segun la zona horaria del usuario

---

### Requirement: Registrar un movimiento con fecha pasada recalcula ese periodo
Cuando el usuario registre, edite o elimine un movimiento con fecha correspondiente a un periodo ya cerrado, el sistema SHALL recalcular todos los derivados de ese periodo y de los posteriores. El sistema SHALL informar que los periodos afectados cambian, y SHALL NOT bloquear la operacion por tratarse de un periodo anterior.

#### Scenario: Alta retroactiva
- **WHEN** el usuario registra un gasto con fecha de mayo estando en junio
- **THEN** el disponible de mayo se recalcula y el panel de mayo refleja el nuevo numero

#### Scenario: Edicion retroactiva
- **WHEN** el usuario corrige un movimiento de mayo
- **THEN** los derivados de mayo y de los periodos posteriores se recalculan

#### Scenario: Aviso de recalculo
- **WHEN** el usuario registra un movimiento con fecha de un periodo anterior
- **THEN** el sistema informa que ese periodo y los siguientes se modificaran

---

### Requirement: El usuario filtra y busca movimientos
El sistema SHALL permitir al usuario filtrar los movimientos de su cartera por texto libre, cuenta, sobre, tipo y rango de fechas, y SHALL permitir buscar el texto tanto en la descripcion como en el comercio. El sistema SHALL aplicar los filtros de forma combinada y SHALL permitir limpiarlos, y SHALL informar cuando ningun filtro este activo.

#### Scenario: Buscar por texto
- **WHEN** el usuario busca Uber
- **THEN** el sistema devuelve los movimientos cuya descripcion o comercio contiene ese texto

#### Scenario: Filtrar por cuenta
- **WHEN** el usuario selecciona una cuenta como filtro
- **THEN** el sistema devuelve unicamente los movimientos de esa cuenta

#### Scenario: Filtrar por sobre
- **WHEN** el usuario selecciona el sobre Comida
- **THEN** el sistema devuelve los movimientos asignados a ese sobre

#### Scenario: Filtros combinados
- **WHEN** el usuario aplica un filtro de tipo gasto y un rango de fechas
- **THEN** el sistema devuelve solo los movimientos que cumplen ambas condiciones

#### Scenario: Limpiar filtros
- **WHEN** el usuario limpia todos los filtros activos
- **THEN** el sistema vuelve a mostrar todos los movimientos de la cartera

---

### Requirement: Cada usuario solo ve y opera sus propios movimientos
El sistema SHALL restringir el acceso a los movimientos al usuario propietario de la cartera que contiene la cuenta asociada. Ningun usuario SHALL poder consultar, editar ni eliminar los movimientos de otro usuario. El sistema SHALL deducir la cartera de cada movimiento a partir de su cuenta, y SHALL NOT aceptar una cartera declarada de forma independiente.

#### Scenario: Aislamiento entre usuarios
- **WHEN** un usuario autenticado solicita la lista de movimientos
- **THEN** el sistema devuelve unicamente los movimientos de sus propias cuentas

#### Scenario: Editar un movimiento ajeno
- **WHEN** un usuario intenta editar un movimiento de una cuenta que no le pertenece
- **THEN** el sistema rechaza la operacion

#### Scenario: Determinacion de la cartera de un movimiento
- **WHEN** el sistema determina la cartera a la que pertenece un movimiento
- **THEN** la obtiene desde su cuenta asociada y no de un dato declarado en el propio movimiento
