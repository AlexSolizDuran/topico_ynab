# Proposal

## Why

Permite al usuario observar la evolución cronológica de su patrimonio a lo largo del tiempo, y no únicamente el saldo en un momento estático. El cálculo se deriva en cada lectura al cierre de cada periodo como patrimonio = suma(disponibles) + dinero_suelto, garantizando que cualquier corrección retroactiva recalcule automáticamente los valores sin depender de instantáneas congeladas. El historial se aisla estrictamente por cartera y en su propia moneda.

patrimonio abarca 4 requisitos y 12 escenarios:
1. El sistema calcula el patrimonio al cierre de cada periodo (3 escenarios)
2. El sistema presenta la evolucion mes a mes (3 escenarios)
3. El historial refleja las correcciones retroactivas (3 escenarios)
4. El historial corresponde a una sola cartera (3 escenarios)

## What Changes

1. **Cálculos y Derivados según la Regla del Dinero (src/patrimonio/calculos.ts):**
   - Cálculo exacto de diferencia absoluta (Dinero) y variación porcentual (número a dos decimales y representación formateada con signo) a partir de importes en string utilizando aritmética de céntimos con BigInt.
   - Funciones para detección de periodos cerrados y retroactividad (esPeriodoCerrado, detectarAfectacionHistorica).

2. **Repositorio de Patrimonio (src/repos/patrimonio.ts):**
   - consultarPatrimonioAlCierre: determina para una cartera y usuario específicos el patrimonio al último momento de un periodo dado (suma(disponibles) + dinero_suelto).
   - consultarHistorialPatrimonio: genera la serie temporal de periodos con datos, ordenada cronológicamente del más antiguo al más reciente, con variaciones absolutas y porcentuales respecto al periodo anterior (sin comparación para el primer periodo).
   - Filtro de periodos sin datos: no incluye periodos sin movimientos, asignaciones ni cuentas con saldo.
   - Aislamiento estricto: requiere usuarioId y carteraId, valida pertenencia y opera exclusivamente en la moneda de la cartera consultada.

3. **Aviso de Corrección Retroactiva:**
   - Detección de operaciones que afecten periodos anteriores al actual, emitiendo el aviso de que la historia del patrimonio ha cambiado y recalculando dinámicamente sin persistir estados congelados.

4. **Componentes Visuales (src/components/patrimonio.tsx):**
   - Tarjeta y tabla de evolución patrimonial por periodos, desglosando disponible en sobres, dinero suelto y patrimonio total.
   - Indicadores de variación porcentual y monto de cambio con respecto al periodo anterior.
   - Banner o aviso informativo cuando la historia ha sido modificada por una corrección retroactiva.

5. **Pruebas y Verificación (	ests/patrimonio/):**
   - Pruebas unitarias de cálculos y formatos sin float.
   - Pruebas de integración con Postgres verificando consultas al cierre de periodo y derivación histórica.
   - Pruebas de escenarios retroactivos y aislamiento de carteras.
   - Cobertura total de los 12 escenarios normativos.