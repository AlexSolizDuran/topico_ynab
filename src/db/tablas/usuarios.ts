import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

/**
 * `usuarios` — quien entra y su zona horaria.
 *
 * Identificadores en espanol, sin acentos, para calzar con `modelo.puml`.
 */
export const usuarios = pgTable(
  'usuarios',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    nombre: varchar('nombre', { length: 80 }).notNull(),
    apellido: varchar('apellido', { length: 80 }).notNull(),
    nombre_usuario: varchar('nombre_usuario', { length: 50 }).notNull(),
    correo: varchar('correo', { length: 120 }).notNull(),
    hash_contrasena: varchar('hash_contrasena', { length: 255 }).notNull(),
    activo: boolean('activo').notNull().default(true),
    zona_horaria: varchar('zona_horaria', { length: 40 }).notNull().default('America/Mexico_City'),

    /**
     * Bloqueo por intentos: 5 fallidos bloquean 60 segundos.
     *
     * Vive en la fila del usuario, no en una tabla aparte: el limite es por
     * cuenta, no por IP ni por sesion. Se compara contra `now()` en cada
     * intento, asi que no necesita un proceso que lo limpie.
     */
    intentos_fallidos: integer('intentos_fallidos').notNull().default(0),
    bloqueado_hasta: timestamp('bloqueado_hasta', { withTimezone: true }),

    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    /**
     * El indice unico funcional es OBLIGATORIO, no una mejora de estilo.
     *
     * `autenticacion` R1 y R2 exigen que el nombre de usuario sea insensible a
     * mayusculas. Un `UNIQUE` normal de Postgres es sensible: permitiria crear
     * `Alex` y `alex` a la vez, y el inicio de sesion se volveria ambiguo.
     * Con este indice, `Alex` y `alex` chocan.
     */
    uniqueIndex('usuarios_nombre_usuario_lower').on(sql`lower(${tabla.nombre_usuario})`),
    uniqueIndex('usuarios_correo').on(tabla.correo),
    index('usuarios_bloqueado_hasta').on(tabla.bloqueado_hasta),
  ],
)

export type Usuario = typeof usuarios.$inferSelect
export type NuevaUsuario = typeof usuarios.$inferInsert
