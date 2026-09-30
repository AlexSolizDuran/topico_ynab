import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sobres } from './sobres'

export const estadoMeta = pgEnum('estado_meta', [
  'activa',
  'completada',
  'abandonada',
])

/**
 * `metas` — objetivo de ahorro asociado a un sobre existente.
 *
 * La meta no es un sobre separado: comparte el disponible del sobre.
 * Un sobre admite conservar su historial de metas anteriores, pero
 * mantiene como activa unicamente a una de ellas.
 *
 * `monto_objetivo` es siempre positivo, en `numeric(16,2)` manejado como string.
 */
export const metas = pgTable(
  'metas',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    sobre_id: integer('sobre_id')
      .notNull()
      .references(() => sobres.id, { onDelete: 'cascade' }),
    monto_objetivo: numeric('monto_objetivo', { precision: 16, scale: 2 }).notNull(),
    fecha_limite: date('fecha_limite', { mode: 'string' }),
    estado: estadoMeta('estado').notNull().default('activa'),
    completada_en: timestamp('completada_en', { withTimezone: true }),
    abandonada_en: timestamp('abandonada_en', { withTimezone: true }),

    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizado_en: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('metas_sobre_id').on(tabla.sobre_id),
    uniqueIndex('metas_sobre_activa_unica')
      .on(tabla.sobre_id)
      .where(sql`${tabla.estado} = 'activa'`),
    check('metas_monto_positivo', sql`${tabla.monto_objetivo} > 0`),
  ],
)

export type Meta = typeof metas.$inferSelect
export type NuevaMeta = typeof metas.$inferInsert
export type EstadoMeta = (typeof estadoMeta.enumValues)[number]
