/**
 * `filas<T>` — normaliza lo que devuelve `db.execute`.
 *
 * El mismo repositorio corre sobre dos clientes que no coinciden: `pg` (Neon) devuelve
 * un array de filas, y PGlite (las pruebas) devuelve `{ rows }`. Drizzle lo tipa como
 * `unknown`, asi que el casteo es inevitable; lo que hay que evitar es repetirlo en
 * cada consulta, porque basta con que una se olvide para que esa consulta funcione en
 * pruebas y falle en produccion, o al reves.
 */
import type { SQL } from 'drizzle-orm'
import type { Base } from '../db/tipos'

export async function filas<T>(db: Base, consulta: SQL): Promise<T[]> {
  const resultado = (await db.execute(consulta)) as T[] | { rows: T[] }
  return Array.isArray(resultado) ? resultado : (resultado.rows ?? [])
}
