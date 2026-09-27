# sobres Specification

## Purpose
Definir los sobres como el mecanismo central de reparto del dinero. Un sobre es un contenedor con nombre que agrupa el dinero que el usuario le ha asignado y los gastos que ha registrado contra el. Su disponible nunca se almacena: se calcula siempre a partir de asignaciones y movimientos, de modo que cualquier correccion en el pasado se refleje automaticamente. Los sobres pueden quedar negativos y el sistema avisa en lugar de resolverlo por el usuario.

## Requirements

### Requirement: El usuario crea y nombra sobres propios
El sistema SHALL permitir al usuario crear sobres propios dentro de una cartera, cada uno con un nombre unico dentro de esa cartera y perteneciendo a un grupo. El sistema SHALL permitir editar el nombre y el orden de un sobre, y SHALL rechazar nombres duplicados dentro de la misma cartera.

#### Scenario: Crear un sobre
- **WHEN** el usuario proporciona un nombre unico y un grupo de una cartera
- **THEN** el sistema crea el sobre con disponible en cero y lo muestra en su grupo

#### Scenario: Nombre duplicado en la misma cartera
- **WHEN** el usuario intenta crear un sobre con un nombre que ya existe en esa cartera
- **THEN** el sistema rechaza la creacion e indica que el nombre ya esta en uso

#### Scenario: Mismo nombre en carteras distintas
- **WHEN** el usuario crea un sobre llamado Comida en una cartera donde ya existe en otra
- **THEN** el sistema lo permite porque cada cartera es independiente

#### Scenario: Editar el nombre de un sobre
- **WHEN** el usuario renombra un sobre que ya tiene movimientos
- **THEN** el sistema conserva su disponible y su historial intactos

---

### Requirement: El disponible de un sobre se calcula y nunca se almacena
El sistema SHALL derivar el disponible de un sobre de la suma de todas sus asignaciones hasta el periodo consultado mas la suma de los importes de sus movimientos no traspaso no eliminados con fecha dentro o anterior a ese periodo. El sistema SHALL NOT almacenar el disponible como dato, de modo que toda modificacion de una asignacion o de un movimiento se refleje de inmediato sin recalculos manuales.

#### Scenario: Available derivado de asignaciones y movimientos
- **WHEN** un sobre tiene asignaciones por 4,000 y un gasto de 450
- **THEN** el disponible que muestra el sistema es 3,550

#### Scenario: El disponible no es un dato almacenado
- **WHEN** el usuario borra un movimiento de un sobre
- **THEN** el disponible se ajusta sin que el usuario tenga que corregir ningun saldo

#### Scenario: Correccion de una asignacion
- **WHEN** el usuario corrige el importe de una asignacion existente
- **THEN** el disponible del sobre refleja de inmediato el importe corregido

---

### Requirement: El disponible se acumula entre periodos
El sistema SHALL calcular el disponible de un sobre sumando todas sus asignaciones de periodos anteriores o iguales al consultado, y SHALL NOT reiniciar el saldo al cambiar de mes. El disponible de un sobre en un periodo SHALL ser igual a su disponible en el periodo anterior mas lo que se le haya asignado y gastado en el nuevo periodo.

#### Scenario: Lo que sobra sigue disponible
- **WHEN** un sobre cierra un periodo con 800 disponibles y no recibe asignaciones nuevas
- **THEN** en el periodo siguiente conserva esos 800

#### Scenario: Asignacion de un periodo anterior
- **WHEN** el usuario asigna 2,000 a un sobre con periodo del mes anterior
- **THEN** el disponible del mes en curso incluye esos 2,000

#### Scenario: Consultar un periodo pasado
- **WHEN** el usuario consulta el disponible de un sobre en un periodo anterior
- **THEN** el sistema muestra el valor que tenia en ese momento, incluyendo solo asignaciones y movimientos con fecha anterior o igual a su cierre

---

### Requirement: El usuario asigna dinero a un sobre
El sistema SHALL permitir al usuario asignar un importe a un sobre para un periodo concreto. Las asignaciones SHALL aceptar unicamente importes positivos: los sobregiros y los importes negativos se registran exclusivamente como movimientos. El sistema SHALL admitir varias asignaciones al mismo sobre dentro del mismo periodo y las SHALL sumar.

#### Scenario: Asignacion positiva
- **WHEN** el usuario asigna 3,000 a un sobre para el periodo en curso
- **THEN** el disponible del sobre aumenta en 3,000

