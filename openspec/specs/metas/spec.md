# metas Specification

## Purpose
Permitir que un sobre tenga un objetivo de ahorro con fecha limite, y que el sistema muestre al usuario cuanto lleva, cuanto falta y si va en camino. La meta no es un tipo nuevo de sobre sino un objetivo asociado a uno existente, y su avance se deriva del disponible de ese sobre. El sistema informa cuando una meta se retrasa, pero nunca cambia su estado por decision propia.

## Requirements

### Requirement: Un sobre puede tener un monto objetivo y una fecha limite
El sistema SHALL permitir al usuario asociar a un sobre un monto objetivo y, de forma opcional, una fecha limite. El sistema SHALL validar que el monto objetivo sea positivo. El sistema SHALL NOT crear un sobre separado para una meta: la meta se define sobre un sobre existente y comparte su disponible.

#### Scenario: Crear una meta sobre un sobre existente
- **WHEN** el usuario asigna a un sobre Vacaciones un objetivo de 20,000 con fecha limite el 1 de diciembre
- **THEN** el sistema registra la meta y la muestra asociada a ese sobre

#### Scenario: Meta sin fecha limite
- **WHEN** el usuario define un objetivo sin indicar fecha limite
- **THEN** el sistema la acepta como meta sin vencimiento

#### Scenario: Monto objetivo no positivo
- **WHEN** el usuario intenta definir un monto objetivo de cero o negativo
- **THEN** el sistema rechaza la operacion

#### Scenario: La meta comparte el disponible del sobre
- **WHEN** el usuario registra un gasto en el sobre que tiene meta
- **THEN** el avance de la meta baja porque se calcula a partir del disponible de ese mismo sobre

---

### Requirement: El sistema muestra el avance de la meta activa
El sistema SHALL presentar el monto objetivo, el disponible actual del sobre, la diferencia restante y el porcentaje de avance. Cuando la meta tenga fecha limite, el sistema SHALL calcular e informar cuanto necesita asignar el usuario por periodo restante. El sistema SHALL NOT almacenar ninguno de estos valores, y SHALL recalcularlos tras cada movimiento o asignacion.

#### Scenario: Avance de una meta
- **WHEN** un sobre con objetivo de 20,000 tiene 12,400 disponibles
- **THEN** el sistema muestra 12,400 de 20,000, un avance del 62 por ciento y 7,600 restantes

#### Scenario: Ritmo necesario por periodo
- **WHEN** a una meta de 20,000 le faltan 7,600 y quedan 4 periodos
- **THEN** el sistema informa que necesita 1,900 por periodo

#### Scenario: Recalculo tras un movimiento
- **WHEN** el usuario registra un gasto en el sobre con meta
- **THEN** el avance, el restante y el ritmo necesario se actualizan de inmediato

#### Scenario: Meta sin fecha limite
- **WHEN** la meta no tiene fecha limite
- **THEN** el sistema muestra el avance y el restante sin informar un ritmo por periodo

---

### Requirement: El sistema marca la meta activa como retrasada
Cuando una meta con fecha limite tenga un disponible que no alcanza para llegar al objetivo dentro de los periodos restantes, el sistema SHALL marcarla como retrasada e informar al usuario. El sistema SHALL recalcular esa marca tras cada cambio en el disponible o en la fecha limite, y SHALL revertirla a en camino si el disponible vuelve a alcanzar el ritmo necesario.

#### Scenario: Meta que se retrasa
- **WHEN** una meta con fecha limite requiere 2,000 por periodo y el usuario lleva 500 asignados
- **THEN** el sistema la marca como retrasada e informa cuanto falta para alcanzar el ritmo

#### Scenario: Meta que se recupera
- **WHEN** una meta marcada como retrasada recibe asignaciones que restablecen el ritmo necesario
- **THEN** el sistema la vuelve a marcar como en camino

#### Scenario: Fecha limite superada
- **WHEN** la fecha limite de una meta ya paso y su objetivo no se ha alcanzado
- **THEN** el sistema la mantiene marcada como retrasada e informa que la fecha vencio

