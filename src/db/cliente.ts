import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { schema } from './schema'

/**
 * Cliente de base de datos para el runtime de Next.js.
 *
 * Se memoiza a nivel de modulo. En Vercel serverless, sin memoizar, cada
 * invocacion abriria un pool nuevo y Neon agota conexiones. En desarrollo el
 * hot reload reevalua el modulo, por eso el respaldo en `globalThis`.
 *
 * `DATABASE_URL` (pooled) para el runtime. Las migraciones usan
 * `DATABASE_URL_UNPOOLED`: correr DDL a traves del pooler de Neon es una fuente
 * clasica de advisory locks y migraciones colgadas.
 *
 * Los repositorios NO importan este modulo. Reciben el cliente como parametro,
 * que es lo que permite correr las mismas consultas contra Neon y contra PGlite
 * en las pruebas.
 */

type Cliente = ReturnType<typeof drizzle<typeof schema>>

const EN_GLOBAL = Symbol.for('finanzas.mvp.db')

interface Contenedor {
  pool?: Pool
  cliente?: Cliente
}

function contenedor(): Contenedor {
  const global = globalThis as typeof globalThis & { [EN_GLOBAL]?: Contenedor }
  global[EN_GLOBAL] ??= {}
  return global[EN_GLOBAL]
}

/** El cliente memoizado. Lanza si el runtime no tiene `DATABASE_URL`. */
export function obtenerCliente(): Cliente {
  const guardado = contenedor()
  if (guardado.cliente) return guardado.cliente

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL. En desarrollo se lee de .env.local; en Vercel, del panel.',
    )
  }

  // max: 1 por invocacion serverless. El pooler de Neon multiplexa por encima.
  guardado.pool = new Pool({ connectionString: url, max: 1 })
  guardado.cliente = drizzle(guardado.pool, { schema })
  return guardado.cliente
}

/** Cierra el pool. Solo para scripts y pruebas. */
export async function cerrarCliente(): Promise<void> {
  const guardado = contenedor()
  await guardado.pool?.end()
  delete guardado.pool
  delete guardado.cliente
}
