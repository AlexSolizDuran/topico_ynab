# Proposal

## Why

Las capacidades `060-transacciones` y `070-traspasos` ya permiten registrar movimientos, gastos, ingresos y traspasos puntuales entre cuentas. Sin embargo, en la vida real la gran mayoria de los gastos e ingresos de un usuario son periodicos: sueldos, alquiler/renta, servicios basicos (luz, agua, internet), suscripciones y seguros.

Hoy el usuario tendria que cargar manualmente cada uno de estos movimientos mes a mes o periodo a periodo. `recurrencias` resuelve esto permitiendo definir reglas que el sistema materializa automaticamente cuando corresponde.

Como la aplicacion corre en un entorno serverless (Vercel) sin Cron persistente por eleccion consciente de diseño (`config.yaml`), las recurrencias se materializan **al reabrir la aplicacion** (o consultar la cartera), detectando todas las fechas pendientes desde la fecha de inicio hasta el dia actual sin duplicar los ya registrados.

`recurrencias` abarca 5 requisitos y 18 escenarios:
1. `El usuario define una regla recurrente` (4 escenarios)
2. `El sistema genera el movimiento en la fecha correspondiente` (3 escenarios)
3. `El sistema no duplica movimientos ya registrados` (3 escenarios)
4. `El sistema genera los periodos pendientes` (3 escenarios)
5. `El usuario edita y desactiva reglas sin alterar lo ya generado` (4 escenarios)

## What Changes

1. **Base de Datos y Migración (`0005_recurrencias.sql`):**
   - Tabla `reglas_recurrentes` con `id`, `cartera_id`, `cuenta_id`, `sobre_id` (nullable), `descripcion`, `monto` (positivo), `tipo` ('gasto' | 'ingreso'), `frecuencia` ('diaria' | 'semanal' | 'mensual' | 'anual'), `dia`, `mes` (nullable), `fecha_inicio`, `activa`, `comercio`, `creado_en`, `eliminado_en`.
   - En `movimientos`: columna `regla_id` con FK a `reglas_recurrentes(id)` `ON DELETE SET NULL`, con indice parcial sobre los movimientos vivos para acelerar la deteccion de duplicados y equivalencias.

2. **Repositorio de Recurrencias (`src/repos/recurrencias.ts`):**
   - `crearReglaRecurrente`, `listarReglasRecurrentes`, `obtenerReglaRecurrente`, `editarReglaRecurrente`, `desactivarReglaRecurrente`, `activarReglaRecurrente`, `eliminarReglaRecurrente`.
   - Motor de materializacion: `materializarRecurrencias(db, usuario_id, cartera_id, fecha_hasta)`.
   - Logica de calculo de ocurrencias segun frecuencia (diaria, semanal, mensual, anual) respetando fechas validas de mes (ej. dia 31 en meses de 30 o 28 dias ajustado al ultimo dia del mes).
   - Deteccion de equivalencia para evitar duplicados: se omite si ya existe un movimiento vivo con igual `(regla_id, cuenta_id, monto, fecha)`. Si el movimiento previo fue eliminado logicamente (`eliminado_en IS NOT NULL`), se permite volver a generarlo.

3. **Validación (`src/recurrencias/validacion.ts`):**
   - Validacion Zod de importes positivos (usando `string` y `BigInt` para `numeric(16,2)`).
   - Validacion de dia valido (1..31) y mes obligatorio si la frecuencia es anual (1..12).
   - Verificacion de que cuenta y sobre pertenezcan a la misma cartera.

4. **Acciones del Servidor (`src/recurrencias/acciones.ts`):**
   - `accionCrearReglaRecurrente`, `accionEditarReglaRecurrente`, `accionAlternarReglaRecurrente`, `accionEliminarReglaRecurrente`, `accionMaterializarRecurrencias`.
   - Verificacion obligatoria de sesion y token de proteccion.

5. **Componentes y Vistas (`src/components/recurrencias.tsx`):**
   - Componentes para listar reglas activas/inactivas, formulario para alta y edicion de reglas recurrentes, boton de activacion/desactivacion, y banner/notificacion informativa de movimientos generados por ausencias.
   - Integracion en la pagina de cartera `src/app/(app)/cartera/[cartera]/page.tsx` para materializar al abrir la cartera e informar cuantos movimientos se generaron.

6. **Trazabilidad y Pruebas (`tests/recurrencias/`):**
   - Cobertura del 100% de los 18 escenarios de `openspec/specs/recurrencias/spec.md`.
