# movimientos Specification

## Purpose
Muestra las transacciones recientes del usuario autenticado, limitadas a las primeras diez en el panel, y provee búsqueda y filtros (texto, cuenta, categoría, ingreso/gasto) tanto en el panel como en un modal de "ver todos" que muestra la lista filtrada completa.

## Requirements

### Requirement: El panel muestra los primeros diez movimientos
El panel de movimientos SHALL renderizar como máximo los primeros diez movimientos que coincidan con los filtros activos, ordenados por fecha de forma descendente.

#### Scenario: Más de diez movimientos
- **WHEN** el usuario tiene más de diez movimientos
- **THEN** el panel muestra los primeros diez y un botón "Ver todos los movimientos (N)"

#### Scenario: Diez movimientos o menos
- **WHEN** el usuario tiene diez movimientos coincidentes o menos
- **THEN** el panel los muestra todos y el botón "ver todos" queda oculto

### Requirement: Los movimientos se pueden filtrar
La lista de movimientos SHALL ser filtrable por texto (descripción o categoría), cuenta, categoría y tipo (ingreso/gasto); el filtrado se aplica al instante y se sincroniza entre el panel y el modal.

#### Scenario: Filtrar por texto
- **WHEN** el usuario escribe en el campo de búsqueda
- **THEN** solo se muestran los movimientos cuya descripción o categoría contenga el texto

#### Scenario: Filtrar por tipo
- **WHEN** el usuario selecciona "Ingresos" o "Gastos"
- **THEN** solo se muestran los movimientos de ese tipo

#### Scenario: Filtros combinados
- **WHEN** el usuario combina los filtros de texto, cuenta, categoría y tipo
- **THEN** solo se muestran los movimientos que coinciden con todos los filtros activos

### Requirement: El modal muestra todos los movimientos con detalle
El botón "ver todos" SHALL abrir un modal con la lista completa y filtrada de movimientos, su propia búsqueda y sus propios filtros, y una forma de cerrarlo (botón, clic en el fondo o Escape).

#### Scenario: Abrir el modal
- **WHEN** el usuario hace clic en "Ver todos los movimientos"
- **THEN** se abre un modal con la lista filtrada completa y sus propios controles de filtrado

#### Scenario: Cerrar el modal
- **WHEN** el usuario hace clic en el botón de cerrar, hace clic en el fondo o presiona Escape
- **THEN** el modal se cierra y la página vuelve al panel

### Requirement: Los montos llevan signo según el tipo
Los montos de ingreso SHALL mostrarse con un signo `+` y los montos de gasto con un signo `-`.

#### Scenario: Gasto con signo
- **WHEN** un movimiento es un gasto
- **THEN** su monto se muestra con un signo menos inicial

#### Scenario: Ingreso con signo
- **WHEN** un movimiento es un ingreso
- **THEN** su monto se muestra con un signo más inicial
