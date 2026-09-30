import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { Dinero } from '../dinero'

/**
 * Los dos derivados del dominio, escritos una sola vez.
 *
 * En este proyecto hay dos cantidades que no son columnas:
 *
 * - **el saldo de una cuenta**: `saldo_inicial + sum(movimientos)`
 * - **el disponible de un sobre**: `sum(asignaciones) + sum(movimientos no traspaso)`
 *
 * Los dos aparecen en varios lugares: la lista de sobres, el resumen de la cartera, la
 * invariante del patrimonio, el aviso de desborde y la precondicion de archivado. Cuando
 * cada archivo escribe su propia version, deja de ser un problema de estilo: las cinco
 * copias no se actualizan juntas, el disponible de la pantalla y el del panel empiezan a
 * diferir en centavos, y el archivado habilita o bloquea carteras con un criterio
 * distinto al que ve el usuario. Ademas, las copias ya se diferenciaron de verdad: una
 * conto filas en vez de sumar importes, y quedo un archivado que no habria terminado jamas.
 *
 * Por eso viven aqui, como **texto de SQL parametrizado** y no como columnas de Drizzle:
 * una columna interpolada entre `${}` sale sin calificar, y adentro de un subquery eso
 * resuelve a la tabla de adentro. `carteras/saldos.ts` necesita ademas usar su propio
 * alias (`c`, `s2`), asi que cada fragmento recibe el alias que lo contiene.
 *
 * `periodo` es opcional a proposito. Sin el, el disponible es "todo lo que ha pasado
 * hasta hoy"; con el, se corta en el fin del periodo. `null` significa "sin tope", y por
 * eso el filtro de fecha solo aparece cuando hay periodo.
 */

/** La fecha de corte de un periodo `YYYY-MM`: el primer dia del mes siguiente. */
export function finDePeriodo(periodo: string): SQL {
  return sql`(${periodo} || '-01')::date + interval '1 month'`
}

/**
 * El saldo de una cuenta: lo que puso al abrirla mas lo que movio.
 *
 * Los traspasos **si** cuentan ac�, y por eso es distinto del disponible de un sobre: un
 * traspaso entre dos cuentas de la misma cartera mueve saldo de una a otra, y la cartera
 * queda igual, pero cada cuenta tiene que reflejarlo.
 *
 * **No existe el traspaso entre carteras.** `traspasos` R1 lo rechaza, y por eso este
 * comentario antes describia un caso que no se puede dar: un movimiento de la cartera de
 * origen sin par en la de destino. Ese par es justamente lo que dejaria descuadrado el
 * patrimonio de la segunda cartera, asi que el requisito lo prohibe. El emparejamiento de
 * las dos patas -con signo opuesto y mismo `transferencia_id`- es de `070-traspasos`; aca
 * la columna existe y la cascada de `060` la lee, pero nadie crea el grupo todavia.
 */
export function saldoDeCuenta(alias: string, periodo: string | null = null): SQL<Dinero> {
  const porFecha = periodo === null ? sql`` : sql` and m.fecha < ${finDePeriodo(periodo)}`
  return sql<Dinero>`${sql.raw(alias)}.saldo_inicial + coalesce((
    select sum(m.monto) from movimientos m
    where m.cuenta_id = ${sql.raw(alias)}.id and m.eliminado_en is null${porFecha}
  ), 0)`
}

/**
 * El disponible de un sobre: lo asignado hasta el periodo, menos lo gastado.
 *
 * El signo lo lleva `movimientos.monto`. Las asignaciones del usuario son siempre
 * positivas �lo garantiza el `check` de la base� y el unico negativoallowed es el de
 * `reasignacion`, que escribe `moverEntreSobres` al vaciar el origen.
 *
 * Los movimientos de tipo `traspaso` quedan afuera: un traspaso entre cuentas con sobre
 * es dinero que entro a la cuenta **desde otro sobre**, y el otro sobre ya lo descont�. Si
 * se contara aqui, el disponible de los dos sobres sumaria menos de lo que hay.
 */
export function disponibleDeSobre(
  id: SQL | string,
  periodo: string | null = null,
): SQL<Dinero> {
  // El parametro es SIEMPRE la columna del id, nunca el alias. Un string se completa
  // con `.id` una sola vez aqui; un `SQL` ya viene como columna y se usa tal cual.
  // Concatenar `.id` en la plantilla rompia el caso de la columna, que daria
  // `sobres.id.id`.
  const ref = typeof id === 'string' ? sql.raw(`${id}.id`) : id
  const porFecha = periodo === null ? sql`` : sql` and m.fecha < ${finDePeriodo(periodo)}`

  return sql<Dinero>`(
    coalesce(
      (select sum(a.monto) from asignaciones a
        where a.sobre_id = ${ref}
        ${periodo === null ? sql`` : sql` and a.periodo <= ${periodo}`}),
      0
    )
    + coalesce(
      (select sum(m.monto) from movimientos m
        where m.sobre_id = ${ref}
          and m.eliminado_en is null
          and m.tipo <> 'traspaso'${porFecha}),
      0
    )
  )`
}
