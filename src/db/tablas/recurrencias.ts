import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'
import { carteras } from './carteras'
import { cuentas } from './cuentas'
import { sobres } from './sobres'

export const tipoReglaRecurrente = pgEnum('tipo_regla_recurrente', ['gasto', 'ingreso'])
export const frecuenciaRecurrencia = pgEnum('frecuencia_recurrencia', [
  'diaria',
  'semanal',
  'mensual',
  'anual',
])

/**
 * `reglas_recurrentes` — definicion de gastos e ingresos que se repiten en el tiempo.
 *
 * `monto` se guarda siempre como positivo en `numeric(16,2)`. El signo se deriva
 * al materializar segun `tipo = 'gasto'` (negativo) o `tipo = 'ingreso'` (positivo).
 *
 * `dia` representa el dia del mes (1..31) para mensual/anual, o dia de semana (1..7) para semanal.
 * `mes` representa el mes del año (1..12) obligatorio cuando frecuencia es anual.
 */
export const reglasRecurrentes = pgTable(
  'reglas_recurrentes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cartera_id: integer('cartera_id')
      .notNull()
      .references(() => carteras.id, { onDelete: 'cascade' }),
    cuenta_id: integer('cuenta_id')
      .notNull()
      .references(() => cuentas.id, { onDelete: 'cascade' }),
    sobre_id: integer('sobre_id').references(() => sobres.id, { onDelete: 'set null' }),

    descripcion: varchar('descripcion', { length: 255 }).notNull(),
    monto: numeric('monto', { precision: 16, scale: 2 }).notNull(),
    tipo: tipoReglaRecurrente('tipo').notNull(),
    frecuencia: frecuenciaRecurrencia('frecuencia').notNull(),
    dia: integer('dia').notNull(),
    mes: integer('mes'),
    fecha_inicio: date('fecha_inicio', { mode: 'string' }).notNull(),
    activa: boolean('activa').notNull().default(true),
    comercio: varchar('comercio', { length: 120 }),

    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizado_en: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
    eliminado_en: timestamp('eliminado_en', { withTimezone: true }),
  },
  (tabla) => [
    index('reglas_recurrentes_cartera_id').on(tabla.cartera_id),
    index('reglas_recurrentes_cuenta_id').on(tabla.cuenta_id),
    index('reglas_recurrentes_sobre_id').on(tabla.sobre_id),
    index('reglas_recurrentes_activas')
      .on(tabla.cartera_id, tabla.activa)
      .where(sql`${tabla.eliminado_en} is null`),
    check('reglas_monto_positivo', sql`${tabla.monto} > 0`),
    check('reglas_dia_valido', sql`${tabla.dia} >= 1 and ${tabla.dia} <= 31`),
    check('reglas_mes_valido', sql`${tabla.mes} is null or (${tabla.mes} >= 1 and ${tabla.mes} <= 12)`),
  ],
)

export type ReglaRecurrente = typeof reglasRecurrentes.$inferSelect
export type NuevaReglaRecurrente = typeof reglasRecurrentes.$inferInsert
