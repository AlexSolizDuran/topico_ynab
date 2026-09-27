# panel Specification

## Purpose
Proveer la vista de resumen de una cartera, donde el usuario comprueba de un vistazo como van sus finanzas. El panel es de solo lectura: no contiene operaciones de captura, sino que muestra los valores derivados y ofrece el acceso a las acciones que corresponde a cada caso. Toda la informacion que presenta se calcula a partir de cuentas, sobres y movimientos, y se limita a la cartera abierta.

## Requirements

### Requirement: El panel muestra el patrimonio de la cartera abierta
El sistema SHALL presentar como cifra destacada el patrimonio neto de la cartera abierta, calculado como la suma de los disponibles de sus sobres mas su dinero suelto. El sistema SHALL permitir desplegar el desglose de esa cifra, indicando cuanto proviene de los sobres y cuanto del dinero sin asignar. El sistema SHALL recalcular el valor tras cada cambio en cuentas, sobres, asignaciones o movimientos.

#### Scenario: Patrimonio mostrado
- **WHEN** una cartera tiene 22,000 en sobres y 8,000 sin asignar
- **THEN** el panel muestra un patrimonio de 30,000

#### Scenario: Desglose del patrimonio
- **WHEN** el usuario despliega el detalle del patrimonio
- **THEN** el sistema muestra la parte correspondiente a los sobres y la parte del dinero suelto que lo componen

#### Scenario: Patrimonio recalculado
- **WHEN** el usuario registra un movimiento de gasto
- **THEN** el patrimonio del panel se actualiza de inmediato

---

### Requirement: El panel muestra el saldo de cada cuenta
El sistema SHALL listar las cuentas de la cartera abierta con su nombre, su tipo y su saldo actual, y SHALL presentar en negativo los saldos de las cuentas de credito y de cualquier cuenta con deuda. El sistema SHALL mostrar el total de las cuentas al pie de la lista. El sistema SHALL NOT almacenar el saldo de ninguna cuenta.

#### Scenario: Lista de cuentas con saldos
- **WHEN** el usuario abre el panel de una cartera con tres cuentas
- **THEN** el sistema muestra cada una con su saldo actual y el total de las tres

#### Scenario: Cuenta de credito en rojo
- **WHEN** una cuenta de credito debe 600
- **THEN** el panel la presenta con saldo negativo

#### Scenario: Cuentas archivadas separadas
- **WHEN** existen cuentas archivadas en la cartera
- **THEN** el sistema las presenta en una seccion separada y las excluye del total visible de cuentas activas

---

### Requirement: El panel muestra el disponible de cada sobre
El sistema SHALL listar los sobres de la cartera abierta con su nombre, su grupo y su disponible actual, y SHALL presentarlos agrupados por grupo con el total de cada grupo. El sistema SHALL permitir plegar y desplegar cada grupo. El sistema SHALL NOT almacenar el disponible de ningun sobre.

#### Scenario: Sobres agrupados con totales
- **WHEN** el usuario consulta el panel
- **THEN** el sistema presenta los sobres agrupados y muestra el total disponible de cada grupo

#### Scenario: Recalculo del disponible
- **WHEN** el usuario registra un gasto en un sobre
- **THEN** el disponible de ese sobre y el total de su grupo se actualizan

#### Scenario: Sobres archivados separados
- **WHEN** existen sobres archivados con disponible distinto de cero
- **THEN** el sistema los presenta en una seccion separada e incluida en el total de sus grupos

---

### Requirement: El panel muestra el dinero suelto
El sistema SHALL presentar el dinero suelto de la cartera como la diferencia entre la suma de los saldos de sus cuentas y la suma de los disponibles de sus sobres. Cuando el dinero suelto sea negativo, el sistema SHALL informar que el usuario ha asignado mas dinero del que tiene. El sistema SHALL NOT almacenar el dinero suelto.

#### Scenario: Dinero suelto positivo
- **WHEN** las cuentas suman 30,000 y los disponibles suman 22,000
- **THEN** el panel muestra 8,000 de dinero suelto

#### Scenario: Dinero suelto negativo
- **WHEN** los disponibles de la cartera suman 35,000 y sus cuentas suman 30,000
- **THEN** el panel muestra -5,000 e informa que se asigno mas de lo que se tiene

#### Scenario: Sin dinero suelto
- **WHEN** la suma de los disponibles iguala la suma de los saldos
- **THEN** el panel muestra cero y no advierte sobre asignacion de mas

