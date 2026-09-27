import { index, integer, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from './usuarios'

/**
 * `sesiones` — el estado de sesion, en Postgres y no en memoria.
 *
 * Vercel serverless no conserva memoria entre invocaciones, asi que una sesion en
 * memoria, o una cookie firmada sin store, pierde el estado entre peticiones. De
 * ahi que sea una tabla.
 *
 * SIN columna de revocacion, y no debe agregarse: el cierre de sesion ELIMINA la
 * fila. Si se pierde la base, se pierden las sesiones, y eso es lo que se quiere.
 */
export const sesiones = pgTable(
  'sesiones',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),

    /**
     * El SHA-256 del identificador, NUNCA el identificador en claro. La cookie
     * lleva el identificador; el servidor lo hashea y busca por el hash.
     */
    token_hash: varchar('token_hash', { length: 64 }).notNull(),

    /**
     * El SHA-256 del token de proteccion, por el mismo motivo. Se entrega al
     * cliente una sola vez, al iniciar sesion, y nunca vuelve a salir.
     *
     * Caduca CON la sesion: no se reutiliza entre sesiones distintas.
     */
    token_proteccion: varchar('token_proteccion', { length: 64 }).notNull(),

    /** Toda lectura de sesion filtra por `expira_en > now()`. */
    expira_en: timestamp('expira_en', { withTimezone: true }).notNull(),
    creada_en: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    uniqueIndex('sesiones_token_hash').on(tabla.token_hash),
    uniqueIndex('sesiones_token_proteccion').on(tabla.token_proteccion),
    index('sesiones_usuario_id').on(tabla.usuario_id),
    index('sesiones_expira_en').on(tabla.expira_en),
  ],
)

export type Sesion = typeof sesiones.$inferSelect
export type NuevaSesion = typeof sesiones.$inferInsert
