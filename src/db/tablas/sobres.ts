import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { carteras } from './carteras'
import { grupos } from './grupos'

/**
 * `sobres` y `asignaciones`: el mecanismo central del reparto de dinero.
 *
 * `sobres` no tiene columna de disponible. El disponible es
 * `sum(asignaciones.monto) + sum(movimientos.monto)` hasta el periodo consultado, y se
 * calcula en cada lectura. Dos razones, y las dos importan:
 *
 * 1. Si el disponible fuera una columna, corregir un movimiento de hace tres meses
 *    obligaria a recalcular y reescribir cada sobre afectado. Con el disponible
 *    derivado, corregir es solo borrar el movimiento: el saldo se ajusta solo.
 * 2. El disponible cambia por motivos que no pasan por la tabla de sobres: entra un
 *    movimiento, se borra una asignacion, cambia el periodo que se esta mirando. Una
 *    columna que hay que mantener sincronizada con eso es una columna que algum dia
 *    va a estar desfasada, y nadie se va a enterar.
 *
 * `asignaciones` solo admite importes positivos, y no por validacion del formulario:
 * lo impone un `check` de Postgres. Un sobregiro es un gasto sin asignar, y se
 * registra como movimiento negativo. Si la asignacion aceptara negativos, habria dos
 * formas de expresar lo mismo y el disponible dependeria de cual se hubiera usado.
 *
 * La excepcion es `motivo = 'reasignacion'`, y no es un relajamiento del `check` sino
 * una segunda rama del mismo. Hace falta porque el requerimiento de mover dinero
 * entre sobres dice que el disponible del origen tiene que **disminuir** sin que el
 * patrimonio cambie, y sin esta fila no hay forma de expresarlo:
 *
 * - Una asignacion negativa de motivo `usuario` contradiria el requerimiento de que
 *   las asignaciones sean positivas.
 * - Un `movimiento` negativo en el origen tocaría el saldo de una cuenta real, porque
 *   `cuenta_id` es obligatorio, y el patrimonio bajaria justo lo que el requerimiento
 *   dice que no puede bajar. Un `traspaso` esta excluido de la suma del disponible, asi
 *   que tampoco sirve.
 *
 * La reasignacion es la unica fila con importe negativo, y la escribe una sola
 * operacion (`moverEntreSobres`), nunca el formulario. El `check` lo deja explicito:
 * un negativo solo pasa si la fila dice por que.
 *
 * `periodo` es `char(7)` en formato `YYYY-MM`, con `check` de formato. Un periodo como
 * texto libre rompe la comparacion de periodos: `'2026-9'` y `'2026-09'` son el mismo
 * mes para una persona y dos ficheros distintos para Postgres.
 */

export const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * `usuario` la escribe el formulario y es siempre positiva. `reasignacion` la escribe
 * `moverEntreSobres` en el sobre de origen y es la unica fila que puede ser negativa.
 * Ver el comentario de la tabla para por que hace falta la segunda rama.
 */
export const motivoDeAsignacion = pgEnum('motivo_asignacion', ['usuario', 'reasignacion'] as const)

export const sobres = pgTable(
  'sobres',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cartera_id: integer('cartera_id')
      .notNull()
      .references(() => carteras.id, { onDelete: 'cascade' }),
    grupo_id: integer('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'restrict' }),
    nombre: text('nombre').notNull(),
    archivado: boolean('archivado').notNull().default(false),
    orden: integer('orden').notNull().default(0),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    eliminado_en: timestamp('eliminado_en', { withTimezone: true }),
  },
  (tabla) => [
    index('sobres_cartera_id').on(tabla.cartera_id),
    index('sobres_grupo_id').on(tabla.grupo_id),
    // Un nombre por cartera, no por grupo: dos grupos pueden tener un "Comida", y el
    // usuario los distingue por el grupo. Pero dos "Comida" en el mismo grupo si
    // seria confuso, y la cartera es el scope que el requerimiento fija.
    uniqueIndex('sobres_cartera_nombre')
      .on(tabla.cartera_id, tabla.nombre)
      .where(sql`${tabla.eliminado_en} is null`),
    // El agrupamiento de la cartera se arma por grupo y por orden: este es el indice
    // que hace que listar no ordene la cartera entera en memoria.
    index('sobres_cartera_grupo_orden').on(tabla.cartera_id, tabla.grupo_id, tabla.orden),
  ],
)

export const asignaciones = pgTable(
  'asignaciones',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    sobre_id: integer('sobre_id')
      .notNull()
      .references(() => sobres.id, { onDelete: 'cascade' }),
    /** `YYYY-MM`. El formato lo impone el `check` de abajo. */
    periodo: text('periodo').notNull(),

    /**
     * Quien puso esta fila, y por eso el `check` de abajo tiene dos ramas.
     *
     * `usuario` es lo que escribe el formulario, y siempre positivo. `reasignacion` es
     * lo que escribe `moverEntreSobres` en el sobre de origen, y es lo unico que puede
     * ser negativo. El valor por defecto es `usuario` justamente para que un `insert`
     * que se olvide de este campo no pueda colar un negativo.
     */
    motivo: motivoDeAsignacion('motivo').notNull().default('usuario'),

    /** Siempre positivo salvo en una reasignacion. String, nunca number. */
    monto: numeric('monto', { precision: 16, scale: 2 }).notNull(),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('asignaciones_sobre_periodo').on(tabla.sobre_id, tabla.periodo),
    // Varias asignaciones al mismo sobre y periodo, y se suman. NO hay unique: es lo
    // que dice el requerimiento, y la razon es que el usuario asigne en varios momentos
    // sin que el sistema lo impida. Un UNIQUE obligaria a un `upsert` y perderia el
    // detalle de cuantas veces se asigno.
    check(
      'asignaciones_monto_segun_motivo',
      sql`(
        (${tabla.motivo} = 'usuario' and ${tabla.monto} > 0)
        or (${tabla.motivo} = 'reasignacion' and ${tabla.monto} <> 0)
      )`,
    ),
    check('asignaciones_periodo_formato', sql`${tabla.periodo} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`),
  ],
)

export type Sobre = typeof sobres.$inferSelect
export type NuevoSobre = typeof sobres.$inferInsert
export type MotivoDeAsignacion = (typeof motivoDeAsignacion.enumValues)[number]
export type Asignacion = typeof asignaciones.$inferSelect
export type NuevaAsignacion = typeof asignaciones.$inferInsert
