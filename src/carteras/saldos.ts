import { sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { disponibleDeSobre, saldoDeCuenta } from '../repos/fragmentos'
import { filas } from '../repos/filas'

/**
 * La precondicion de `carteras` R5: **una cartera solo se archiva cuando todas sus
 * cuentas y sobres estan en cero.**
 *
 * Las dos formulas derivadas —el saldo de la cuenta y el disponible del sobre— no se
 * escriben aca: salen de `repos/fragmentos.ts`, la misma copia que usan el listado de
 * sobres y el resumen de patrimonio. Que sean la misma no es cosmetico: si esta cuenta
 * usara un criterio distinto, una cartera con saldos se archivaria y quedaria
 * congelada, con el usuario sin poder corregirla.
 *
 * La consulta cuenta FILAS con importe distinto de cero, no saldo: no importa porque el
 * saldo vive en tres sitios distintos (importes iniciales, movimientos y asignaciones) y
 * sumarlos aca en JavaScript seria la regla del dinero rota.
 *
 * Cuando alguna de las tablas todavia no existe devuelve `undefined`, que significa "no
 * se puede afirmar nada". El repositorio trata ese `undefined` como motivo suficiente
 * para NO archivar: es preferible decir que todavia no a archivar una cartera con
 * saldos.
 */
export type ResultadoDeSaldos = number | undefined

/** Las cuatro tablas que consulta la cuenta de abajo. Faltando cualquiera, la consulta no compila. */
const TABLAS_RELEVANTES = ['cuentas', 'sobres', 'movimientos', 'asignaciones'] as const

export async function saldosDistintosDeCero(
  db: Base,
  cartera_id: number,
): Promise<ResultadoDeSaldos> {
  // Con `and`, no con `or`: la consulta de abajo nombra las cuatro tablas, y que
  // exista alguna no alcanza para poder correr. Con `or`, el `undefined` se
  // convertia en un error de sintaxis en vez de un "todavia no".
  const existentes = await filas<{ presente: boolean }>(db, sql`
    select ${sql.raw(TABLAS_RELEVANTES.map((t) => `to_regclass('${t}') is not null`).join(' and '))} as presente
  `)

  if (!existentes[0]?.presente) return undefined

  // `cuentas`: una cuenta con saldo derivado distinto de cero. El saldo es
  // `saldo_inicial + sum(movimientos)`, y se compara **la suma**, no la cantidad de
  // filas: un traspaso entre dos cuentas de la misma cartera deja dos movimientos con
  // importe y deja el saldo de la cartera en cero, y una cartera con saldo cero tiene
  // que poder archivarse. Contar filas con importe bloquearia ese archivado para siempre.
  //
  // `sobres`: disponible derivado, que son asignaciones mas movimientos no traspaso.
  // Un sobre con movimientos y disponible cero no bloquea el archivado, porque lo que
  // el requerimiento pide es que este en cero, no que no tenga historia.
  const [contado] = await filas<{ total: number }>(db, sql`
    select (
      (select count(*)::int from (
        select ${saldoDeCuenta('c')} as saldo
        from cuentas c
        where c.cartera_id = ${cartera_id}
          and c.eliminado_en is null
      ) as s where s.saldo <> 0)
      + (select count(*)::int from (
        select ${disponibleDeSobre('s2')} as disponible
        from sobres s2
        where s2.cartera_id = ${cartera_id} and s2.eliminado_en is null
      ) as d where d.disponible <> 0)
    ) as total
  `)

  return contado?.total ?? 0
}