#### Scenario: Varias asignaciones en el mismo periodo
- **WHEN** el usuario asigna 3,000 y despues 500 al mismo sobre dentro del mismo periodo
- **THEN** el disponible aumenta en 3,500 y ambas asignaciones quedan registradas

#### Scenario: Asignacion de importe negativo
- **WHEN** el usuario intenta asignar un importe negativo o cero a un sobre
- **THEN** el sistema rechaza la asignacion e indica que debe ser un importe positivo

#### Scenario: Asignar a un sobre archivado
- **WHEN** el usuario intenta asignar dinero a un sobre archivado
- **THEN** el sistema rechaza la asignacion e indica que debe desarchivar el sobre primero

---

### Requirement: Un sobre puede quedar con disponible negativo
El sistema SHALL permitir que un sobre presente un disponible negativo sin bloquear la operacion que lo produjo. El disponible SHALL refletir la realidad de que el usuario gasto mas de lo que tenia asignado, y el sistema SHALL NOT ocultar este saldo ni compensarlo de ninguna otra forma.

#### Scenario: Gasto mayor que lo asignado
- **WHEN** un sobre tiene 2,000 disponibles y el usuario registra un gasto de 2,400
- **THEN** el disponible queda en -400 y el sistema lo muestra como negativo

#### Scenario: El sistema no impide el gasto
- **WHEN** el usuario registra un gasto que excede el disponible de su sobre
- **THEN** el sistema registra el movimiento y no rechaza la operacion

#### Scenario: Varios sobres en negativo a la vez
- **WHEN** dos sobres de la misma cartera quedan con disponible negativo
- **THEN** el sistema muestra ambos en estado negativo de forma simultanea

---

### Requirement: El sistema marca el desborde y avisa que hay dinero suelto
Cuando un sobre quede con disponible negativo, el sistema SHALL presentarlo de forma destacada e informar al usuario. Si en la cartera existe dinero suelto suficiente para cubrir el negativo, el sistema SHALL advertir que ese dinero puede usarse para tapar el desborde. El sistema SHALL NOT aplicar ese movimiento de forma automatica.

#### Scenario: Aviso de desborde con dinero suelto disponible
- **WHEN** un sobre queda en -400 y la cartera tiene 5,000 de dinero suelto
- **THEN** el sistema destaca el sobre e informa que el desborde puede cubrirse con dinero suelto

#### Scenario: Aviso sin dinero suelto suficiente
- **WHEN** un sobre queda en -400 y la cartera tiene 200 de dinero suelto
- **THEN** el sistema destaca el sobre e informa que el dinero suelto no cubre el desborde completo

#### Scenario: El sistema no tapa el desborde por su cuenta
- **WHEN** un sobre queda negativo y existe dinero suelto disponible
- **THEN** el disponible permanece negativo hasta que el usuario decida taparlo

---

### Requirement: El usuario tapa un desborde moviendo dinero
El sistema SHALL permitir al usuario cubrir el disponible negativo de un sobre asignando dinero a ese sobre, ya sea tomandolo del dinero suelto o tomando el disponible de otro sobre. El sistema SHALL exigir que el monto tapado no exceda el negativo existente, y SHALL rechazar la operacion cuando lo exceda.

#### Scenario: Tapar el desborde con dinero suelto
- **WHEN** el usuario asigna 400 a un sobre que estaba en -400
- **THEN** el disponible del sobre queda en cero y el dinero suelto disminuye en 400

#### Scenario: Tapar el desborde con otro sobre
- **WHEN** el usuario mueve 400 desde el disponible de un sobre con saldo suficiente hacia el sobre en negativo
- **THEN** el disponible del origen disminuye en 400 y el del destino queda en cero

#### Scenario: Tapar un monto mayor al negativo
- **WHEN** el usuario intenta tapar 600 un sobre que esta en -400
- **THEN** el sistema rechaza la operacion e indica que el monto no puede exceder el desborde

#### Scenario: Tapar parcialmente
- **WHEN** el usuario asigna 200 a un sobre que esta en -400
- **THEN** el disponible del sobre queda en -200 y el desborde sigue destacado

---

### Requirement: Mover dinero entre sobres ni crea ni destruye dinero
Cuando el usuario traslade un importe desde un sobre a otro, el sistema SHALL disminuir el disponible del origen y aumentar el del destino por el mismo importe, y SHALL NOT modificar el dinero suelto ni el patrimonio. El sistema SHALL rechazar la operacion cuando el disponible del origen sea insuficiente.

