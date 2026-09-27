import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { carteras } from './carteras'

/**
 * `grupos`: categorias visuales de sobres, de un solo nivel.
 *
 * Deliberadamente sin columna `total` ni `disponible`. Un grupo no tiene presupuesto
 * propio —lo dice el requerimiento— y su total es la suma de los disponibles de los
 * sobres que contiene, que se calcula cuando se consulta. Guardarlo seria una segunda
 * fuente de verdad que se desincroniza en cuanto un sobre se mueve, se archiva o
 * recibe un movimiento. La tabla es tan chica a proposito: lo que un grupo tiene es un
 * nombre, un orden y una bandera de archivado.
 *
 * Tampoco hay `grupo_padre`. Los grupos no se anidan, y la forma de que eso sea
 * imposible es que la columna no exista, no una validacion que se pueda saltar por una
 * consulta que no pase por el formulario. La validacion de entrada sigue rechazando un
 * `grupo_padre` para poder explicar el motivo, y una prueba vigila que la tabla no
 * crezca con una FK a si misma.
 *
 * Sin `eliminado_en`, porque el modelo de datos no lo pide: un grupo no se borra, se
 * archiva.
 */

export const grupos = pgTable(
  'grupos',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cartera_id: integer('cartera_id')
      .notNull()
      .references(() => carteras.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    archivado: boolean('archivado').notNull().default(false),
    orden: integer('orden').notNull().default(0),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('grupos_cartera_id').on(tabla.cartera_id),
    // Un nombre por cartera. Mismo criterio que `cuentas` y `carteras`: la unicidad es
    // por cartera, no global, y un grupo de otra cartera puede llamarse igual.
    uniqueIndex('grupos_cartera_nombre').on(tabla.cartera_id, tabla.nombre),
    // El agrupamiento visible ordena por grupo, y con eso la lista de cada cartera
    // viene ordenada sin un `sort` en memoria.
    index('grupos_cartera_orden').on(tabla.cartera_id, tabla.orden),
  ],
)

export type Grupo = typeof grupos.$inferSelect
export type NuevoGrupo = typeof grupos.$inferInsert
