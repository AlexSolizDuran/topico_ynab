# Design

## Context

`panel` es la capacidad #11 del proyecto. Actúa como el centro neurálgico de lectura donde convergen las 10 capacidades previas (autenticación #1, carteras #2, cuentas #3, grupos #4, sobres #5, transacciones #6, traspasos #7, recurrencias #8, metas #9 y patrimonio #10).
El panel es una vista de resumen **de solo lectura**: no captura datos directamente, sino que expone el estado financiero derivado en tiempo real y ofrece accesos a las capacidades operativas.

## Decisions

### D1: Repositorio centralizado `consultarDatosPanel`
Se implementa en `src/repos/panel.ts` una función integral que recibe `db`, `usuario_id`, `cartera_id` y `periodo`.
Cumpliendo con la regla del repositorio centralizado y sin RLS:
- Exige `usuario_id` y `cartera_id` verificando la pertenencia y vigencia de la cartera.
- Deriva en tiempo real:
  - `patrimonio`: suma de disponibles de sobres + dinero suelto.
  - `dinero_suelto`: suma de saldos de cuentas - suma de disponibles de sobres. Bandera `sobreasignado` si es negativo.
  - `cuentas`: lista de cuentas activas con su saldo (crédito y saldos deudores en negativo) y suma total de cuentas activas. Lista separada de cuentas archivadas.
  - `grupos`: sobres agrupados por grupo, con disponible de cada sobre y suma total por grupo. Sobres en negativo ordenados prioritariamente al inicio. Sobres archivados con saldo distinto de cero en sección separada.
  - `desbordes`: sobres en negativo con importe de desborde y evaluación de si el dinero suelto alcanza para cubrirlos.
  - `totales_periodo`: total gastado y total ingresado en el periodo indicado (excluyendo estrictamente los traspasos).
  - `pendientes_asignacion`: cantidad y lista de movimientos sin sobre asignado (`sobre_id IS NULL`).
  - `metas`: metas activas con porcentaje de avance, importe restante y badge de retrasada si aplica.

### D2: La regla del dinero y derivación estricta
Todos los importes se mantienen como `Dinero` (`string`).
Las sumas y agregaciones se resuelven en SQL (`sum`, `coalesce`).
El formateo en pantalla delega exclusivamente en `formatear(importe, moneda)` de `src/dinero.ts`.

### D3: Aislamiento absoluto por cartera y moneda
El panel pertenece a una única cartera abierta.
No se proporciona ningún total consolidado global del usuario que combine carteras.
Al cambiar de cartera mediante el selector, se descarta el estado de la cartera anterior y se cargan los valores de la nueva cartera en su propia moneda sin mezclar importes.

### D4: Naturaleza de solo lectura y accesos contextuales
El panel no expone campos para crear ni editar entidades.
Ofrece enlaces a las acciones operativas:
- Si hay desborde y suficiente dinero suelto: enlace o botón contextual para tapar el desborde (nunca automático).
- Si hay movimientos sin sobre: enlace o botón contextual para ir a la asignación de sobre.
- Enlace para ver todas las cuentas y todos los sobres.

### D5: Aviso ante recálculos retroactivos
El panel informa con un aviso destacado cuando una operación en un periodo cerrado o cambio de periodo provoca el recálculo de datos históricos.
