import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { schema } from './schema'

/**
 * El tipo de cliente que aceptan los repositorios.
 *
 * Es el mismo para Neon (node-postgres) y para PGlite (las pruebas), asi que el
 * codigo de los repositorios es identico en los dos entornos. Lo que se prohibe
 * no es el acceso a datos: es el acceso a datos SIN `usuarioId` y `carteraId`.
 */
export type Base = PgDatabase<PgQueryResultHKT, typeof schema>

export { schema }
