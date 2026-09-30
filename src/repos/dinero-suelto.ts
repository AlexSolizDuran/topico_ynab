import { sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import type { Dinero } from '../dinero'
import { filas as filasDe } from './filas'
import { disponibleDeFilaSql, disponibleDeSobreSql, pertenenciaDeSobre } from './sobres'
import { carteras, sobres } from '../db/schema'
import { saldoDeCuenta } from './fragmentos'

/**
 * El dinero suelto de una cartera, y la invariante que lo sostiene.
 *
 * `dinero_suelto` **no es una columna**. Es `sum(saldos de cuentas) - sum(disponibles de
 * sobres)`, derivado en cada lectura, por la misma razon que el disponible de un sobre
 * no se guarda: un saldo derivado no puede quedar desfasado, porque no hay nada que
 * desfasar.
 *
 * La invariante del requerimiento —`patrimonio = suma(disponibles) + dinero_suelto`— es
 * entonces una identidad, no una restriccion que haya que mantener. Se cumple siempre,
 * hasta con sobres en negativo y cuentas en deuda, porque un sumando se define como el
 * otro menos el tercero. Y por eso `comprobarInvariante` existe igual: no para
 * "asegurarla", sino para que un error en una de las sumas se note en la prueba y en el
 * log, en vez de dejar un numero plausible pero falso en la pantalla.
 *
 * Las tres sumas van en **la misma consulta**. Si calcularan por separado, cada una
 * leeria los datos en un instante distinto y la invariante fallaria sin que hubiera
 * ningun error de verdad.
 */

/** El resumen de una cartera: patrimonio, asignado, dinero suelto y desborde. */
export interface ResumenDeCartera {
  /** `sum(saldos)`: lo que hay en cuentas, cuentas en negativo incluidas. */
  patrimonio: Dinero
  /** `sum(disponibles)`: lo repartido en sobres. Puede ser negativo. */
  asignado: Dinero
  /** `patrimonio - asignado`. Puede ser negativo si se asigno mas de lo que hay. */
  dinero_suelto: Dinero
  /**
   * `sum(-disponible)` de los sobres en negativo, o cero.
   *
   * Va en positivo porque es "cuanto falta tapar", que es como lo lee la persona. Es la
   * cifra contra la que se decide si el dinero suelto alcanza a tapar.
   */
  desborde: Dinero
  /** Si el dinero suelto cubre la totalidad del desborde de la cartera. */
  cubre_desborde: boolean
  /** Si al menos queda dinero suelto con el que empezar a tapar. */
  hay_dinero_suelto: boolean
}

export class CarteraNoExiste extends Error {
  constructor() {
    super('Esa cartera no existe, o no es tuya.')
    this.name = 'CarteraNoExiste'
  }
}

export class InvarianteRota extends Error {
  constructor(periodo: string) {
    super(
      `La cartera no cuadra en ${periodo}: la suma de disponibles mas el dinero suelto ` +
        `no es igual al patrimonio. Es un error, no un estado valido.`,
    )
    this.name = 'InvarianteRota'
  }
}

/**
 * La suma de saldos de las cuentas vivas de la cartera.
 *
 * El saldo de una cuenta tampoco es columna —`saldo_inicial + sum(movimientos)`—, asi que
 * aqui hay una suma dentro de otra. La formula sale de `repos/fragmentos.ts`, que es la
 * unica copia: la misma que usan la lista de sobres y la precondicion de archivado.
 */
function sumaDeSaldos(usuario_id: number, cartera_id: number) {
  return sql<Dinero>`coalesce((
    select sum(saldo) from (
      ${saldoDeCartera(usuario_id, cartera_id)}
    ) as saldos
  ), 0)`
}

function saldoDeCartera(usuario_id: number, cartera_id: number) {
  return sql`select
    ${saldoDeCuenta('c')} as saldo
    from cuentas c
    where c.cartera_id = ${cartera_id}
      and c.eliminado_en is null
      and exists (
        select 1 from carteras k
        where k.id = c.cartera_id and k.usuario_id = ${usuario_id} and k.eliminado_en is null
      )`
}

/** El dinero suelto: los saldos menos lo repartido. Como funcion, porque escribirlo aqui
 *  deja el `select` de abajo en una linea por columna. */
function suelto(usuario_id: number, cartera_id: number, periodo: string) {
  return sql<Dinero>`${sumaDeSaldos(usuario_id, cartera_id)} - ${sumaDeDisponibles(usuario_id, cartera_id, periodo)}`
}

/** La suma de todos los disponibles de la cartera en un periodo. */
function sumaDeDisponibles(usuario_id: number, cartera_id: number, periodo: string) {
  return sql<Dinero>`coalesce((
    select sum(${disponibleDeFilaSql(periodo)})
    from sobres
    where ${pertenenciaDeSobre(usuario_id, cartera_id)}
      and ${sobres.eliminado_en} is null
  ), 0)`
}

/** `sum(-disponible)` de los sobres en negativo: cuanto falta tapar, en positivo. */
function sumaDeDesborde(usuario_id: number, cartera_id: number, periodo: string) {
  return sql<Dinero>`coalesce((
    select sum(-(${disponibleDeFilaSql(periodo)}))
    from sobres
    where ${pertenenciaDeSobre(usuario_id, cartera_id)}
      and ${sobres.eliminado_en} is null
      and ${disponibleDeFilaSql(periodo)} < 0
  ), 0)`
}

/**
 * El resumen de una cartera en un periodo.
 *
 * El periodo se propaga a la comparacion de asignaciones y a la de movimientos, asi que
 * los tres numeros son coherentes entre si para la misma fecha de corte.
 */
export async function resumenDeCartera(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<ResumenDeCartera> {
  // Cada fragmento se pide con su propia llamada para que cada columna se lea como una
  // sola expresion. Es legibilidad, no una necesidad: los `SQL` de Drizzle son inmutables
  // y reutilizables, y el mismo fragmento puede aparecer las veces que haga falta. El
  // `-14000.00` que se persiguio cuando se escribio esto era una expectativa mal
  // calculada en la prueba, no una doble emision de la libreria.
  const [fila] = await filasDe<ResumenDeCartera>(db, sql`
    select
      ${sumaDeSaldos(usuario_id, cartera_id)} as patrimonio,
      ${sumaDeDisponibles(usuario_id, cartera_id, periodo)} as asignado,
      ${sumaDeSaldos(usuario_id, cartera_id)} - ${sumaDeDisponibles(usuario_id, cartera_id, periodo)} as dinero_suelto,
      ${sumaDeDesborde(usuario_id, cartera_id, periodo)} as desborde,
      (${sumaDeSaldos(usuario_id, cartera_id)} - ${sumaDeDisponibles(usuario_id, cartera_id, periodo)})
        >= ${sumaDeDesborde(usuario_id, cartera_id, periodo)} as cubre_desborde,
      (${sumaDeSaldos(usuario_id, cartera_id)} - ${sumaDeDisponibles(usuario_id, cartera_id, periodo)})
        > 0 as hay_dinero_suelto
    ${pertenenciaDeCartera(usuario_id, cartera_id)}
  `)

  if (!fila) throw new CarteraNoExiste()
  return fila
}

/**
 * La cartera tiene que ser de este usuario y no estar archivada.
 *
 * Sin esto, `resumenDeCartera` con el id de otra cartera devuelve una fila de ceros en
 * lugar de un error: las sumas filtran por `cartera_id` y no encuentran nada, y un
 * `coalesce(..., 0)` convierte "no tengo acceso" en "todo esta en cero". Que el
 * repositorio centralizado rechace el id ajeno es lo que evita que eso llegue a
 * pantalla.
 */
function pertenenciaDeCartera(usuario_id: number, cartera_id: number) {
  return sql`where exists (
    select 1 from carteras
    where ${carteras.id} = ${cartera_id}
      and ${carteras.usuario_id} = ${usuario_id}
      and ${carteras.eliminado_en} is null
  )`
}

/** El dinero suelto, si lo que se necesita es solo esa cifra. */
export async function dineroSuelto(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<Dinero> {
  return (await resumenDeCartera(db, usuario_id, cartera_id, periodo)).dinero_suelto
}

/**
 * Comprueba la invariante y lanza si no cuadra.
 *
 * La comparacion es en SQL con `=`, no comparando los dos strings en JavaScript:
 * `"800.00"` y `"800.0"` son el mismo importe y textos distintos, y Postgres ya lo sabe.
 *
 * Lanza, y no devuelve un booleano, porque el requerimiento pide tratar el desajuste
 * como error y no como estado valido. Un `false` tienta a seguir operando; una
 * excepcion corta.
 */
export async function comprobarInvariante(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<void> {
  const [fila] = await filasDe<{ cuadra: boolean }>(db, sql`
    select (
      ${sumaDeDisponibles(usuario_id, cartera_id, periodo)}
      + (${sumaDeSaldos(usuario_id, cartera_id)} - ${sumaDeDisponibles(usuario_id, cartera_id, periodo)})
    ) = ${sumaDeSaldos(usuario_id, cartera_id)} as cuadra
    ${pertenenciaDeCartera(usuario_id, cartera_id)}
  `)

  if (!fila) throw new CarteraNoExiste()
  if (!fila.cuadra) throw new InvarianteRota(periodo)
}

/** El aviso de desborde de un sobre, con el dinero suelto de la cartera al lado. */
export interface AvisoDeDesborde {
  /** El disponible del sobre, en negativo. */
  negativo: Dinero
  /** El dinero suelto de la cartera, con su signo. */
  dinero_suelto: Dinero
  /** Si hay dinero suelto siquiera para empezar a tapar. */
  hay_dinero_suelto: boolean
  /** Si el dinero suelto alcanza para tapar **este** sobre entero. */
  cubre: boolean
}

/**
 * El aviso de un sobre en negativo, con las dos cosas que el requerimiento pide saber.
 *
 * El disponible y el dinero suelto se leen **aqui**, y no llegan como parametros. Si el
 * que llama pasara las cifras que ya tenia en memoria, el aviso compararia dos numeros
 * que pudieron cambiar entre la lectura y el clic, y el "se puede tapar" de la pantalla
 * podria ser falso. Leyéndolos de nuevo, el aviso refleja lo que hay en este instante.
 *
 * Las dos comparaciones las decide Postgres con `numeric`. En JavaScript, comparar
 * `"-400.00"` contra `"5000.00"` como texto compara un signo contra un digito, y el
 * resultado no depende de quantas cifras tenga el importe.
 *
 * Sin `from`: las tres expresiones son subconsultas escalares, y la existencia del sobre
 * se comprueba con `exists`, que devuelve una fila aunque el disponible valga cero. Un
 * sobre en cero no es un desborde, y `cubre` sale en `false` por el `negativo < 0` que
 * se comprueba en la misma consulta.
 */
export async function avisarDesborde(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
  sobre_id: number,
): Promise<AvisoDeDesborde> {
  const disponible = disponibleDeSobreSql(sobre_id, periodo)

  const [fila] = await filasDe<{
    negativo: Dinero
    dinero_suelto: Dinero
    hay_dinero_suelto: boolean
    cubre: boolean
  }>(db, sql`
    select
      ${disponible} as negativo,
      ${suelto(usuario_id, cartera_id, periodo)} as dinero_suelto,
      (${suelto(usuario_id, cartera_id, periodo)} > 0) as hay_dinero_suelto,
      (${disponible} < 0 and ${suelto(usuario_id, cartera_id, periodo)} >= -(${disponible})) as cubre
    where exists (
      select 1 from sobres
      where ${pertenenciaDeSobre(usuario_id, cartera_id)}
        and ${sobres.id} = ${sobre_id}
        and ${sobres.eliminado_en} is null
    )
  `)

  if (!fila) throw new SobreNoPertenece()
  return {
    negativo: fila.negativo,
    dinero_suelto: fila.dinero_suelto,
    hay_dinero_suelto: fila.hay_dinero_suelto === true,
    cubre: fila.cubre === true,
  }
}

export class SobreNoPertenece extends Error {
  constructor() {
    super('Ese sobre no existe, o no es de esta cartera.')
    this.name = 'SobreNoPertenece'
  }
}