---

### Requirement: El panel destaca los sobres con disponible negativo
El sistema SHALL presentar los sobres con disponible negativo de forma destacada y ordenada antes que los demas. El sistema SHALL informar el monto del desborde de cada uno. El sistema SHALL mantener destacado un sobre archivado que haya quedado con disponible negativo, y SHALL NOT ocultarlo por estar archivado.

#### Scenario: Sobres en rojo
- **WHEN** dos sobres de la cartera tienen disponible negativo
- **THEN** el panel los muestra destacados, con su monto de desborde, y antes que los sobres con disponible positivo

#### Scenario: Sobre archivado en negativo
- **WHEN** un sobre archivado acumula movimientos y queda con disponible negativo
- **THEN** el panel lo muestra entre los sobres en desborde

#### Scenario: Desborde subsanado
- **WHEN** el usuario tapa un desborde y el sobre vuelve a cero o positivo
- **THEN** el panel deja de destacarlo

---

### Requirement: El panel ofrece el acceso para tapar un desborde
Cuando el panel muestre un sobre con disponible negativo y exista dinero suelto suficiente en la cartera, el sistema SHALL ofrecer la accion de tapar el desborde, indicando de donde puede tomar el dinero. El sistema SHALL NOT aplicar la cobertura de forma automatica. El sistema SHALL rechazar la accion cuando no exista dinero suelto suficiente.

#### Scenario: Ofrecer tapar el desborde
- **WHEN** un sobre esta en -400 y hay 5,000 de dinero suelto
- **THEN** el panel ofrece la accion de tapar el desborde e informa que puede cubrirse con dinero suelto

#### Scenario: Desborde sin cobertura
- **WHEN** un sobre esta en -400 y solo hay 200 de dinero suelto
- **THEN** el panel no ofrece la accion y explica que el dinero suelto no cubre el desborde

#### Scenario: Cobertura manual
- **WHEN** el usuario decide tapar el desborde y lo confirma
- **THEN** el disponible del sobre y el dinero suelto se actualizan segun el monto indicado

---

### Requirement: El panel muestra el gasto y el ingreso del periodo
El sistema SHALL mostrar el total gastado y el total ingresado en el periodo seleccionado, y SHALL permitir cambiar de periodo para consultar otros meses. Los totales SHALL derivarse de los movimientos del periodo y SHALL excluir los traspasos, porque estos no representan gasto ni ingreso. El sistema SHALL permitir filtrar el panel por un periodo concreto.

#### Scenario: Totales del mes
- **WHEN** el usuario consulta el panel en septiembre
- **THEN** el sistema muestra el total gastado y el total ingresado de septiembre

#### Scenario: Cambio de periodo
- **WHEN** el usuario selecciona agosto
- **THEN** el sistema muestra los totales de agosto

#### Scenario: Los traspasos no cuentan como gasto
- **WHEN** el periodo incluye traspasos entre cuentas
- **THEN** el total gastado del periodo no los incluye

#### Scenario: Recalculo de un periodo pasado
- **WHEN** el usuario registra un movimiento con fecha de un periodo anterior
- **THEN** los totales de ese periodo se actualizan

---

### Requirement: El panel muestra los movimientos pendientes de asignar
El sistema SHALL indicar cuantos movimientos de la cartera no tienen sobre asignado y SHALL ofrecer el acceso a asignarles uno. El sistema SHALL incluir el importe de estos movimientos dentro del dinero suelto, y SHALL NOT considerarlos gasto asignado a ningun sobre. El sistema SHALL permitir que estos movimientos sigan visibles despues de que el usuario abandone la accion de asignarlos.

#### Scenario: Movimientos sin asignar
- **WHEN** existen tres movimientos sin sobre asignado
- **THEN** el panel los cuenta e informa que falta asignarlos

#### Scenario: Acceso a la asignacion
- **WHEN** el usuario selecciona la accion de asignar desde el panel
- **THEN** el sistema le permite elegir un sobre para cada movimiento pendiente

#### Scenario: Asignar y actualizar el conteo
- **WHEN** el usuario asigna un sobre a uno de los movimientos pendientes
- **THEN** el conteo de pendientes disminuye y el disponible del sobre refleja el importe

---

