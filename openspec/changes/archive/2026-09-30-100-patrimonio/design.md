# Design

## Context

patrimonio es la capacidad #10 del proyecto. Agrega la información acumulada de las capacidades previas (carteras #2, cuentas #3, sobres #5, transacciones #6 y asignaciones).
A diferencia de sistemas contables tradicionales que almacenan cierres mensuales congelados en tablas de balance, este sistema calcula el patrimonio al vuelo a partir de los datos vivos, respetando la regla del dinero y asegurando que las correcciones retroactivas actualicen la historia inmediatamente.

## Decisions

### D1: Invariante del patrimonio y cálculo derivado al cierre
El patrimonio se define por la invariante: patrimonio = suma(disponibles) + dinero_suelto.
Dado que dinero_suelto = suma(saldos_cuentas) - suma(disponibles), matemáticamente patrimonio es equivalente a la suma de saldos de las cuentas al corte del periodo.
Ambas partes (disponible en sobres y dinero suelto) se calculan con respecto al último momento del periodo (fecha < finDePeriodo(periodo) para movimientos, y periodo <= P para asignaciones).
No se añade ninguna tabla de balances congelados: cada consulta calcula los valores al momento a partir de las tablas base.

### D2: Criterio de inclusión de periodos con datos
Para armar la serie histórica:
1. Se identifican los periodos donde ocurrieron eventos (movimientos, asignaciones o fechas de creación de cuentas con saldo inicial).
2. Para cada periodo del rango, se evalúa si existen datos: tiene movimientos en el mes, asignaciones en el mes, o cuentas vivas con saldo al cierre de ese mes.
3. Los periodos sin movimientos, asignaciones ni cuentas con saldo quedan expresamente excluidos del historial.

### D3: Orden cronológico y variaciones relativas con céntimos BigInt
El historial se entrega ordenado cronológicamente (del periodo más antiguo al más reciente).
Para cada periodo se calcula:
- diferencia_absoluta: patrimonio_actual - patrimonio_anterior (como Dinero con signo)
- variacion_porcentual: (patrimonio_actual - patrimonio_anterior) / patrimonio_anterior * 100
El primer periodo no tiene comparación previa (valores nulos). Las operaciones numéricas se efectúan sobre céntimos exactos con BigInt para evitar pérdidas de precisión.

### D4: Detección de operaciones retroactivas y aviso
Se define la función esPeriodoCerrado para identificar si una fecha u operación corresponde a un periodo anterior al actual.
Cuando una mutación (creación, edición o eliminación de un movimiento) afecta un periodo cerrado, se emite el aviso La historia del patrimonio cambió, informando al usuario del impacto retroactivo.

### D5: Aislamiento estricto por cartera y moneda única
El repositorio exige usuarioId y carteraId en todas sus funciones, verificando la pertenencia y vigencia de la cartera.
Los datos corresponden exclusivamente a la cartera solicitada y se expresan en su propia moneda.
No existe ninguna agregación multimoneda ni combinación de carteras.

### D6: Componentes de interfaz
Se crea src/components/patrimonio.tsx con la tarjeta de resumen patrimonial, el desglose de disponibles y dinero suelto, y la tabla / visualización de la evolución cronológica mes a mes con sus badges de variación y alertas de modificación histórica.