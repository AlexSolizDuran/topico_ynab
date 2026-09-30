import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Column, SQL } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { carteras, cuentas, movimientos, sobres } from '../db/schema'
import type { Dinero } from '../dinero'
import { esCero, esNegativo } from '../dinero'
import { filas } from './filas'
import { SobreNoExiste } from './sobres'
import { ImporteInvalido } from './errores-asignaciones'
import { CuentaAjena } from './cuentas'
import {
  ImporteCero,
  MovimientoEliminado,
  MovimientoNoExiste,
  MovimientoYaEliminado,
  PataDeTraspaso,
  SobreDeOtraCartera,
  TraspasoNoAsignable,
  TraspasoNoRegistrable,
} from './errores-movimientos'

/**
 * Movimientos: el registro de cada evento de dinero, y lo unico que se escribe para mover
 * un saldo o un disponible.
 *
 * **Ninguna operacion de este archivo recalcula nada.** No hay un `update` de saldo ni de
 * disponible, y no falta: los dos son sumas (`saldo_inicial + sum(monto)` y
 * `sum(asignaciones) + sum(movimientos)`), asi que escribir o dejar de escribir una fila ya
 * los cambia. Editar un importe no "recalcula" nada: cambia la fila de la que sale la suma.
 * Por eso corregir, borrar y restaurar son operaciones de una sola sentencia.
 *
 * **El aislamiento es por capa de aplicacion, no RLS**, asi que cada lectura y cada
 * escritura cruza la misma cadena de pertenencia:
 *
 * ```
 * movimientos -> cuenta_id -> cuentas -> carteras -> usuarios
 * ```
 *
 * El alta **no recibe `cartera_id`** (D2): seria un parametro que controla el formulario
 * y que la base no puede contrastar. Con un `cartera_id` equivocado se escribiria en la
 * cartera de otro y el unico aviso seria un resultado plausible, asi que la cartera se
 * deduce y el error se vuelve imposible de expresar en la interfaz.
 */

export type TipoDeMovimiento = 'gasto' | 'ingreso' | 'traspaso'

/** Un movimiento con lo que la pantalla necesita, y lo derivado que se muestra. */
export interface MovimientoVisto {
  id: number
  cuenta_id: number
  cuenta_nombre: string
  /** Derivada por el camino de la cuenta. No se declara en ningun lado. Ver D2. */
  cartera_id: number
  sobre_id: number | null
  sobre_nombre: string | null
  tipo: TipoDeMovimiento
  monto: Dinero
  fecha: string
  /** `YYYY-MM`, derivado de la fecha. Ver D1. */
  periodo: string
  descripcion: string
  comercio: string | null
  origen: 'manual' | 'recurrente'
  transferencia_id: number | null
  eliminado_en: Date | null
  /**
   * Sin sobre: pendiente de asignar (R2).
   *
   * Un traspaso tampoco tiene sobre, y **no** es un pendiente: su dinero no esta esperando
   * destino, llego desde otro sitio. Por eso el tipo se excluye del pendiente.
   */
  pendiente: boolean
}

/** El importe tiene que ser algo que Postgres pueda castear a `numeric`. */
const IMPORTE = /^-?\d{1,14}(\.\d{1,2})?$/

function comoImporte(importe: string): Dinero {
  const limpio = importe.trim()
  if (!IMPORTE.test(limpio)) throw new ImporteInvalido()
  // El cero se vuelve a comprobar aca aunque el formulario ya lo haya rechazado: R1 lo
  // prohibe, y un repositorio al que se llame sin pasar por el formulario tiene que
  // seguir siendo la frontera que lo hace cumplir.
  if (esCero(limpio)) throw new ImporteCero()
  return limpio
}

/** La barra invertida, el caracter de escape de `like`. */
const BARRA = '\\'

/**
 * El texto de la busqueda, con los comodines de `like` escapados **en SQL**.
 *
 * Sin esto, buscar `100%` traeria todos los movimientos: el `%` que el usuario escribio
 * seria un comodin, no un caracter. Y buscar `a_b` traeria tambien `axb`, por el mismo
 * motivo con el `_`.
 *
 * El orden de los `replace` importa: la barra se escapa **primero**, porque si se
 * escaparan despues los `%` que se agregan al escapar la barra, se escaparian ellos
 * tambien. Ver D10.
 */
function textoBuscable(texto: string): SQL {
  return sql`replace(replace(replace(${texto}, ${BARRA}, ${BARRA + BARRA}), '%', ${BARRA + '%'}), '_', ${BARRA + '_'})`
}

