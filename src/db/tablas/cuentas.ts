import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { carteras } from './carteras'
import { sobres } from './sobres'

/** corriente, ahorro, efectivo, credito. El tipo decide si es dinero o deuda. */
export const tipoDeCuenta = pgEnum('tipo_cuenta', [
  'corriente',
  'ahorro',
  'efectivo',
  'credito',
] as const)

/**
 * `cuentas` — los lugares fisicos donde el usuario tiene dinero o debe dinero.
 *
 * El saldo **no es una columna**. Se deriva: `saldo = saldo_inicial + sum(movimientos
 * .monto)`. La razon esta en el requerimiento y es la correcta: un saldo
 * almacenado se desincroniza en cuanto se borra un movimiento, y repararlo exige un
 * trigger o un proceso. Derivado, siempre cuadra.
 *
 * El nombre de una cuenta es unico DENTRO de la cartera, no del usuario: la misma
 * palabra puede existir en dos carteras distintas.
 */
export const cuentas = pgTable(
  'cuentas',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cartera_id: integer('cartera_id')
      .notNull()
      .references(() => carteras.id, { onDelete: 'cascade' }),

    nombre: varchar('nombre', { length: 60 }).notNull(),

    tipo: tipoDeCuenta('tipo').notNull().default('corriente'),

    /**
     * Lo unico que el usuario declara de su saldo. `numeric(16,2)` de Postgres, que
     * Drizzle devuelve como **string**: nunca `number`, nunca `parseFloat`.
     */
    saldo_inicial: numeric('saldo_inicial', { precision: 16, scale: 2 }).notNull().default('0.00'),

    archivada: boolean('archivada').notNull().default(false),
    orden: integer('orden').notNull().default(0),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    eliminado_en: timestamp('eliminado_en', { withTimezone: true }),
  },
  (tabla) => [
    index('cuentas_cartera_id').on(tabla.cartera_id),
    uniqueIndex('cuentas_cartera_nombre')
      .on(tabla.cartera_id, tabla.nombre)
      .where(sql`${tabla.eliminado_en} is null`),
  ],
)

export const tipoDeMovimiento = pgEnum('tipo_movimiento', ['gasto', 'ingreso', 'traspaso'])
export const origenDeMovimiento = pgEnum('origen_movimiento', ['manual', 'recurrente'])

/**
 * `movimientos` — el libro de donde sale el saldo de una cuenta y el gastado de un
 * sobre.
 *
 * La crea `030-cuentas` y no `060-transacciones`, por el mismo motivo por el que
 * `010-auth` creo `carteras`: **el requerimiento de saldo de `cuentas` R2 no se
 * cumple sin ella**. Un saldo derivado necesita la tabla de la que se deriva, y
 * esperar a `060` dejaria cuatro de los seis escenarios de `cuentas` sin
 * comportamiento real. `060-transacciones` agrega el comportamiento —crear, editar,
 * eliminar, clasificar— sobre esta tabla ya existente.
 *
 * `sobre_id` es nullable a proposito: un traspaso entre cuentas no toca ningun
 * sobre, y una cuenta no necesita uno. `monto` lleva el signo, de modo que la suma
 * no distingue gastos de ingresos: el signo ya lo dice.
 *
 * `eliminado_en` en vez de una bandera: borrar un movimiento es una baja logica, y
 * el saldo se deriva de los que siguen vivos, de modo que borrarlo lo recalcula sin
 * intervencion manual.
 */
export const movimientos = pgTable(
  'movimientos',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cuenta_id: integer('cuenta_id')
      .notNull()
      .references(() => cuentas.id, { onDelete: 'cascade' }),

    /**
     * Ausente en un traspaso entre cuentas, y en un gasto sin sobre asignado.
     *
     * La FK se agrego en `050-sobres`, con una migracion nueva: cuando `030` creo la
     * tabla, `sobres` todavia no existia, y una migracion inmutable no se edita.
     */
    sobre_id: integer('sobre_id').references(() => sobres.id, { onDelete: 'set null' }),

    tipo: tipoDeMovimiento('tipo').notNull(),

    /** Con signo: negativo gasto, positivo ingreso. `numeric(16,2)`, manejado como string. */
    monto: numeric('monto', { precision: 16, scale: 2 }).notNull(),

    fecha: date('fecha', { mode: 'string' }).notNull(),
    descripcion: varchar('descripcion', { length: 255 }).notNull(),
    comercio: varchar('comercio', { length: 120 }),

    origen: origenDeMovimiento('origen').notNull().default('manual'),

    eliminado_en: timestamp('eliminado_en', { withTimezone: true }),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizado_en: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('movimientos_cuenta_id').on(tabla.cuenta_id),
    // El saldo se deriva sumando movimientos por cuenta: sin este indice, cada
    // lectura de saldo seria un recorrido secuencial de la tabla entera.
    index('movimientos_cuenta_vivo').on(tabla.cuenta_id).where(sql`${tabla.eliminado_en} is null`),
    // Con la FK ya puesta, el indice parcial sobre vivos es el que usa la consulta del
    // disponible: suma los movimientos de un sobre hasta el periodo.
    index('movimientos_sobre_id').on(tabla.sobre_id).where(sql`${tabla.eliminado_en} is null`),
  ],
)

export type Cuenta = typeof cuentas.$inferSelect
export type NuevaCuenta = typeof cuentas.$inferInsert
export type Movimiento = typeof movimientos.$inferSelect
export type NuevoMovimiento = typeof movimientos.$inferInsert
