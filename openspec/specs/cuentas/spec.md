# cuentas Specification

## Purpose
Definir las cuentas como los lugares fisicos donde el usuario tiene dinero o debe dinero. Cada cuenta pertenece a una cartera y expresa sus saldos en la moneda de esa cartera. El saldo nunca se almacena como dato: se deriva del saldo inicial declarado por el usuario mas la suma de sus movimientos. Las cuentas de credito representan deuda y por eso su saldo es negativo.

## Requirements

### Requirement: El usuario crea cuentas de cuatro tipos
El sistema SHALL permitir al usuario crear cuentas propias dentro de una cartera con un nombre unico en esa cartera y un tipo de corriente, ahorro, efectivo o credito. El tipo SHALL determinar si la cuenta representa dinero disponible o deuda. El sistema SHALL rechazar nombres duplicados dentro de la misma cartera.

#### Scenario: Crear una cuenta corriente
- **WHEN** el usuario crea una cuenta de tipo corriente con un saldo inicial
- **THEN** el sistema la registra y muestra su saldo inicial junto a los movimientos que se registren despues

#### Scenario: Crear una cuenta de credito
- **WHEN** el usuario crea una cuenta de tipo credito
- **THEN** el sistema la registra como una cuenta de deuda, con saldo inicial en cero o negativo

#### Scenario: Nombre duplicado en la misma cartera
- **WHEN** el usuario intenta crear una cuenta con un nombre que ya existe en esa cartera
- **THEN** el sistema rechaza la creacion e indica que el nombre ya esta en uso

#### Scenario: Mismo nombre en carteras distintas
- **WHEN** el usuario crea una cuenta llamada Principal en una cartera donde ya existe en otra
- **THEN** el sistema lo permite porque cada cartera es independiente

---

### Requirement: El saldo de una cuenta se calcula a partir de sus movimientos
El sistema SHALL derivar el saldo de una cuenta de la suma de su saldo inicial mas la suma de los importes de todos sus movimientos no eliminados, incluidos los traspasos. El sistema SHALL NOT almacenar el saldo como dato, de modo que cualquier alta, edicion o baja de movimiento lo actualice de inmediato.

#### Scenario: Saldo a partir del inicial y los movimientos
- **WHEN** una cuenta tiene saldo inicial de 5,000 y registra un gasto de 450
- **THEN** el saldo que muestra el sistema es 4,550

#### Scenario: El saldo no es un dato almacenado
- **WHEN** el usuario borra un movimiento de una cuenta
- **THEN** el saldo se recalcula sin intervencion manual

#### Scenario: Correccion del saldo inicial
- **WHEN** el usuario corrige el saldo inicial de una cuenta
- **THEN** el saldo refleja de inmediato el valor corregido aplicado a todos los movimientos existentes

---

### Requirement: Una cuenta de credito representa deuda
El sistema SHALL tratar toda cuenta de tipo credito como una obligacion pendiente y SHALL presentar su saldo en negativo cuando el usuario le deba dinero. Una cuenta en deuda SHALL descontarse del dinero suelto de la cartera, de modo que la deuda reduzca el dinero disponible del usuario. El sistema SHALL permitir que una cuenta de credito llegue a saldo positivo cuando se le abone mas de lo que se le debe.

#### Scenario: Deuda en la tarjeta
- **WHEN** el usuario registra un gasto de 600 en una cuenta de credito sin haber pagado
- **THEN** el saldo de esa cuenta es -600 y el dinero suelto de la cartera disminuye en 600

#### Scenario: Saldo a favor en una tarjeta
- **WHEN** el usuario recibe un reembolso de 800 en una cuenta de credito que debia 600
- **THEN** el saldo de esa cuenta pasa a 200

#### Scenario: Cuenta corriente sin deuda
- **WHEN** una cuenta corriente presenta un saldo negativo
- **THEN** el sistema lo muestra como negativo de la misma forma que una tarjeta

---

### Requirement: El usuario edita el nombre y el orden de sus cuentas
El sistema SHALL permitir al usuario cambiar el nombre y el orden de presentacion de sus cuentas, y SHALL conservar intactos su saldo inicial, sus movimientos y su historial. El sistema SHALL NOT permitir cambiar el tipo de una cuenta que ya tiene movimientos, porque ese cambio alteraria el significado de los saldos registrados.

#### Scenario: Editar el nombre de una cuenta
- **WHEN** el usuario renombra una cuenta
- **THEN** el sistema conserva su saldo y su historial intactos

#### Scenario: Reordenar cuentas
- **WHEN** el usuario cambia el orden de sus cuentas
- **THEN** el sistema las presenta en el nuevo orden sin alterar sus saldos

#### Scenario: Cambiar el tipo de una cuenta con movimientos
- **WHEN** el usuario intenta cambiar el tipo de una cuenta que ya tiene movimientos
- **THEN** el sistema rechaza el cambio e indica que solo puede cambiarse en cuentas sin movimientos

---

### Requirement: Archivar una cuenta exige saldo cero
El sistema SHALL permitir archivar una cuenta unicamente cuando su saldo sea cero, y SHALL solicitar al usuario que la vacie antes si no lo esta. Una cuenta archivada SHALL conservar su historial y SHALL NOT recibir nuevos movimientos, y SHALL seguir aceptando movimientos hasta alcanzar el cero.

#### Scenario: Archivar una cuenta en cero
- **WHEN** el usuario archiva una cuenta cuyo saldo es cero
- **THEN** el sistema la marca como archivada y la retira de la lista de cuentas activas, conservando su historial

#### Scenario: Archivar una cuenta con saldo
- **WHEN** el usuario intenta archivar una cuenta con saldo distinto de cero
- **THEN** el sistema rechaza la operacion e indica que la cuenta debe quedar en cero

#### Scenario: Transpaso a una cuenta archivada
- **WHEN** el usuario recibe un traspaso en una cuenta archivada
- **THEN** el sistema registra el movimiento y actualiza su saldo, reactivandola en la lista activa

---

### Requirement: Cada usuario solo ve y opera sus propias cuentas
El sistema SHALL restringir el acceso a las cuentas al usuario propietario de la cartera que las contiene. Ningun usuario SHALL poder consultar, editar ni operar las cuentas de otro usuario, y el sistema SHALL derivar las cuentas visibles a partir de la sesion del usuario activo.

#### Scenario: Aislamiento entre usuarios
- **WHEN** un usuario autenticado solicita la lista de cuentas
- **THEN** el sistema devuelve unicamente las cuentas de sus propias carteras

#### Scenario: Operar sobre una cuenta ajena
- **WHEN** un usuario intenta registrar un movimiento en una cuenta que pertenece a otra cartera
- **THEN** el sistema rechaza la operacion por no ser propietario de esa cuenta

#### Scenario: Ajuste de saldo en una cuenta propia
- **WHEN** el usuario ajusta el saldo de una cuenta que le pertenece
- **THEN** el sistema modifica su saldo inicial y recalcula todos los derivados afectados