/**
 * Un `ilike '%texto%'` sobre las dos columnas de texto, con el escape declarado.
 *
 * El `or` va **envuelto en parentesis**, y no por estilo. `sql.join` arma
 * `(descripcion ilike ..) or (comercio ilike ..)` sin parentesis alrededor del conjunto, y
 * eso se escapa del `and` que lo contiene: en SQL `and` binds mas fuerte que `or`, asi que
 * `where a and (d ilike) or (c ilike) and tipo = 'ingreso'` se lee como
 * `(a and d ilike) or (c ilike and tipo = 'ingreso')`. El filtro de texto se comia el de
 * tipo, y la consulta devolvia movimientos de otro tipo sin avisar. La consulta no da
 * error: corre y devuelve una lista plausible, que es la peor forma de fallar.
 */
function coincide(texto: string, ...columnas: (SQL | Column)[]): SQL {
  const patrones = columnas.map(
    (columna) => sql`(${columna} ilike '%' || ${textoBuscable(texto)} || '%' escape ${BARRA})`,
  )
  return sql`(${sql.join(patrones, sql` or `)})`
}

/**
 * El periodo de una fecha, tal como lo define D1: el mes calendario, derivado.
 *
 * Se arma en SQL y no en JavaScript porque comparar o componer periodos es aritmetica de
 * fechas fuera de la base, y el caso de diciembre —el mes siguiente es enero del ano
 * siguiente— es un `if` que se puede olvidar. Ver `sobres.ts`, que tiene el mismo cuidado
 * en `finDePeriodo`.
 */
function periodoSql<T = unknown>(fecha: SQL | Column): SQL<T> {
  return sql<T>`to_char(date_trunc('month', ${fecha}), 'YYYY-MM')`
}

/* -------------------------------------------------------------------------- */
/* Pertenencia                                                                */
/* -------------------------------------------------------------------------- */

/**
 * La cartera de una cuenta que es de este usuario.
 *
 * Devuelve `undefined` en vez de lanzar cuando la cuenta no existe o es de otro, porque
 * quien llama necesita distinguir "no existe" de "existe pero en otra cartera" en el caso
 * del sobre. Ver `exigirSobreDeMismaCartera`.
 */
