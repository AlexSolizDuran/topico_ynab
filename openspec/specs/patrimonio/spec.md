# patrimonio Specification

## Purpose
Permitir al usuario observar como ha cambiado su patrimonio a lo largo del tiempo, en lugar de conocer unicamente el valor del momento actual. El sistema calcula el patrimonio al cierre de cada periodo a partir de los mismos datos derivados que usa el panel, de modo que cualquier correccion posterior se refleja tambien en la historia. El historial corresponde siempre a una sola cartera y nunca combina importes de monedas distintas.

## Requirements

### Requirement: El sistema calcula el patrimonio al cierre de cada periodo
El sistema SHALL determinar el patrimonio de la cartera al cierre de cada periodo en que existan datos, calculado como la suma de los disponibles de sus sobres a esa fecha mas el dinero suelto a esa fecha. El sistema SHALL tomar como referencia el ultimo momento del periodo. El sistema SHALL recalcular el valor de un periodo cuando los datos que lo afectan cambien.

#### Scenario: Patrimonio al cierre de un periodo
- **WHEN** una cartera cierra un periodo con 22,000 en sobres y 8,000 sin asignar
- **THEN** el sistema registra un patrimonio de 30,000 para ese periodo

#### Scenario: Periodo sin datos
- **WHEN** un periodo no tiene movimientos, asignaciones ni cuentas con saldo
- **THEN** el sistema no lo incluye en el historial

#### Scenario: Recalculo del patrimonio historico
- **WHEN** el usuario registra un movimiento con fecha dentro de un periodo ya cerrado
- **THEN** el patrimonio de ese periodo se recalcula con el nuevo dato

---

### Requirement: El sistema presenta la evolucion mes a mes
El sistema SHALL presentar el patrimonio de la cartera en orden cronologico, con un valor por periodo y con la diferencia absoluta y porcentual respecto al periodo anterior. El sistema SHALL permitir consultar un rango de periodos y SHALL ordenar la presentacion del mas antiguo al mas reciente.

#### Scenario: Serie de periodos
- **WHEN** existen cuatro periodos con datos en la cartera
- **THEN** el sistema muestra los cuatro valores en orden cronologico

#### Scenario: Variacion entre periodos
- **WHEN** el patrimonio paso de 28,000 a 30,000
- **THEN** el sistema informa un aumento de 2,000 y su porcentaje respecto al periodo anterior

#### Scenario: Periodo sin comparacion previa
- **WHEN** el primer periodo con datos no tiene un periodo anterior con el que compararse
- **THEN** el sistema lo presenta sin variacion respecto a un periodo previo

---

### Requirement: El historial refleja las correcciones retroactivas
Cuando el usuario corrija, registre o elimine movimientos con fechas de periodos anteriores, el sistema SHALL recalcular el patrimonio de todos los periodos afectados y de los posteriores. El sistema SHALL informar al usuario que la historia cambio. El sistema SHALL NOT conservar valores historicos congelados que contradigan los datos actuales.

#### Scenario: Correccion de un movimiento pasado
- **WHEN** el usuario corrige un gasto registrado en marzo estando en junio
- **THEN** el patrimonio de marzo y de los periodos posteriores se recalcula

#### Scenario: Aviso de historia modificada
- **WHEN** una operacion altera periodos ya cerrados
- **THEN** el sistema informa que la historia del patrimonio cambio

#### Scenario: La historia no queda congelada
- **WHEN** el usuario consulta el historial despues de una correccion retroactiva
- **THEN** los valores mostrados coinciden con los que resulta de los datos actuales

---

### Requirement: El historial corresponde a una sola cartera
El sistema SHALL presentar el historial de patrimonio unicamente de la cartera abierta y SHALL NOT combinar series de carteras distintas. El sistema SHALL expresar todos los valores en la moneda de esa cartera. El sistema SHALL NOT calcular variaciones que impliquen importes de otra moneda.

#### Scenario: Historial de una cartera
- **WHEN** el usuario selecciona una cartera
- **THEN** el sistema muestra exclusivamente la evolucion de esa cartera

#### Scenario: Cambio de cartera en el historial
- **WHEN** el usuario cambia de cartera abierta
- **THEN** el sistema muestra la serie de la nueva cartera en su propia moneda

#### Scenario: Sin series combinadas
- **WHEN** el usuario tiene carteras en MXN y en USD
- **THEN** el sistema no ofrece un historial que sume ambas series