#### Scenario: Mover entre dos sobres
- **WHEN** el usuario mueve 500 de un sobre con 3,000 disponibles a otro con 800
- **THEN** el origen queda en 2,500 y el destino en 1,300

#### Scenario: Mover mas de lo disponible
- **WHEN** el usuario intenta mover 5,000 desde un sobre que tiene 3,000 disponibles
- **THEN** el sistema rechaza la operacion e indica que el disponible es insuficiente

#### Scenario: El patrimonio no cambia
- **WHEN** el usuario mueve dinero entre dos sobres
- **THEN** la suma total de disponibles de la cartera permanece igual

---

### Requirement: La suma de disponibles mas dinero suelto iguala el patrimonio
El sistema SHALL calcular el dinero suelto de una cartera como la suma de los saldos de sus cuentas menos la suma de los disponibles de sus sobres. El sistema SHALL garantir que para cualquier cartera, en cualquier momento y con cualquier combinacion de datos, se cumple la invariante de que la suma de los disponibles mas el dinero suelto es igual al patrimonio neto de esa cartera. Si el calculo no cuadra, el sistema SHALL tratarlo como un error y no como un estado valido.

#### Scenario: La invariante se cumple
- **WHEN** las cuentas suman 30,000 y los disponibles suman 22,000
- **THEN** el dinero suelto es 8,000 y el patrimonio es 22,000 mas 8,000, igual a 30,000

#### Scenario: Dinero suelto negativo
- **WHEN** el usuario asigna 35,000 con solo 30,000 en cuentas
- **THEN** el dinero suelto queda en -5,000 y el sistema informa que se asigno mas de lo que se tiene

#### Scenario: La invariante no depende de los datos
- **WHEN** existen sobres en negativo, cuentas en deuda y movimientos sin asignar
- **THEN** la suma de disponibles mas dinero suelto sigue igualando el patrimonio de la cartera

---

### Requirement: El usuario borra un sobre solo si no tiene movimientos
El sistema SHALL permitir eliminar de forma definitiva un sobre unicamente cuando no tenga movimientos asociados y su disponible sea cero. Un sobre con movimientos SHALL NOT eliminarse y solo SHALL poder archivarse. El sistema SHALL exigir vaciar el sobre antes de eliminarlo o archivarlo.

#### Scenario: Borrar un sobre recien creado y sin usar
- **WHEN** el usuario solicita eliminar un sobre sin movimientos y con disponible en cero
- **THEN** el sistema lo elimina de forma definitiva y no queda registro

#### Scenario: Borrar un sobre con saldo
- **WHEN** el usuario solicita eliminar un sobre sin movimientos pero con disponible distinto de cero
- **THEN** el sistema rechaza la eliminacion y solicita vaciar el sobre primero

#### Scenario: Borrar un sobre con movimientos
- **WHEN** el usuario solicita eliminar un sobre que tiene al menos un movimiento
- **THEN** el sistema rechaza la eliminacion y ofrece archivar el sobre en su lugar

---

### Requirement: El usuario archiva un sobre cuyo disponible es cero
El sistema SHALL permitir archivar un sobre cuando su disponible sea cero, y el sistema SHALL exigir vaciarlo antes si no lo esta. Un sobre archivado SHALL conservar su historial y SHALL NOT recibir asignaciones, aunque SHALL seguir recibiendo devoluciones y reembolsos, que se acumularan en su disponible. El sistema SHALL mantener visible todo sobre con disponible negativo, este archivado o no.

#### Scenario: Archivar un sobre vaciado
- **WHEN** el usuario archiva un sobre con movimientos cuyo disponible es cero
- **THEN** el sistema lo marca como archivado y lo retira del agrupamiento visible, conservando su historial

#### Scenario: Archivar un sobre con saldo
- **WHEN** el usuario intenta archivar un sobre con disponible distinto de cero
- **THEN** el sistema rechaza la operacion y solicita vaciar el sobre primero

#### Scenario: Devolucion a un sobre archivado
- **WHEN** un sobre archivado recibe una devolucion de 200
- **THEN** su disponible pasa a 200 y el sistema lo muestra nuevamente, aunque siga archivado

#### Scenario: Un sobre archivado en negativo sigue visible
- **WHEN** un sobre archivado acumula movimientos hasta quedar con disponible negativo
- **THEN** el sistema lo destaca en rojo y lo muestra entre los sobres en negativo
