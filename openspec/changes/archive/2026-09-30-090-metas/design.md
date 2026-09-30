# Design

## Context

`metas` es la capacidad #9 en el orden de dependencias. Se apoya en `sobres` (#5) y `transacciones` (#6), ya que el avance de una meta no tiene almacenamiento propio sino que se deriva del disponible actual del sobre (el cual a su vez depende de las asignaciones y los movimientos).

## Decisions

### D1: Tabla `metas` y unicidad parcial en base de datos

Se define la tabla `metas` en `src/db/tablas/metas.ts`:
- `id`: integer primary key identity.
- `sobre_id`: integer NOT NULL references `sobres(id)` on delete cascade.
- `monto_objetivo`: `numeric(16,2)` NOT NULL. Check: `monto_objetivo > 0`.
- `fecha_limite`: `date` (string en modo Drizzle), nullable.
- `estado`: pgEnum `estado_meta` ('activa', 'completada', 'abandonada') NOT NULL default 'activa'.
- `completada_en`: timestamp with time zone nullable.
- `abandonada_en`: timestamp with time zone nullable.
- `creado_en`: timestamp with time zone default now() NOT NULL.
- `actualizado_en`: timestamp with time zone default now() NOT NULL.

Índices:
- `metas_sobre_id`: index en `sobre_id`.
- `metas_sobre_activa_unica`: `uniqueIndex('metas_sobre_activa_unica').on(tabla.sobre_id).where(sql`${tabla.estado} = 'activa'`)`.
  Esta restricción de Postgres impide a nivel físico que se cree una segunda meta activa en el mismo sobre mientras exista una previa activa.

### D2: La regla del dinero y derivación en memoria/SQL

Siguiendo la regla de oro del proyecto:
- Los montos objetivo y disponibles se manejan estrictamente como cadenas de texto (`type Dinero = string`).
- Las restas de dinero para calcular el `restante` se realizan mediante aritmética de enteros escalados (`BigInt(centavos)`) para garantizar precisión absoluta de centavos.
- Si `disponible >= monto_objetivo`, el `restante` es `'0.00'`.
- Porcentaje de avance: `(centavosDisponible * 100n) / centavosObjetivo` (acotado a 0..100 para la barra visual, aunque el valor numérico exacto puede superar el 100% si el sobre tiene más disponible que la meta).

### D3: Lógica del ritmo necesario y detección de retraso (R2, R3)

Cuando una meta activa tiene `fecha_limite`:
1. Se determina el número de periodos (meses) restantes:
   - Sea `periodoActual` el mes actual `YYYY-MM`.
   - Sea `periodoLimite` el mes de `fecha_limite` (`YYYY-MM`).
   - Se cuenta la cantidad de meses entre ambos: `mesesRestantes = (añoFin - añoIni) * 12 + (mesFin - mesIni) + 1` (considerando el mes en curso como periodo activo).
   - Si `fecha_limite` ya venció (`fecha_limite < hoy` y `disponible < objetivo`): la meta se marca como `retrasada` con aviso de fecha vencida.
2. Ritmo por periodo:
   - Si `mesesRestantes > 0` y `restante > 0`: `ritmo = restante / mesesRestantes` (en centavos BigInt).
3. Estado visual:
   - **`cumplida`**: `disponible >= monto_objetivo`.
   - **`retrasada`**: si `fecha_limite < hoy` O si las asignaciones del periodo actual (o el acumulado asignado) no alcanzan el ritmo requerido para la meta.
   - **`en_camino`**: cuando no tiene fecha límite O va a ritmo suficiente para cumplir la meta.

### D4: Transiciones de estado (R4, R5)

Las metas activas NO cambian de estado solas:
- Cuando el disponible alcanza el objetivo, la meta se dibuja como cumplida pero **sigue activa** hasta que el usuario decida confirmarla ("Completar").
- **Completar**: Verifica en el servidor que `disponible >= monto_objetivo`. Si `disponible < monto_objetivo`, se arroja el error `MetaObjetivoNoAlcanzado` indicando el importe faltante exacto. Si cumple, pasa a `estado = 'completada'` y `completada_en = now()`.
- **Abandonar**: Pasa inmediatamente a `estado = 'abandonada'` y `abandonada_en = now()`. El dinero asignado al sobre permanece intacto.
- Al quedar completada o abandonada, la restricción única parcial libera el sobre para recibir una nueva meta activa.

### D5: Abandono automático al archivar sobre (R6)

En `src/repos/sobres.ts`, la función `archivarSobre` se amplía:
- Dentro de la misma operación se busca si el sobre tiene una meta con `estado = 'activa'`.
- Si la tiene, se actualiza a `estado = 'abandonada'` con `abandonada_en = now()`.
- De este modo, si el sobre archivado recibe posteriormente una devolución, la meta permanece abandonada y nunca se reactiva automáticamente.
- Se prohíbe crear metas en sobres que tengan `archivado = true` (lanzando `SobreArchivado`).

### D6: Historial de metas

La consulta de historial lista todas las metas del sobre ordenadas por `creado_en DESC`, mostrando el objetivo, el estado final (`completada` o `abandonada`) y el periodo de vigencia (desde `creado_en` hasta `completada_en` o `abandonada_en`).