#### Scenario: Meta completada antes de tiempo
- **WHEN** el disponible del sobre alcanza el monto objetivo
- **THEN** el sistema deja de marcar la meta como en camino o retrasada y la presenta como cumplida

---

### Requirement: Un sobre admite varias metas con una sola activa
El sistema SHALL permitir que un sobre tenga varias metas a lo largo del tiempo, y SHALL mantener como activa unicamente a una de ellas. El sistema SHALL permitir crear una meta nueva para un sobre cuando su meta activa este completada o abandonada, y SHALL rechazar la creacion de una segunda meta activa para el mismo sobre. El sistema SHALL conservar el historial de las metas anteriores del sobre.

#### Scenario: Segunda meta tras completar la primera
- **WHEN** el usuario completo una meta de 20,000 y crea una nueva de 25,000 en el mismo sobre
- **THEN** el sistema registra la nueva meta como activa y conserva la anterior en el historial

#### Scenario: Dos metas activas simultaneas
- **WHEN** el usuario intenta crear una meta nueva en un sobre que ya tiene una meta activa
- **THEN** el sistema rechaza la operacion y sugiere completar o abandonar la actual

#### Scenario: Historial de metas de un sobre
- **WHEN** el usuario consulta el historial de un sobre con varias metas
- **THEN** el sistema muestra cada meta con su objetivo, su estado y el periodo en que estuvo vigente

#### Scenario: Cambiar de meta activa
- **WHEN** el usuario abandona la meta activa de un sobre que tiene historial
- **THEN** el sistema la marca como abandonada y permite crear una nueva activa

---

### Requirement: El usuario completa o abandona una meta
El sistema SHALL permitir al usuario marcar una meta activa como completada o como abandonada. El sistema SHALL NOT cambiar el estado de una meta activa por decision propia, y SHALL NOT considerar completada una meta cuyo disponible no alcance el monto objetivo. Al completar o abandonar una meta, el sistema SHALL liberar el sobre para recibir una meta nueva sin exigir vaciarlo.

#### Scenario: Completar una meta alcanzada
- **WHEN** el disponible del sobre alcanzo el monto objetivo y el usuario confirma
- **THEN** el sistema marca la meta como completada y registra la fecha

#### Scenario: Completar una meta no alcanzada
- **WHEN** el usuario intenta marcar como completada una meta cuyo disponible no alcanza el objetivo
- **THEN** el sistema rechaza la operacion e indica cuanto falta

#### Scenario: Abandonar una meta que ya no interesa
- **WHEN** el usuario abandona una meta activa
- **THEN** el sistema la marca como abandonada, conserva el dinero ya asignado al sobre y permite definir una meta nueva

#### Scenario: El sistema no completa metas por su cuenta
- **WHEN** una meta activa alcanza su monto objetivo sin intervencion del usuario
- **THEN** el sistema la presenta como cumplida pero no la retira de la lista de metas activas hasta que el usuario lo confirme

---

### Requirement: Una meta abandonada sigue intacta y una meta de un sobre archivado queda abandonada
El sistema SHALL mantener el historial de las metas de un sobre aunque el sobre se archive, y SHALL marcar como abandonada la meta activa de un sobre en el momento en que ese sobre se archiva, aunque el sobre siga recibiendo devoluciones y su disponible vuelva a ser distinto de cero. El sistema SHALL NOT permitir definir una meta nueva sobre un sobre archivado.

#### Scenario: Meta de un sobre archivado
- **WHEN** el usuario archiva un sobre que tenia una meta activa
- **THEN** el sistema marca esa meta como abandonada y conserva su historial

#### Scenario: Devolucion posterior a la meta abandonada
- **WHEN** un sobre archivado cuya meta fue abandonada recibe una devolucion
- **THEN** la meta permanece abandonada y no vuelve a estar activa

#### Scenario: Definir una meta en un sobre archivado
- **WHEN** el usuario intenta crear una meta en un sobre archivado
- **THEN** el sistema rechaza la operacion e indica que debe desarchivar el sobre

#### Scenario: Consultar el historial de metas de un sobre archivado
- **WHEN** el usuario consulta el historial de metas de un sobre archivado
- **THEN** el sistema muestra todas sus metas con sus estados, incluidas las abandonadas
