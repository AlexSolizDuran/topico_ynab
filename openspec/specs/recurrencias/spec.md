# recurrencias Specification

## Purpose
Permitir al usuario describir una vez los movimientos que se repiten en el tiempo, para que el sistema los registre automaticamente en las fechas correspondientes. Una regla recurrente genera movimientos normales e indistinguibles de los registrados a mano, por lo que los calculos derivados no requieren ningun tratamiento especial. El usuario conserva siempre la capacidad de editar, desactivar o eliminar la regla y los movimientos que genero.

## Requirements

### Requirement: El usuario define una regla recurrente
El sistema SHALL permitir al usuario crear una regla con descripcion, cuenta, sobre, importe positivo, frecuencia y fecha de inicio. La frecuencia SHALL admitir repeticiones diarias, semanales, mensuales y anuales, y la regla SHALL exigir un dia valido y SHALL exigir un mes cuando la frecuencia sea anual. La cuenta y el sobre de la regla SHALL pertenecer a la misma cartera.

#### Scenario: Crear una regla mensual
- **WHEN** el usuario define una regla de renta por 8,000 con frecuencia mensual el dia 1
- **THEN** el sistema la registra con fecha de inicio y queda activa

#### Scenario: Regla sin sobre
- **WHEN** el usuario define una regla sin indicar sobre
- **THEN** el sistema la acepta y sus movimientos se registraran como pendientes de asignar

#### Scenario: Regla anual sin mes
- **WHEN** el usuario define una regla anual sin indicar el mes
- **THEN** el sistema rechaza la creacion y solicita el mes

#### Scenario: Regla con cuenta y sobre de carteras distintas
- **WHEN** el usuario define una regla con una cuenta de una cartera y un sobre de otra
- **THEN** el sistema rechaza la creacion

---

### Requirement: El sistema genera el movimiento en la fecha correspondiente
El sistema SHALL generar un movimiento con los datos de la regla en cada fecha que corresponda segun su frecuencia, y SHALL asignarle como periodo el mes calendario de esa fecha. El sistema SHALL marcar los movimientos que genera como originados por una regla, y estos SHALL ser indistinguibles de los registrados manualmente a efectos de calculo. El sistema SHALL informar al usuario de los movimientos que genere.

#### Scenario: Regla mensual aplicada
- **WHEN** llega el 1 de septiembre y existe una regla mensual de renta activa desde enero
- **THEN** el sistema genera el movimiento de renta con fecha del 1 de septiembre y periodo septiembre

#### Scenario: Movimiento generado indistinguible
- **WHEN** el sistema genera un movimiento a partir de una regla
- **THEN** el sistema lo trata igual que uno registrado a mano en el calculo de saldos y disponibles

#### Scenario: Importe negativo en una regla
- **WHEN** una regla representa un gasto
- **THEN** el sistema registra el movimiento con importe negativo, y con importe positivo cuando representa un ingreso

---

### Requirement: El sistema no duplica movimientos ya registrados
Cuando el sistema vaya a generar un movimiento de una regla y exista ya un movimiento equivalente en esa fecha, el sistema SHALL omitir la generacion y SHALL NOT crear un duplicado. El sistema SHALL determinar la equivalencia por la combinacion de regla de origen, cuenta, importe y fecha.

#### Scenario: Movimiento ya registrado a mano
- **WHEN** el usuario registro a mano la renta del 1 de septiembre y llega esa fecha
- **THEN** el sistema omite la generacion y no crea un segundo movimiento

#### Scenario: Generacion normal
- **WHEN** no existe movimiento previo para la fecha de aplicacion
- **THEN** el sistema genera el movimiento normalmente

#### Scenario: Generacion tras eliminar un movimiento
- **WHEN** el usuario elimino el movimiento que una regla habia generado y vuelve a llegar la fecha
- **THEN** el sistema vuelve a generarlo

---

### Requirement: El sistema genera los periodos pendientes
Cuando el usuario no haya usado la aplicacion durante varios periodos, el sistema SHALL generar al reabrir todos los movimientos pendientes de las reglas activas desde su fecha de inicio hasta la fecha actual. El sistema SHALL informar al usuario cuantos movimientos generó y en que periodos, y SHALL NOT generar periodos anteriores a la fecha de inicio de la regla.

#### Scenario: Varias ausencias
- **WHEN** existen reglas activas y el usuario no abrio la aplicacion durante tres meses
- **THEN** al reabrirla el sistema genera los movimientos pendientes de los tres periodos e informa al usuario

#### Scenario: Anterior a la fecha de inicio
- **WHEN** una regla comienza el 1 de marzo y el usuario la crea el 20 de marzo
- **THEN** el sistema no genera movimientos anteriores al 1 de marzo

#### Scenario: Regla desactivada
- **WHEN** el usuario desactivo una regla y existen periodos pendientes
- **THEN** el sistema no genera movimientos para esa regla en esos periodos

---

### Requirement: El usuario edita y desactiva reglas sin alterar lo ya generado
El sistema SHALL permitir al usuario cambiar los datos de una regla, cambiar su estado activo o inactivo y eliminarla. El sistema SHALL NOT modificar ni eliminar los movimientos ya generados por esa regla cuando sus datos cambien, y SHALL permitir editar o eliminar esos movimientos de forma individual. El sistema SHALL permitir desactivar una regla sin eliminarla, de modo que deje de generar movimientos futuros.

#### Scenario: Editar el importe de una regla
- **WHEN** el usuario cambia el importe de una regla de renta de 8,000 a 8,500
- **THEN** el sistema actualiza la regla y los movimientos ya registrados conservan su importe original

#### Scenario: Desactivar una regla
- **WHEN** el usuario desactiva una regla
- **THEN** el sistema deja de generar movimientos futuros y conserva los ya registrados

#### Scenario: Eliminar una regla
- **WHEN** el usuario elimina una regla
- **THEN** el sistema la elimina y conserva todos los movimientos que genero

#### Scenario: Editar un movimiento generado
- **WHEN** el usuario edita un movimiento que fue creado por una regla
- **THEN** el sistema guarda el cambio y la regla no lo sobrescribe en periodos siguientes
