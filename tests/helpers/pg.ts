import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { schema } from '@/db/schema'
import type { Base } from '@/db/tipos'

/**
 * Base de datos de pruebas: Postgres real compilado a WebAssembly.
 *
 * Es el mismo motor que corre en Neon, asi que `numeric(16,2)`, los `enum`, los
 * indices funcionales sobre `lower(...)` y los indices parciales se comportan
 * igual. La aritmetica de dinero vive en SQL, y un motor distinto daria otra
 * aritmetica: los tests tienen que correr contra Postgres de verdad.
 *
 * Se aplican los archivos `.sql` que genera drizzle-kit, no un schema
 * reconstruido a mano, para que las pruebas ejerciten las migraciones reales.
 *
 * Cada llamada crea una instancia nueva. Los datos de un test no pueden
 * filtrarse al siguiente, que es justamente la clase de bug que la invariante
 * del patrimonio necesita cazar.
 */

const CARPETA_MIGRACIONES = 'drizzle'

/**
 * Los archivos de migracion, en orden lexicografico.
 *
 * El orden es el del NOMBRE, no el del contenido. Ordenar el SQL por su texto parece
 * equivalente y no lo es: `0002_grupos.sql` empieza con `CREATE TABLE "grupos"` y
 * `0001` con `CREATE TABLE "cuentas"`, asi que ordenar el contenido pone la segunda
 * antes que la primera y las pruebas correrian contra un esquema que nadie desplego.
 */
export function archivosDeMigracion(): string[] {
  let entradas: string[]
  try {
    entradas = readdirSync(CARPETA_MIGRACIONES)
  } catch {
    return []
  }
  return entradas.filter((nombre) => nombre.endsWith('.sql')).sort()
}

/** El SQL de las migraciones, en el orden en que se aplican. */
export function migraciones(): string[] {
  return archivosDeMigracion().map((nombre) => readFileSync(join(CARPETA_MIGRACIONES, nombre), 'utf8'))
}

export interface BaseDePruebas {
  db: Base
  pg: PGlite
  cerrar: () => Promise<void>
}

export async function crearBaseDePruebas(): Promise<BaseDePruebas> {
  const pg = await PGlite.create()

  for (const sql of migraciones()) {
    // `exec` corre el archivo entero. Los `--> statement-breakpoint` que deja
    // drizzle-kit son comentarios, asi que no estorban.
    await pg.exec(sql)
  }

  return {
    db: drizzle(pg, { schema }) as unknown as Base,
    pg,
    cerrar: () => pg.close(),
  }
}