### Requirement: El panel muestra el progreso de las metas activas
El sistema SHALL presentar las metas activas de la cartera con su avance, su monto restante y su estado, y SHALL destacar las metas marcadas como retrasadas. El sistema SHALL recalcular el avance de cada meta tras cualquier cambio en el disponible de su sobre.

#### Scenario: Metas en el panel
- **WHEN** la cartera tiene dos metas activas
- **THEN** el panel muestra el avance de ambas

#### Scenario: Meta retrasada destacada
- **WHEN** una meta activa esta marcada como retrasada
- **THEN** el panel la destaca e informa cuanto falta para alcanzar el ritmo necesario

#### Scenario: Avance recalculado
- **WHEN** el usuario asigna dinero al sobre de una meta
- **THEN** el avance mostrado en el panel se actualiza

---

### Requirement: El panel permite cambiar de cartera
El sistema SHALL permitir al usuario cambiar la cartera abierta desde el propio panel. Al cambiar, el sistema SHALL presentar la informacion de la nueva cartera y SHALL NOT conservar importes de la anterior. El sistema SHALL NOT mezclar cifras de carteras distintas en ningun momento.

#### Scenario: Cambio de cartera
- **WHEN** el usuario selecciona otra cartera desde el panel
- **THEN** el sistema muestra el patrimonio, las cuentas y los sobres de esa cartera

#### Scenario: Carteras de distinta moneda
- **WHEN** el usuario cambia de una cartera en MXN a una en USD
- **THEN** el sistema presenta todos los importes en la moneda de la cartera nueva

#### Scenario: Sin arrastre de cifras
- **WHEN** el usuario cambia de cartera
- **THEN** ningun valor de la cartera anterior permanece visible

---

### Requirement: El panel no muestra totales entre carteras de distinta moneda
El sistema SHALL NOT calcular ni presentar ningun importe que combine carteras de monedas diferentes. El sistema SHALL presentar cada cartera de forma independiente y SHALL NOT ofrecer un total global del usuario. Esta restriccion SHALL aplicarse a todas las cifras del panel, incluidos el patrimonio, los totales por grupo y las comparaciones.

#### Scenario: Sin total global
- **WHEN** el usuario tiene una cartera en MXN y otra en USD
- **THEN** el panel no muestra ningun total que las sume

#### Scenario: Cifras de la cartera abierta
- **WHEN** el panel muestra totales por grupo o por cuenta
- **THEN** todos esos totales corresponden unicamente a la cartera abierta

#### Scenario: Usuario con una sola cartera
- **WHEN** el usuario tiene una sola cartera
- **THEN** el panel muestra sus cifras sin restricciones adicionales

---

### Requirement: El panel es de solo lectura
El sistema SHALL presentar el panel sin permitir capturar, editar ni eliminar cuentas, sobres, asignaciones ni movimientos desde el propio panel. El sistema SHALL ofrecer enlaces a las capacidades correspondientes para realizar cualquier operacion. El sistema SHALL NOT permitir modificar datos desde la presentacion de resumen.

#### Scenario: El panel no captura datos
- **WHEN** el usuario visualiza el panel
- **THEN** no encuentra campos para crear ni editar cuentas, sobres o movimientos

#### Scenario: Acceso a las operaciones
- **WHEN** el usuario necesita registrar un gasto
- **THEN** el panel le ofrece el acceso a la capacidad de transacciones

#### Scenario: Toda operacion ocurre fuera del panel
- **WHEN** el usuario navega por el panel
- **THEN** ninguna accion del panel modifica datos de la cartera

---

### Requirement: El panel informa cuando los datos se recalculan
Cuando una operacion cambie el periodo de referencia o afecte periodos ya cerrados, el sistema SHALL informar al usuario que los valores mostrados en esos periodos van a cambiar. El sistema SHALL NOT bloquear la operacion por tratarse de un periodo anterior, y SHALL recalcular y presentar los valores despues de aplicarla.

#### Scenario: Aviso de recalculo
- **WHEN** el usuario registra un movimiento con fecha de un periodo anterior
- **THEN** el sistema informa que ese periodo y los posteriores se modificaran

#### Scenario: La operacion no se bloquea
- **WHEN** el usuario registra un movimiento retroactivo
- **THEN** el sistema lo registra sin impedimentos

#### Scenario: Valores despues del recalculo
- **WHEN** termina el recalculo de un periodo afectado
- **THEN** el panel muestra los valores ya actualizados
