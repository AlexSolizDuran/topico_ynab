# grupos Specification

## Purpose
Organizar los sobres de una cartera en categorias visuales que facilitate su lectura. Un grupo agrupa, pliega y suma los disponibles de los sobres que contiene. Los grupos son exclusivamente presentacionales: no tienen presupuesto propio, no almacenan totales y no alteran ningun calculo financiero.

## Requirements

### Requirement: Un sobre pertenece a un grupo
Todo sobre SHALL pertenecer a exactamente un grupo de su cartera desde el momento de su creacion, y el usuario SHALL poder cambiarlo a otro grupo en cualquier momento. El sistema SHALL rechazar la creacion de un sobre sin grupo asignado.

#### Scenario: Crear un sobre dentro de un grupo
- **WHEN** el usuario crea un sobre indicando un grupo de su cartera
- **THEN** el sistema lo registra dentro de ese grupo y lo muestra en la lista agrupada

#### Scenario: Crear un sobre sin grupo
- **WHEN** el usuario intenta crear un sobre sin indicar un grupo
- **THEN** el sistema rechaza la creacion y solicita un grupo

#### Scenario: Mover un sobre a otro grupo
- **WHEN** el usuario cambia el grupo de un sobre que ya tiene movimientos
- **THEN** el sistema reubica el sobre y conserva intactos su disponible, su historial y sus asignaciones

---

### Requirement: Un grupo muestra el total disponible de sus sobres
El sistema SHALL calcular la suma de los disponibles de los sobres que pertenecen a un grupo y SHALL presentarla junto al nombre del grupo. El sistema SHALL permitir plegar y desplegar cada grupo, y el usuario SHALL poder ordenar los grupos y los sobres a su criterio.

#### Scenario: Total de un grupo
- **WHEN** el usuario consulta la lista de sobres
- **THEN** cada grupo muestra la suma de los disponibles de sus sobres junto a su nombre

#### Scenario: Grupo plegado
- **WHEN** el usuario pliega un grupo
- **THEN** el sistema oculta sus sobres y conserva visible el total del grupo

#### Scenario: Reordenar grupos
- **WHEN** el usuario cambia el orden de los grupos
- **THEN** el sistema los presenta en el nuevo orden sin alterar sus totales ni los de sus sobres

#### Scenario: Total recalculado
- **WHEN** se registra un movimiento en un sobre de un grupo
- **THEN** el total del grupo refleja el cambio porque se calcula, no se guarda

---

### Requirement: Un grupo no contiene otros grupos y puede archivarse
El sistema SHALL mantener los grupos en un unico nivel, de modo que un grupo no pueda contener a otro. El sistema SHALL permitir archivar un grupo sin ningun efecto sobre los sobres que contiene: estos siguen existiendo, conservan su disponible y solo quedan ocultos del agrupamiento visible.

#### Scenario: Intento de anidar grupos
- **WHEN** el usuario intenta asignar un grupo como parte de otro grupo
- **THEN** el sistema rechaza la operacion y explica que los grupos no se anidan

#### Scenario: Archivar un grupo con sobres
- **WHEN** el usuario archiva un grupo que contiene sobres con saldo
- **THEN** el sistema marca el grupo como archivado y conserva intactos los sobres, sus disponibles y su historial

#### Scenario: Efecto de archivar un grupo
- **WHEN** un grupo archivado tiene sobres con disponible negativo
- **THEN** el sistema sigue mostrando esos sobres en la lista de sobres en rojo, aunque su grupo ya no aparezca en el agrupamiento
