# comparativos Specification

## Purpose
Permitir al usuario contrastar como ha evolucionado su gasto, su ingreso y el uso de sus sobres entre distintos periodos, para detectar tendencies y desviaciones. Las comparaciones se derivan de los movimientos existentes y por lo tanto se recalculan cuando el usuario corrige datos del pasado. Toda comparacion se limita a una sola cartera y se expresa en su moneda.

## Requirements

### Requirement: El usuario compara categorias entre periodos
El sistema SHALL permitir al usuario comparar los totales de un conjunto de periodos seleccionados, desglosados por sobre y por grupo, y SHALL mostrar para cada elemento el importe de cada periodo y su diferencia respecto al periodo de referencia. El sistema SHALL considerar el gasto registrado en cada sobre, y SHALL excluir los traspasos porque no representan gasto. El usuario SHALL poder elegir cual es el periodo de referencia.

#### Scenario: Comparacion de tres periodos
- **WHEN** el usuario selecciona enero, febrero y marzo como referencia marzo
- **THEN** el sistema muestra el gasto de cada sobre en los tres periodos y la diferencia de enero y febrero respecto a marzo

#### Scenario: Comparacion por grupo
- **WHEN** el usuario compara dos periodos desglosando por grupo
- **THEN** el sistema muestra el total de cada grupo en ambos periodos

#### Scenario: Los traspasos no cuentan como gasto
- **WHEN** el periodo comparado incluye traspasos entre cuentas
- **THEN** el total de gasto de ese periodo no los incluye

#### Scenario: Periodo de referencia elegible
- **WHEN** el usuario cambia el periodo de referencia
- **THEN** el sistema recalcula las diferencias mostradas respecto al nuevo periodo

---

### Requirement: El sistema destaca las variaciones relevantes
El sistema SHALL identificar y destacar los sobres y grupos cuya variacion respecto al periodo de referencia supere un umbral que el sistema defina, y SHALL presentar la direccion de la variacion. El sistema SHALL informar la variacion tanto en importe absoluto como en porcentaje. El sistema SHALL permitir al usuario ajustar el umbral de destaque.

#### Scenario: Variacion destacada
- **WHEN** un sobre gasto 1,200 en el periodo de referencia y 3,000 en el comparado
- **THEN** el sistema lo destaca e informa un aumento de 1,800

#### Scenario: Umbral ajustable
- **WHEN** el usuario cambia el umbral de destaque
- **THEN** el sistema vuelve a evaluar que elementos quedan destacados

#### Scenario: Sin variaciones relevantes
- **WHEN** ninguna variacion supera el umbral
- **THEN** el sistema no destaca ningun elemento e informa que no hay variaciones relevantes

---

### Requirement: La comparacion refleja las correcciones retroactivas
Cuando el usuario registre, edite o elimine movimientos con fechas de periodos ya comparados, el sistema SHALL recalcular los totales y las variaciones de esos periodos. El sistema SHALL informar al usuario que la comparacion cambio. El sistema SHALL NOT conservar totales historicos que contradigan los datos actuales.

#### Scenario: Correccion de un gasto pasado
- **WHEN** el usuario corrige un gasto de marzo y luego compara marzo con abril
- **THEN** el total de marzo refleja la correccion y la variacion se recalcula

#### Scenario: Aviso de comparacion modificada
- **WHEN** una operacion altera un periodo ya comparado
- **THEN** el sistema informa que los resultados de la comparacion cambiaron

#### Scenario: Alta retroactiva
- **WHEN** el usuario registra un gasto con fecha de un periodo anterior y luego lo compara
- **THEN** el total de ese periodo incluye el nuevo gasto

---

### Requirement: La comparacion se limita a una cartera
El sistema SHALL comparar unicamente elementos de la cartera abierta y SHALL NOT presentar totales que combinen carteras de monedas distintas. El sistema SHALL expresar todos los importes en la moneda de la cartera abierta. El sistema SHALL NOT calcular variaciones entre importes de monedas diferentes.

#### Scenario: Comparacion dentro de una cartera
- **WHEN** el usuario compara periodos
- **THEN** todos los elementos comparados pertenecen a la cartera abierta

#### Scenario: Cambio de cartera abierta
- **WHEN** el usuario cambia de cartera y solicita una comparacion
- **THEN** el sistema compara los elementos de la nueva cartera en su propia moneda

#### Scenario: Sin comparaciones entre monedas
- **WHEN** el usuario tiene carteras en MXN y USD
- **THEN** el sistema no ofrece comparar elementos de una con elementos de la otra