async function carteraDeCuenta(
  db: Base,
  usuario_id: number,
  cuenta_id: number,
): Promise<number | undefined> {
  const [fila] = await db
    .select({ cartera_id: cuentas.cartera_id })
    .from(cuentas)
    .innerJoin(carteras, eq(carteras.id, cuentas.cartera_id))
    .where(
      and(
        eq(cuentas.id, cuenta_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(cuentas.eliminado_en),
      ),
    )
    .limit(1)

  return fila?.cartera_id
}

/**
 * La cartera de un sobre que es de este usuario.
 *
 * `undefined` significa "no existe o no es tuyo", y los dos casos se responden igual a
 * proposito: distinguirlos revelaria la existencia de un sobre ajeno.
 */
async function carteraDeSobre(
  db: Base,
  usuario_id: number,
  sobre_id: number,
): Promise<number | undefined> {
  const [fila] = await db
    .select({ cartera_id: sobres.cartera_id })
    .from(sobres)
    .innerJoin(carteras, eq(carteras.id, sobres.cartera_id))
    .where(
      and(eq(sobres.id, sobre_id), eq(carteras.usuario_id, usuario_id), isNull(sobres.eliminado_en)),
    )
    .limit(1)

  return fila?.cartera_id
}

/**
 * Exige que el sobre sea de la misma cartera que la cuenta, y devuelve el `sobre_id`.
 *
 * Son tres casos y cada uno tiene su respuesta:
 *
 * - la cuenta no es de este usuario → `CuentaAjena`
 * - el sobre no existe o no es suyo → `SobreNoExiste`
 * - el sobre existe pero es de **otra cartera** → `SobreDeOtraCartera`
 *
 * Los dos ultimos se separan porque R3 los trata distinto en la practica: si el mensaje
 * fuera "el sobre no existe", un usuario que esta viendo el sobre en otra cartera
 * concluiria que escribio mal el id. Ver el encabezado del archivo.
 */
async function exigirSobreDeMismaCartera(
  db: Base,
  usuario_id: number,
  cuenta_id: number,
  sobre_id: number | null,
): Promise<number | null> {
  if (sobre_id === null) return null

  const carteraDeLaCuenta = await carteraDeCuenta(db, usuario_id, cuenta_id)
  if (carteraDeLaCuenta === undefined) throw new CuentaAjena()

  const carteraDelSobre = await carteraDeSobre(db, usuario_id, sobre_id)
  if (carteraDelSobre === undefined) throw new SobreNoExiste()
  if (carteraDelSobre !== carteraDeLaCuenta) throw new SobreDeOtraCartera()

  return sobre_id
}

/* -------------------------------------------------------------------------- */
/* Alta                                                                       */
/* -------------------------------------------------------------------------- */

export interface DatosAlta {
  cuenta_id: number
  sobre_id?: number | null
  /** Con signo. El repositorio es quien decide si eso es un gasto o un ingreso. */
  monto: string
  /** `AAAA-MM-DD`, el dia local. Ver D8. */
  fecha: string
  descripcion: string
  /** Ausente se guarda en `null`, no en cadena vacia. */
  comercio?: string | null
  /**
   * Omitido, se deduce del signo: negativo es gasto, positivo es ingreso.
   *
   * El importe **se guarda con el signo que manda el tipo**, en SQL con `abs`. Un gasto
   * escrito como `450` queda `-450.00`. Ver R1.
   */
  tipo?: TipoDeMovimiento
  origen?: 'manual' | 'recurrente'
}

/**
 * Registra un movimiento.
 *
 * El alta es **una sola sentencia**, con la pertenencia metida en el `where` de un
 * `insert ... select ... where exists(...)`. No es una consulta que seguido de un insert:
 * si la cuenta no es del usuario, el `where exists` no da fila y el `insert` no inserta
 * nada, asi que no hay ventana entre comprobar y escribir.
 *
 * El `monto` se normaliza en SQL con `abs`, no en JavaScript. Darle la vuelta a un signo no
 * es la aritmetica que la regla del dinero prohibe —el signo no tiene centavos— pero
 * hacerlo en la base evita depender de como el motor normalice `-0.00`.
 */
export async function registrarMovimiento(
  db: Base,
  usuario_id: number,
  datos: DatosAlta,
): Promise<{ id: number; monto: Dinero; tipo: TipoDeMovimiento; periodo: string }> {
  const importe = comoImporte(datos.monto)

  if (datos.tipo === 'traspaso') throw new TraspasoNoRegistrable()

  const tipo: TipoDeMovimiento =
    datos.tipo ?? (esNegativo(importe) ? 'gasto' : 'ingreso')

  const comercio = datos.comercio === undefined ? null : comercioNormalizado(datos.comercio)

  const origen = datos.origen ?? 'manual'

  return db.transaction(async (tx) => {
    const conexion = tx as Base

    const sobre_id = await exigirSobreDeMismaCartera(
      conexion,
      usuario_id,
      datos.cuenta_id,
      datos.sobre_id ?? null,
    )

    // El `where exists` es la pertenencia: si la cuenta no es de este usuario, no hay
    // fila que insertar y el `alta` de abajo sale vacio.
    const [creado] = await filas<{
      id: number
      monto: string
      tipo: TipoDeMovimiento
      fecha: string
      periodo: string
    }>(conexion, sql`
      with alta as (
        insert into movimientos
          (cuenta_id, sobre_id, tipo, monto, fecha, descripcion, comercio, origen)
        select
          ${datos.cuenta_id},
          ${sobre_id},
          ${tipo}::tipo_movimiento,
          case when ${tipo} = 'gasto' then -abs(${importe}::numeric) else abs(${importe}::numeric) end,
          ${datos.fecha}::date,
          ${datos.descripcion},
          ${comercio},
          ${origen}::origen_movimiento
        where exists (
          select 1 from cuentas c
          join carteras t on t.id = c.cartera_id
          where c.id = ${datos.cuenta_id}
            and t.usuario_id = ${usuario_id}
            and c.eliminado_en is null
        )
        returning id, monto, tipo, fecha
      )
      select
        a.id,
        a.monto::text as monto,
        a.tipo,
        to_char(a.fecha, 'YYYY-MM-DD') as fecha,
        ${periodoSql(sql.raw('a.fecha'))} as periodo
      from alta a
    `)

    if (!creado) throw new CuentaAjena()

    return {
      id: creado.id,
      monto: creado.monto,
      tipo: creado.tipo,
      periodo: creado.periodo,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Lectura                                                                    */
/* -------------------------------------------------------------------------- */

export interface FiltroMovimientos {
  /** Busca en descripcion y comercio. Escaping en SQL. Ver D10. */
  texto?: string
  cuenta_id?: number | null
  sobre_id?: number | null
  tipo?: TipoDeMovimiento
  /** `AAAA-MM-DD` inclusive. */
  desde?: string
  /** `AAAA-MM-DD` inclusive. */
  hasta?: string
}

/**
 * Los movimientos de este usuario, filtrados.
 *
 * **No recibe `cartera_id`**: R10 prohibe aceptar una cartera declarada, asi que la
 * cartera sale de la cuenta de cada fila y el filtro es por `carteras.usuario_id`. Sin
 * filtros, eso devuelve los movimientos de **todas** las carteras del usuario, que es lo
 * que R9 pide ("los movimientos de su cartera", en plural).
 *
 * Todos los filtros se combinan con `and`, y una combinacion que no matchea devuelve `[]`,
 * no la lista sin filtrar: el error de un filtro mal puesto es no ver nada, y eso es
 * informacion. La pagina muestra el caso con el aviso de R9.
 *
 * Los eliminados no salen: el borrado de R6 es logico, asi que la fila sigue existiendo
 * pero la lista es la de los que cuentan.
 */
export async function listarMovimientos(
  db: Base,
  usuario_id: number,
  filtro: FiltroMovimientos = {},
): Promise<MovimientoVisto[]> {
  const condiciones = condicionesDeFiltro(usuario_id, filtro)

  return db
    .select(seleccionDeMovimiento())
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuenta_id))
    .innerJoin(carteras, eq(carteras.id, cuentas.cartera_id))
    .leftJoin(sobres, eq(sobres.id, movimientos.sobre_id))
    .where(and(...condiciones))
    .orderBy(desc(movimientos.fecha), desc(movimientos.id))
}

/**
 * Los movimientos **eliminados** de este usuario, del mas reciente al mas viejo.
 *
 * Es la contraparte de `listarMovimientos`, y existe por la misma razon que
 * `listarSobresArchivados` existe al lado de `listarSobres`: R6 dice que el borrado es logico
 * y que el registro se conserva, y un sistema que conserva la fila pero no tiene forma de
 * volver a ofrecerla no esta permitiendo restablecerla — solo deshaciendo a ciegas. El
 * boton de restaurar necesita una lista de donde salir, y sin esto no habria donde buscar.
 *
 * Comparte `seleccionDeMovimiento()` con el listado normal a proposito: son **las mismas
 * columnas**, porque la fila de un movimiento borrado y la de ese mismo movimiento
 * restaurado tienen que ser indistinguibles. Si el derivado viviera en uno solo, la pantalla
 * del borrado y la del restaurado mostrarian numeros distintos para el mismo movimiento.
 *
 * El `pendiente` derivado sigue diciendo que si, porque `seleccionDeMovimiento` no mira
 * `eliminado_en`: no es un dato de la fila eliminada, es una pregunta sobre si el
 * movimiento **cuenta**. La vista de eliminados no lo usa, porque ahi lo unico que se ofrece
 * es restaurar.
 *
 * No recibe `cartera_id` ni filtros, igual que el listado normal: el filtro lo pone la
 * pagina, que ya lo hace para las cuentas, los grupos y los sobres.
 */
export async function listarMovimientosEliminados(
  db: Base,
  usuario_id: number,
): Promise<MovimientoVisto[]> {
  return db
    .select(seleccionDeMovimiento())
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuenta_id))
    .innerJoin(carteras, eq(carteras.id, cuentas.cartera_id))
    .leftJoin(sobres, eq(sobres.id, movimientos.sobre_id))
    .where(and(eq(carteras.usuario_id, usuario_id), isNotNull(movimientos.eliminado_en)))
    .orderBy(desc(movimientos.eliminado_en), desc(movimientos.id))
}

/** La pertenencia, mas los filtros que se hayan pedido. */
function condicionesDeFiltro(usuario_id: number, filtro: FiltroMovimientos): SQL[] {
  const condiciones: (SQL | undefined)[] = [
    eq(carteras.usuario_id, usuario_id),
    isNull(movimientos.eliminado_en),
  ]

  if (filtro.texto && filtro.texto.trim() !== '') {
    condiciones.push(coincide(filtro.texto.trim(), movimientos.descripcion, movimientos.comercio))
  }
  if (filtro.cuenta_id !== undefined && filtro.cuenta_id !== null) {
    condiciones.push(eq(movimientos.cuenta_id, filtro.cuenta_id))
  }
  if (filtro.sobre_id !== undefined && filtro.sobre_id !== null) {
    condiciones.push(eq(movimientos.sobre_id, filtro.sobre_id))
  }
  if (filtro.tipo) condiciones.push(eq(movimientos.tipo, filtro.tipo))
  if (filtro.desde) condiciones.push(sql`${movimientos.fecha} >= ${filtro.desde}::date`)
  if (filtro.hasta) condiciones.push(sql`${movimientos.fecha} <= ${filtro.hasta}::date`)

  return condiciones.filter((c): c is SQL => c !== undefined)
}

/**
 * Las columnas de la vista de un movimiento, con lo derivado resuelto en SQL.
 *
 * Va en una funcion porque el listado y la busqueda por id tienen que devolver
 * **exactamente** la misma fila: si el derivado viviera en uno solo, la pantalla y el
 * detalle podrian mostrar numeros distintos para el mismo movimiento.
 */
function seleccionDeMovimiento() {
  return {
    id: movimientos.id,
    cuenta_id: movimientos.cuenta_id,
    cuenta_nombre: cuentas.nombre,
    /** Derivada por el camino de la cuenta. No se declara en ningun lado. Ver D2. */
    cartera_id: cuentas.cartera_id,
    sobre_id: movimientos.sobre_id,
    sobre_nombre: sobres.nombre,
    tipo: movimientos.tipo,
    monto: movimientos.monto,
    fecha: movimientos.fecha,
    descripcion: movimientos.descripcion,
    comercio: movimientos.comercio,
    origen: movimientos.origen,
    transferencia_id: movimientos.transferencia_id,
    eliminado_en: movimientos.eliminado_en,
    periodo: periodoSql<string>(movimientos.fecha),
    // El pendiente se resuelve en SQL. Un traspaso tampoco tiene sobre y no es un
    // pendiente: su dinero no esta esperando destino.
    pendiente: sql<boolean>`(${movimientos.sobre_id} is null and ${movimientos.tipo} <> 'traspaso')`,
  }
}

/**
 * Un movimiento por id, de este usuario.
 *
 * La misma consulta que el listado, con el id agregado a las condiciones, para que un
 * movimiento de otro usuario salga como `undefined` igual que uno inexistente y la vista no
 * pueda distinguir los dos casos.
 */
export async function buscarMovimiento(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
): Promise<MovimientoVisto | undefined> {
  const condiciones = [...condicionesDeFiltro(usuario_id, {}), eq(movimientos.id, movimiento_id)]

  const [fila] = await db
    .select(seleccionDeMovimiento())
    .from(movimientos)
    .innerJoin(cuentas, eq(cuentas.id, movimientos.cuenta_id))
    .innerJoin(carteras, eq(carteras.id, cuentas.cartera_id))
    .leftJoin(sobres, eq(sobres.id, movimientos.sobre_id))
    .where(and(...condiciones))
    .limit(1)

  return fila
}

/**
 * El movimiento crudo, sin el filtro de eliminados.
 *
 * Lo necesitan las operaciones que **deben** ver una fila borrada para decidir: restaurar
 * tiene que distinguir "esta vivo" de "esta eliminado", y `editarMovimiento` rechaza el
 * segundo caso con un mensaje propio. Ver D6 y el grupo 5.
 */
export async function filaDeMovimiento(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
): Promise<
  | {
      id: number
      cuenta_id: number
      cartera_id: number
      sobre_id: number | null
      tipo: TipoDeMovimiento
      monto: Dinero
      fecha: string
      transferencia_id: number | null
      eliminado_en: Date | null
    }
  | undefined
> {
  const [fila] = await filas<{
    id: number
    cuenta_id: number
    cartera_id: number
    sobre_id: number | null
    tipo: TipoDeMovimiento
    monto: string
    fecha: string
    transferencia_id: number | null
    eliminado_en: Date | null
  }>(db, sql`
    select
      m.id,
      m.cuenta_id,
      c.cartera_id,
      m.sobre_id,
      m.tipo,
      m.monto::text as monto,
      to_char(m.fecha, 'YYYY-MM-DD') as fecha,
      m.transferencia_id,
      m.eliminado_en
    from movimientos m
    join cuentas c on c.id = m.cuenta_id
    join carteras t on t.id = c.cartera_id
    where m.id = ${movimiento_id} and t.usuario_id = ${usuario_id}
    limit 1
  `)

  return fila
}

/**
 * La cartera a la que pertenece un movimiento.
 *
 * R10 la pide de forma explicita, asi que tiene su propio export: sale de la cuenta, y no
 * de un dato declarado en el propio movimiento —que no existe, porque la columna no esta
 * en la tabla. Ver D2.
 */
export async function carteraDeMovimiento(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
): Promise<number> {
  const fila = await filaDeMovimiento(db, usuario_id, movimiento_id)
  if (!fila) throw new MovimientoNoExiste()
  return fila.cartera_id
}

/* -------------------------------------------------------------------------- */
/* Asignar y quitar sobre                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Le asigna un sobre a un movimiento, o se lo quita si `sobre_id` es `null`.
 *
 * Es **un `update` de una columna y nada mas**: no toca `monto` ni `cuenta_id`. De ahi sale
 * el escenario "el saldo de la cuenta no cambia": el saldo se deriva sumando por
 * `cuenta_id`, y esa columna no se esta tocando, asi que el saldo no puede moverse. El
 * disponible, en cambio, si, porque suma por `sobre_id` y la fila acaba de cambiar de
 * grupo. Los dos se adjustan solos. Ver D4.
 *
 * Por eso esta funcion **no** recalcula nada: no hay nada que recalcular.
 */
export async function asignarSobre(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
  sobre_id: number | null,
): Promise<{ id: number; sobre_id: number | null }> {
  const fila = await filaDeMovimiento(db, usuario_id, movimiento_id)
  if (!fila) throw new MovimientoNoExiste()
  if (fila.eliminado_en !== null) throw new MovimientoEliminado()

  // Un traspaso no se asigna. Su dinero entro a la cuenta desde otro sitio y meterlo en un
  // sobre descuenta el disponible de un sobre al que nunca se le asigno nada. El
  // `disponibleDeSobre` ya deja afuera los `traspaso`, asi que sin este chequeo el importe
  // desaparecia de los dos lados. Ver D4.
  if (fila.tipo === 'traspaso') throw new TraspasoNoAsignable()

  if (sobre_id !== null) {
    // La pertenencia del sobre, contra la cartera **de la cuenta del movimiento**: es el
    // mismo chequeo que hace el alta, y con el mismo error propio para "es de otra
    // cartera". Ver R3 y el encabezado del archivo.
    await exigirSobreDeMismaCartera(db, usuario_id, fila.cuenta_id, sobre_id)
  }

  const [actualizado] = await db
    .update(movimientos)
    .set({ sobre_id })
    .where(and(eq(movimientos.id, movimiento_id), isNull(movimientos.eliminado_en)))
    .returning({ id: movimientos.id, sobre_id: movimientos.sobre_id })

  if (!actualizado) throw new MovimientoNoExiste()
  return actualizado
}

/** Quitarle el sobre es el mismo `update`, con `null`. Ver D4. */
export async function quitarSobre(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
): Promise<{ id: number; sobre_id: null }> {
  const resultado = await asignarSobre(db, usuario_id, movimiento_id, null)
  return { id: resultado.id, sobre_id: null }
}

/* -------------------------------------------------------------------------- */
/* Editar                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Los cambios de una edicion. Todos opcionales: el formulario manda el movimiento entero,
 * pero un cambio de uno en uno es el caso normal y no obliga a tocar lo demas.
 *
 * **`tipo` no esta en la lista, y no es un olvido.** Es la razon de que `monto` se
 * normalice contra el tipo **de la fila** y no contra el signo de lo que llega: corregir un
 * gasto de `-450` a `380` es un gasto de `-380`, no un ingreso de `380`. Si el tipo fuera
 * editable, editar el importe seria tambien editar el tipo, y R5 no lo pide.
 */
export interface DatosEdicion {
  cuenta_id?: number
  /** `null` explicito quita el sobre: es distinto de omitir el campo. */
  sobre_id?: number | null
  monto?: string
  /** `AAAA-MM-DD`. */
  fecha?: string
  descripcion?: string
  comercio?: string | null
}

/**
 * Corrige un movimiento.
 *
 * **Un solo `update`**, como todo lo demas de este archivo: nada recalcula, porque el saldo
 * y el disponible son sumas. Corregir el importe de 450 a 380 no "recalcula" el saldo, deja
 * de sumar 450 y empieza a sumar 380, y el saldo se ajusta solo. Por eso la edicion no sabe
 * nada de saldos ni de disponibles.
 *
 * La pertenencia se valida sobre los valores **efectivos** —la cuenta nueva si viene, si no
 * la que ya estaba— porque R5 pide que la cuenta y el sobre *sigan* siendo de la misma
 * cartera despues de editar, no antes. Validar el estado viejo dejaria pasar el caso en que
 * se mueve el sobre a otra cartera sin tocar la cuenta.
 */
export async function editarMovimiento(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
  cambios: DatosEdicion,
): Promise<MovimientoVisto> {
  return db.transaction(async (tx) => {
    const conexion = tx as Base

    const fila = await filaDeMovimiento(conexion, usuario_id, movimiento_id)
    if (!fila) throw new MovimientoNoExiste()

    // Editar algo ya borrado resucitaria una fila que el usuario dio por eliminada, y el
    // borrado de R6 es logico: la fila sigue ahi, pero volver a sumarla sin restaurarla
    // antes rompe el orden de las dos operaciones. Ver 5.6.
    if (fila.eliminado_en !== null) throw new MovimientoEliminado()

    // D6: una pata se edita en espejo o no se edita. Editar una sola desempareja el grupo y
    // el patrimonio deja de cuadrar. En `060` no hay ni forma de crear un traspaso, asi que
    // esto no se pierde nada: `070` decide si el grupo se reescribe entero.
    if (fila.transferencia_id !== null) throw new PataDeTraspaso()

    const cuentaEfectiva = cambios.cuenta_id ?? fila.cuenta_id
    const sobreEfectivo =
      cambios.sobre_id === undefined ? fila.sobre_id : cambios.sobre_id
    await exigirSobreDeMismaCartera(conexion, usuario_id, cuentaEfectiva, sobreEfectivo)

    const valores = {
      ...(cambios.cuenta_id === undefined ? {} : { cuenta_id: cambios.cuenta_id }),
      ...(cambios.sobre_id === undefined ? {} : { sobre_id: cambios.sobre_id }),
      ...(cambios.monto === undefined ? {} : { monto: montoConSigno(cambios.monto, fila.tipo) }),
      ...(cambios.fecha === undefined ? {} : { fecha: sql`${cambios.fecha}::date` }),
      ...(cambios.descripcion === undefined ? {} : { descripcion: cambios.descripcion }),
      ...(cambios.comercio === undefined ? {} : { comercio: comercioNormalizado(cambios.comercio) }),
    }

    if (Object.keys(valores).length > 0) {
      const [actualizado] = await conexion
        .update(movimientos)
        .set(valores)
        .where(and(eq(movimientos.id, movimiento_id), isNull(movimientos.eliminado_en)))
        .returning({ id: movimientos.id })

      if (!actualizado) throw new MovimientoNoExiste()
    }

    const vista = await buscarMovimiento(conexion, usuario_id, movimiento_id)
    if (!vista) throw new MovimientoNoExiste()
    return vista
  })
}

/**
 * El importe, con el signo del tipo al que pertenece.
 *
 * El `abs` y la resta son de Postgres, no de JavaScript: el signo no tiene centavos, pero
 * la normalizacion va en la base por la misma razon que en el alta, para no depender de como
 * el motor trate `-0.00`.
 */
function montoConSigno(importe: string, tipo: TipoDeMovimiento): SQL<Dinero> {
  return sql<Dinero>`case when ${tipo} = 'gasto' then -abs(${importe}::numeric) else abs(${importe}::numeric) end`
}

/** Ausente o en blanco es `null`, igual que en el alta: no hay cadenas vacias de comercio. */
function comercioNormalizado(comercio: string | null): string | null {
  if (comercio === null) return null
  return comercio.trim() === '' ? null : comercio.trim()
}

/* -------------------------------------------------------------------------- */
/* Borrar y restaurar                                                          */
/* -------------------------------------------------------------------------- */

/**
 * El borrado logico de un movimiento, con la cascada de las patas.
 *
 * **Es un solo `update`**, y la cascada sale de la misma sentencia. El `where` tiene dos
 * ramas, y esa es la parte que no se puede abreviar:
 *
 * ```
 * case when <grupo> is null then id = <la fila>
 *      else transferencia_id = <grupo> end
 * ```
 *
 * - la primera rama es el caso trivial: sin grupo, la fila se borra sola. Se ancla en `id` y
 *   no en "las filas sin grupo", porque eso seria todo el historial de la cartera.
 * - la segunda es la cascada: las dos filas del grupo, y el borrado de la propia pata es un
 *   caso de ese mismo `update`, no una operacion aparte.
 *
 * Dos trampas que las pruebas de este archivo pagaron una vez cada una:
 *
 * `transferencia_id is not distinct from <grupo>` **no** sirve para el caso trivial. Con
 * `<grupo>` en `null` eso da **verdadero**, porque compara bien los `null`, asi que el `where`
 * marca todos los movimientos sin grupo de la cartera. Y no es un caso raro: es el `where`
 * entero, porque casi todo el historial esta sin grupo.
 *
 * El parametro lleva `::int` explicito. `${grupo} is null` a secas es `error 42P18: could
 * not determine data type of parameter $1`: Postgres no puede adivinar el tipo de un
 * parametro suelto al compararlo con `null`.
 *
 * Por que no un bucle de `update` por pata: entre sentencia y sentencia las filas quedan
 * en un estado a medio camino, y una lectura concurrente podria ver una pata borrada con su
 * par todavia vivo —un traspaso descuadrado, que es justo el estado que `patrimonio` no
 * tolera. Por que no un trigger de base: el repo aisla por capa de aplicacion y toda la
 * logica vive en los repositorios; un trigger seria la unica pieza de negocio fuera de
 * JavaScript. Ver D7.
 *
 * Borrar no "revierte" nada: la fila sigue y sus sumas dejan de contarla. Por eso no hace
 * falta un `update` de saldo, ni de disponible, ni un paso de "recalcular".
 */
export async function eliminarMovimiento(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
): Promise<{ id: number; eliminados: number }> {
  const fila = await filaDeMovimiento(db, usuario_id, movimiento_id)
  if (!fila) throw new MovimientoNoExiste()
  if (fila.eliminado_en !== null) throw new MovimientoEliminado()

  return db.transaction(async (tx) => {
    const conexion = tx as Base

    // La pertenencia se vuelve a cruzar aca, no se confia en la lectura de arriba: entre
    // una consulta y otra el usuario pudo perder el acceso, y el borrado no puede quedar
    // colgando de una fila que se leyo antes de perderlo.
    const marcadas = await filas<{ id: number }>(conexion, sql`
      update movimientos m
      set eliminado_en = now()
      where m.eliminado_en is null
        and case
          when ${fila.transferencia_id}::int is null then m.id = ${movimiento_id}
          else m.transferencia_id = ${fila.transferencia_id}::int
        end
        and exists (
          select 1
          from cuentas c
          join carteras t on t.id = c.cartera_id
          where c.id = m.cuenta_id
            and t.usuario_id = ${usuario_id}
        )
      returning m.id
    `)

    if (marcadas.length === 0) throw new MovimientoNoExiste()

    return { id: movimiento_id, eliminados: marcadas.length }
  })
}

/**
 * Devuelve un movimiento borrado a las sumas, con la misma cascada en espejo.
 *
 * La simetria con `eliminarMovimiento` es exacta: mismo `where` de dos ramas, misma
 * pertenencia, y por el mismo motivo —restaurar una pata sin su par dejaria un traspaso
 * descuadrado, asi que las dos filas vuelven juntas o no vuelve ninguna.
 */
export async function restaurarMovimiento(
  db: Base,
  usuario_id: number,
  movimiento_id: number,
): Promise<{ id: number; restaurados: number }> {
  const fila = await filaDeMovimiento(db, usuario_id, movimiento_id)
  if (!fila) throw new MovimientoNoExiste()
  if (fila.eliminado_en === null) throw new MovimientoYaEliminado()

  return db.transaction(async (tx) => {
    const conexion = tx as Base

    const restauradas = await filas<{ id: number }>(conexion, sql`
      update movimientos m
      set eliminado_en = null
      where m.eliminado_en is not null
        and case
          when ${fila.transferencia_id}::int is null then m.id = ${movimiento_id}
          else m.transferencia_id = ${fila.transferencia_id}::int
        end
        and exists (
          select 1
          from cuentas c
          join carteras t on t.id = c.cartera_id
          where c.id = m.cuenta_id
            and t.usuario_id = ${usuario_id}
        )
      returning m.id
    `)

    if (restauradas.length === 0) throw new MovimientoNoExiste()

    return { id: movimiento_id, restaurados: restauradas.length }
  })
}

/* -------------------------------------------------------------------------- */
/* Devoluciones                                                                */
/* -------------------------------------------------------------------------- */

export {
  ImporteCero,
  MovimientoEliminado,
  MovimientoNoExiste,
  MovimientoYaEliminado,
  PataDeTraspaso,
  SobreDeOtraCartera,
  TraspasoNoAsignable,
  TraspasoNoRegistrable,
} from './errores-movimientos'
