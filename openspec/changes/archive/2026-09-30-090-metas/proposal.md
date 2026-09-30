# Proposal

## Why

La capacidad `050-sobres` introdujo los sobres presupuestarios como receptores de asignaciones y origen de gastos. Sin embargo, los sobres por si solos no indican si el disponible acumulado responde a un objetivo concreto de ahorro (por ejemplo, vacaciones, fondo de emergencia, seguro anual o refacciones del hogar) ni con que urgencia o ritmo mensual se debe ahorrar.

`metas` complementa a `sobres` asociando a un sobre existente un monto objetivo y, opcionalmente, una fecha limite. La meta no es un tipo nuevo de sobre ni crea saldo separado: comparte el disponible del sobre y su avance se deriva de el.

El diseño establece que el sistema informa el progreso y detecta si una meta va retrasada o en camino, pero **nunca cambia su estado por decision propia**: es el usuario quien confirma manualmente cuándo una meta alcanzada se da por completada o cuándo una meta se abandona. Además, un sobre admite conservar su historial completo de metas anteriores, manteniendo en todo momento a lo sumo una única meta activa.

`metas` abarca 6 requisitos y 23 escenarios:
1. `Un sobre puede tener un monto objetivo y una fecha limite` (4 escenarios)
2. `El sistema muestra el avance de la meta activa` (4 escenarios)
3. `El sistema marca la meta activa como retrasada` (4 escenarios)
4. `Un sobre admite varias metas con una sola activa` (4 escenarios)
5. `El usuario completa o abandona una meta` (4 escenarios)
6. `Una meta abandonada sigue intacta y una meta de un sobre archivado queda abandonada` (4 escenarios)

## What Changes

1. **Base de Datos y Migración (`0006_metas.sql`):**
   - Tabla `metas` con `id`, `sobre_id` (FK a `sobres(id)` ON DELETE CASCADE), `monto_objetivo` (`numeric(16,2)` > 0), `fecha_limite` (`date`, nullable), `estado` (enum: `'activa'`, `'completada'`, `'abandonada'`), `completada_en` (timestamp nullable), `abandonada_en` (timestamp nullable), `creado_en` y `actualizado_en`.
   - Restricción de unicidad parcial en Postgres: `UNIQUE(sobre_id) WHERE estado = 'activa'` para garantizar en el motor que ningún sobre pueda tener dos metas activas en paralelo.
   - En `archivarSobre` (`src/repos/sobres.ts`): al archivar un sobre, cualquier meta activa asociada pasa automáticamente a estado `'abandonada'` fijando `abandonada_en = now()`.

2. **Cálculos y Derivados según la Regla del Dinero:**
   - Ningún valor de progreso se almacena en base de datos.
   - Cálculo dinámico a partir del disponible actual del sobre:
     - `restante`: diferencia entre `monto_objetivo` y `disponible` (0 si disponible >= objetivo).
     - `porcentaje`: porcentaje de cumplimiento entero/decimal para la interfaz.
     - `ritmo_periodo`: si tiene fecha límite, importe necesario a asignar por periodo restante.
     - `estado_visual`: `'cumplida'` (si disponible >= objetivo), `'retrasada'` (si la fecha límite venció o las asignaciones del periodo quedan por debajo del ritmo necesario), o `'en_camino'`.

3. **Validación (`src/metas/validacion.ts`):**
   - Validación de `monto_objetivo`: texto numérico con hasta 2 decimales y valor estrictamente positivo.
   - Validación de `fecha_limite`: fecha ISO válida opcional.
   - Comprobación de que el sobre existe, no está archivado y pertenece a una cartera del usuario autenticado.

4. **Repositorio de Metas (`src/repos/metas.ts`):**
   - `crearMeta`: valida que el sobre no esté archivado y no tenga otra meta activa, e inserta la nueva meta activa.
   - `obtenerMetaActiva`: consulta la meta activa de un sobre.
   - `listarHistorialMetas`: retorna todas las metas históricas y activas del sobre ordenadas cronológicamente.
   - `abandonarMeta`: pasa la meta activa a estado `'abandonada'` con timestamp.
   - `completarMeta`: verifica que el disponible actual del sobre alcance o supere el monto objetivo; si no alcanza, rechaza la operación indicando el faltante; si alcanza, pasa a estado `'completada'` con timestamp.
   - `calcularProgresoMeta`: función pura/servidor para derivar métricas de avance y ritmo.

5. **Acciones del Servidor (`src/metas/acciones.ts`):**
   - `accionCrearMeta`, `accionCompletarMeta`, `accionAbandonarMeta`.
   - Protección con sesión requerida y token anti-CSRF.

6. **Componentes y Vistas (`src/components/metas.tsx`):**
   - Visualización de la meta en la fila o detalle del sobre: barra de progreso, disponible vs objetivo, ritmo sugerido, badges de estado ('Cumplida', 'En camino', 'Retrasada').
   - Formulario para fijar meta en sobre sin meta activa.
   - Botón para completar (habilitado cuando disponible >= objetivo) y botón para abandonar.
   - Historial desplegable de metas anteriores.

7. **Pruebas y Trazabilidad (`tests/metas/`):**
   - Cobertura exhaustiva de los 23 escenarios normativos de la especificación.
