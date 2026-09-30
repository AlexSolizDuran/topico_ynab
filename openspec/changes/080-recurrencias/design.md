# Design

## Context

`recurrencias` es la capacidad #8 en el orden de dependencias. Se apoya directamente sobre `cuentas` (#3), `sobres` (#5) y `transacciones` (#6).
Permite registrar reglas de movimientos periodicos que se materializan sin necesidad de intervencion manual en cada periodo, respetando la regla del dinero y el aislamiento por cartera y usuario.

## Decisions

### D1: Estructura de tabla `reglas_recurrentes` y ampliacion de `movimientos`

Se crea la tabla `reglas_recurrentes` en `src/db/tablas/recurrencias.ts`:
- `id`: integer primary key identity
- `cartera_id`: integer NOT NULL references `carteras(id)` on delete cascade
- `cuenta_id`: integer NOT NULL references `cuentas(id)` on delete cascade
- `sobre_id`: integer nullable references `sobres(id)` on delete set null
- `descripcion`: varchar(255) NOT NULL
- `monto`: numeric(16,2) NOT NULL (siempre positivo)
- `tipo`: pgEnum `tipo_regla_recurrente` ('gasto', 'ingreso')
- `frecuencia`: pgEnum `frecuencia_recurrencia` ('diaria', 'semanal', 'mensual', 'anual')
- `dia`: integer NOT NULL (1 a 31; para semanal 1=Lunes a 7=Domingo o dia de mes para mensual/anual)
- `mes`: integer nullable (1 a 12, obligatorio si frecuencia = 'anual')
- `fecha_inicio`: date NOT NULL (formato YYYY-MM-DD)
- `activa`: boolean NOT NULL default true
- `comercio`: varchar(120) nullable
- `creado_en`: timestamp with time zone default now() NOT NULL
- `eliminado_en`: timestamp with time zone nullable

En `movimientos`:
- Se añade la columna `regla_id`: integer nullable references `reglas_recurrentes(id)` on delete set null.
- Indice `movimientos_regla_id` sobre vivos (`WHERE eliminado_en IS NULL`).

### D2: La regla del dinero y los importes con signo

En `reglas_recurrentes`, el `monto` se guarda como importe absoluto positivo (`numeric(16,2)` manejado como string de JS), validado contra ceros y negativos.
Al materializar el movimiento:
- Si `tipo == 'gasto'`, el movimiento generado recibe `monto = '-' + regla.monto`.
- Si `tipo == 'ingreso'`, recibe `monto = regla.monto`.
- El campo `origen` de `movimientos` se marca como `'recurrente'`.

### D3: Algoritmo de fechas para ocurrencias

Dado un rango entre `regla.fecha_inicio` y `fecha_hasta` (inclusive):
- **diaria:** cada dia `d` entre `fecha_inicio` y `fecha_hasta`.
- **semanal:** cada 7 dias desde `fecha_inicio` (o fechas cuyo dia de semana coincida con el configurado).
- **mensual:** para cada mes entre el mes de `fecha_inicio` y el de `fecha_hasta`, el dia `dia`. Si el mes tiene menos dias (ej. dia 31 en febrero o abril), se ajusta al ultimo dia del mes (`Math.min(dia, diasDelMes)`).
- **anual:** cada año entre el de `fecha_inicio` y el de `fecha_hasta`, en el mes `mes` y dia `dia`.
Ninguna ocurrencia puede ser anterior a `fecha_inicio`.

### D4: Deteccion de duplicados y equivalencia (R3)

Para una fecha candidata `F`, se comprueba si ya existe en la base de datos un movimiento **vivo** (`eliminado_en IS NULL`) que cumpla:
- `cuenta_id = regla.cuenta_id` AND `fecha = F` AND `monto = montoConSigno` AND (`regla_id = regla.id` OR (`regla_id IS NULL` AND `descripcion = regla.descripcion`)).
Si existe, la generacion para esa fecha se omite.
Si el movimiento previo fue eliminado logicamente (`eliminado_en IS NOT NULL`), el predicado de vivos no lo encuentra, por lo que el sistema vuelve a generarlo, cumpliendo el escenario `Generacion tras eliminar un movimiento`.

### D5: Materialización en ausencia de Cron (R4)

La aplicacion no usa tareas cron en segundo plano. La materializacion se ejecuta:
1. De forma explicita mediante Server Action al cargar o interactuar con la cartera.
2. La funcion `materializarRecurrencias(db, usuario_id, cartera_id, fecha_hasta)` busca todas las reglas activas (`activa = true` y `eliminado_en IS NULL`) de esa cartera y genera los movimientos pendientes hasta `fecha_hasta` en una sola transaccion.
3. Devuelve la cantidad de movimientos generados y la lista de periodos (meses) afectados para que la UI pueda notificar al usuario.

### D6: Inmutabilidad histórica (R5)

1. Editar los campos de una regla (`monto`, `frecuencia`, `descripcion`) solo actualiza la fila en `reglas_recurrentes`. Los movimientos ya insertados en `movimientos` no se tocan.
2. Desactivar una regla (`activa = false`) impide que genere nuevos movimientos, conservando intactos todos los existentes.
3. Eliminar una regla realiza borrado logico (`eliminado_en = now()`), conservando la regla para auditoria y sus movimientos intactos.
4. Si un usuario edita un movimiento generado por una regla, ese movimiento conserva su edicion y no es reescrito por la regla en periodos posteriores.
