import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from './usuarios'

/**
 * `carteras` — la entidad raiz del dominio: el contenedor que posee cuentas,
 * sobres, grupos y movimientos, y que fija la MONEDA de todo su contenido.
 *
 * La tabla se crea en `010-auth` porque `carteras` R1 exige que exista una
 * cartera desde el registro del usuario. Se crea con el juego completo de
 * columnas de `modelo.puml`: agregar columnas despues seria una segunda
 * migracion sin motivo. Lo que `020-carteras` agrega es el repositorio completo,
 * las validaciones y las vistas.
 *
 * Una cartera tiene UNA moneda y no hay tipo de cambio: las carteras de distinta
 * moneda permanecen aisladas y el sistema no calcula ningun total que las
 * combine. La moneda se define al crear la cartera y NO se cambia.
 */
export const carteras = pgTable(
  'carteras',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    usuario_id: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),

    nombre: varchar('nombre', { length: 60 }).notNull(),

    /** ISO 4217: `MXN`, `USD`. Char(3), no varchar, porque el codigo tiene 3. */
    moneda: char('moneda', { length: 3 }).notNull(),

    archivada: boolean('archivada').notNull().default(false),
    orden: integer('orden').notNull().default(0),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    eliminado_en: timestamp('eliminado_en', { withTimezone: true }),
  },
  (tabla) => [
    index('carteras_usuario_id').on(tabla.usuario_id),
    // El nombre de una cuenta o de un sobre es unico DENTRO de la cartera, no
    // del usuario: la misma palabra puede existir en dos carteras distintas.
    uniqueIndex('carteras_usuario_nombre')
      .on(tabla.usuario_id, tabla.nombre)
      .where(sql`${tabla.eliminado_en} is null`),
  ],
)

export type Cartera = typeof carteras.$inferSelect
export type NuevaCartera = typeof carteras.$inferInsert
