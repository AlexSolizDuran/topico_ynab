# carteras Specification

## Purpose
Define la cartera como entidad raiz del dominio: el contenedor que posee todas las cuentas, sobres, grupos y movimientos de un usuario, y que fija la moneda en la que se expresan todos esos datos. Una cartera es independiente de las demas: sus saldos y sus sobres no se suman nunca con los de otra cartera, porque cada una tiene su propia moneda y el sistema no maneja tipos de cambio.

## Requirements

### Requirement: Cada usuario tiene al menos una cartera
El sistema SHALL asociar a cada usuario al menos una cartera desde el momento de su registro, de modo que siempre exista un contenedor valido donde alojar sus datos financieros.
Las carteras son de propiedad exclusiva del usuario que las creo y ningun usuario puede operar las carteras de otro.

#### Scenario: Registro de un usuario nuevo
- **WHEN** un usuario completa su registro correctamente
- **THEN** el sistema crea una cartera inicial a su nombre y la asocia a ese usuario

#### Scenario: Acceso a una cartera ajena
- **WHEN** un usuario intenta consultar o modificar una cartera que pertenece a otro usuario
- **THEN** el sistema rechaza la operacion por no pertenecerle la cartera

---

### Requirement: Cada cartera tiene una moneda que aplica a todo su contenido
El sistema SHALL almacenar una moneda en cada cartera y SHALL expresar en esa moneda la totalidad de sus cuentas, sobres, asignaciones y movimientos. Las carteras de distinta moneda SHALL permanecer aisladas entre si y el sistema SHALL NOT calcular ningun total que las combine.

#### Scenario: Todos los datos de la cartera comparten su moneda
- **WHEN** el usuario consulta los saldos y los disponibles de una cartera
- **THEN** todos los importes se presentan en la moneda de esa cartera

#### Scenario: Carteras con monedas distintas
- **WHEN** el usuario tiene una cartera en MXN y otra en USD
- **THEN** el sistema presenta cada una por separado y no muestra ningun total combinado

#### Scenario: Cambio de moneda de una cartera
- **WHEN** el usuario solicita cambiar la moneda de una cartera que ya contiene datos
- **THEN** el sistema rechaza el cambio y explica que la moneda solo puede definirse al crear la cartera

---

### Requirement: Una cartera es propietaria de sus cuentas y sobres
El sistema SHALL pertenecer cada cuenta, sobre, grupo y movimiento a una unica cartera. Ningun dato financiero SHALL existir fuera de una cartera, y el sistema SHALL deducir la cartera de un movimiento a partir de la cuenta con la que opera.

#### Scenario: Un movimiento pertenece a la cartera de su cuenta
- **WHEN** el sistema determina la cartera de un movimiento
- **THEN** la obtiene desde la cuenta asociada, sin que el movimiento la declare por separado

#### Scenario: Intento de mezclar carteras
- **WHEN** el usuario intenta registrar un movimiento con una cuenta de una cartera y un sobre de otra
- **THEN** el sistema rechaza la operacion por pertenecer los dos elementos a carteras distintas

---

### Requirement: No se puede mover dinero entre carteras de distinta moneda
El sistema SHALL impedir que el usuario transfiera fondos entre carteras cuyas monedas difieran, y SHALL informar que la operacion no es posible. Esta restriccion SHALL aplicarse tambien a los traspasos que involucren cuentas de mas de una cartera.

#### Scenario: Traspaso entre carteras con distinta moneda
- **WHEN** el usuario intenta mover dinero de una cuenta de una cartera MXN a una cuenta de una cartera USD
- **THEN** el sistema rechaza la operacion y explica que requiere conversion de moneda, que el sistema no realiza

#### Scenario: Traspaso dentro de la misma cartera
- **WHEN** el usuario mueve dinero entre dos cuentas de una misma cartera
- **THEN** el sistema permite la operacion sin restricciones de moneda

---

### Requirement: El usuario crea, edita y archiva carteras
El sistema SHALL permitir al usuario crear carteras con nombre y moneda, y SHALL limitar la edicion a esos mismos datos una vez existen movimientos o cuentas. El sistema SHALL permitir archivar una cartera unicamente cuando todas sus cuentas y sobres esten en cero, y una cartera archivada SHALL conservar sus datos y su historial.

#### Scenario: Creacion de una cartera
- **WHEN** el usuario proporciona un nombre y una moneda validos
- **THEN** el sistema crea la cartera vacia y la muestra junto a las existentes

#### Scenario: Archivar una cartera vacia
- **WHEN** el usuario solicita archivar una cartera cuyas cuentas y sobres estan todos en cero
- **THEN** el sistema la marca como archivada y la retira de la lista de carteras activas

#### Scenario: Archivar una cartera con saldo
- **WHEN** el usuario solicita archivar una cartera que tiene cuentas o sobres con saldo distinto de cero
- **THEN** el sistema rechaza la operacion e indica que cuentas o sobres deben vaciarse primero

#### Scenario: Editar el nombre de una cartera
- **WHEN** el usuario cambia el nombre de una cartera
- **THEN** el sistema conserva la moneda, las cuentas y los sobres intactos

#### Scenario: Operar sobre una cartera archivada
- **WHEN** el usuario intenta registrar un movimiento en una cartera archivada
- **THEN** el sistema rechaza la operacion mientras la cartera permanezca archivada
