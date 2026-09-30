import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { carteras } from '../db/schema'
import type { Dinero } from '../dinero'
import { filas } from './filas'
import { disponibleDeSobre, finDePeriodo, saldoDeCuenta } from './fragmentos'
import { calcularVariacion } from '../patrimonio/calculos'

export class CarteraNoExiste extends Error {
  constructor() {
    super('Esa cartera no existe, o no es tuya.')
    this.name = 'CarteraNoExiste'
  }
}

export interface PuntoPatrimonio {
  periodo: string
  patrimonio: Dinero
  disponible_sobres: Dinero
  dinero_suelto: Dinero
  diferencia_absoluta: Dinero | null
  variacion_porcentual: number | null
  porcentaje_texto: string | null
}

export interface HistorialPatrimonio {
  cartera_id: number
  nombre_cartera: string
  moneda: string
  periodos: PuntoPatrimonio[]
}

export interface OpcionesHistorial {
  desde?: string
  hasta?: string
}

export interface EstadoPatrimonioPeriodo {
  periodo: string
  patrimonio: Dinero
  disponible_sobres: Dinero
  dinero_suelto: Dinero
  moneda: string
  tiene_datos: boolean
}

async function obtenerCarteraActiva(db: Base, usuario_id: number, cartera_id: number) {
  const [cartera] = await db
    .select({
      id: carteras.id,
      nombre: carteras.nombre,
      moneda: carteras.moneda,
    })
    .from(carteras)
    .where(
      and(
        eq(carteras.id, cartera_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(carteras.eliminado_en),
      ),
    )

  if (!cartera) throw new CarteraNoExiste()
  return cartera
}

/**
 * Genera la lista de periodos (YYYY-MM) correlativos entre dos meses inclusivos.
 */
function generarRangoMeses(desde: string, hasta: string): string[] {
  const [a1, m1] = desde.split('-').map(Number)
  const [a2, m2] = hasta.split('-').map(Number)
  if (!a1 || !m1 || !a2 || !m2) return []

  const meses: string[] = []
  let a = a1
  let m = m1
  while (a < a2 || (a === a2 && m <= m2)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return meses
}

/**
 * Consulta el patrimonio de una cartera al cierre del periodo indicado.
 *
 * Cumple con R1 y la invariante de dominio:
 * patrimonio = suma(disponibles) + dinero_suelto
 *
 * El c�lculo toma como referencia el �ltimo momento del periodo (fecha < finDePeriodo)
 * y no guarda ning�n valor congelado.
 */
export async function consultarPatrimonioAlCierre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<EstadoPatrimonioPeriodo> {
  const cartera = await obtenerCarteraActiva(db, usuario_id, cartera_id)

  const [fila] = await filas<{
    patrimonio: Dinero
    disponible_sobres: Dinero
    dinero_suelto: Dinero
    total_movimientos: number | string
    total_asignaciones: number | string
    cuentas_con_saldo: number | string
  }>(
    db,
    sql`
      with saldos as (
        select
          c.id,
          (${saldoDeCuenta('c', periodo)}) as saldo
        from cuentas c
        where c.cartera_id = ${cartera_id}
          and c.eliminado_en is null
      ),
      disp_sobres as (
        select
          s.id,
          (${disponibleDeSobre('s', periodo)}) as disponible
        from sobres s
        where s.cartera_id = ${cartera_id}
          and s.eliminado_en is null
      ),
      actividad as (
        select
          (
            select count(*)
            from movimientos m
            join cuentas c on c.id = m.cuenta_id
            where c.cartera_id = ${cartera_id}
              and c.eliminado_en is null
              and m.eliminado_en is null
              and to_char(m.fecha, 'YYYY-MM') = ${periodo}
          ) as total_movimientos,
          (
            select count(*)
            from asignaciones a
            join sobres s on s.id = a.sobre_id
            where s.cartera_id = ${cartera_id}
              and s.eliminado_en is null
              and a.periodo = ${periodo}
          ) as total_asignaciones,
          (
            select count(*)
            from saldos
            where saldo <> 0
          ) as cuentas_con_saldo
      )
      select
        coalesce((select sum(saldo) from saldos), 0)::numeric(16,2) as patrimonio,
        coalesce((select sum(disponible) from disp_sobres), 0)::numeric(16,2) as disponible_sobres,
        (
          coalesce((select sum(saldo) from saldos), 0)
          - coalesce((select sum(disponible) from disp_sobres), 0)
        )::numeric(16,2) as dinero_suelto,
        act.total_movimientos,
        act.total_asignaciones,
        act.cuentas_con_saldo
      from actividad act
    `,
  )

  const movs = Number(fila?.total_movimientos ?? 0)
  const asigs = Number(fila?.total_asignaciones ?? 0)
  const cuentasSaldo = Number(fila?.cuentas_con_saldo ?? 0)

  const tiene_datos = movs > 0 || asigs > 0 || cuentasSaldo > 0

  return {
    periodo,
    patrimonio: fila?.patrimonio ?? '0.00',
    disponible_sobres: fila?.disponible_sobres ?? '0.00',
    dinero_suelto: fila?.dinero_suelto ?? '0.00',
    moneda: cartera.moneda,
    tiene_datos,
  }
}

/**
 * Consulta la evoluci�n hist�rica del patrimonio de una sola cartera, mes a mes.
 *
 * Cumple con R1, R2, R3 y R4:
 * - Orden cronol�gico estricto (del m�s antiguo al m�s reciente).
 * - Excluye periodos sin movimientos, asignaciones ni cuentas con saldo.
 * - Calcula diferencia absoluta y porcentaje respecto al periodo anterior.
 * - El primer periodo con datos no tiene comparaci�n previa (valores null).
 * - Aislamiento de cartera y moneda.
 */
export async function consultarHistorialPatrimonio(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  opciones: OpcionesHistorial = {},
): Promise<HistorialPatrimonio> {
  const cartera = await obtenerCarteraActiva(db, usuario_id, cartera_id)

  const periodosEventos = await filas<{ periodo: string }>(
    db,
    sql`
      select distinct periodo from (
        select to_char(m.fecha, 'YYYY-MM') as periodo
        from movimientos m
        join cuentas c on c.id = m.cuenta_id
        where c.cartera_id = ${cartera_id}
          and c.eliminado_en is null
          and m.eliminado_en is null
        union
        select a.periodo
        from asignaciones a
        join sobres s on s.id = a.sobre_id
        where s.cartera_id = ${cartera_id}
          and s.eliminado_en is null
        union
        select to_char(c.creado_en, 'YYYY-MM') as periodo
        from cuentas c
        where c.cartera_id = ${cartera_id}
          and c.eliminado_en is null
          and c.saldo_inicial <> '0.00'
      ) sub
      where periodo is not null
      order by periodo asc
    `,
  )

  if (periodosEventos.length === 0) {
    return {
      cartera_id,
      nombre_cartera: cartera.nombre,
      moneda: cartera.moneda,
      periodos: [],
    }
  }

  let minPeriodo = periodosEventos[0]!.periodo
  let maxPeriodo = periodosEventos[periodosEventos.length - 1]!.periodo

  if (opciones.desde && opciones.desde > minPeriodo) {
    minPeriodo = opciones.desde
  }
  if (opciones.hasta && opciones.hasta < maxPeriodo) {
    maxPeriodo = opciones.hasta
  }

  if (minPeriodo > maxPeriodo) {
    return {
      cartera_id,
      nombre_cartera: cartera.nombre,
      moneda: cartera.moneda,
      periodos: [],
    }
  }

  const meses = generarRangoMeses(minPeriodo, maxPeriodo)
  const periodosConDatos: EstadoPatrimonioPeriodo[] = []

  for (const mes of meses) {
    const estado = await consultarPatrimonioAlCierre(db, usuario_id, cartera_id, mes)
    if (estado.tiene_datos) {
      periodosConDatos.push(estado)
    }
  }

  const periodos: PuntoPatrimonio[] = []
  for (let i = 0; i < periodosConDatos.length; i++) {
    const actual = periodosConDatos[i]!
    const anterior = i === 0 ? null : periodosConDatos[i - 1]!.patrimonio
    const variacion = calcularVariacion(actual.patrimonio, anterior)

    periodos.push({
      periodo: actual.periodo,
      patrimonio: actual.patrimonio,
      disponible_sobres: actual.disponible_sobres,
      dinero_suelto: actual.dinero_suelto,
      diferencia_absoluta: variacion.diferencia_absoluta,
      variacion_porcentual: variacion.variacion_porcentual,
      porcentaje_texto: variacion.porcentaje_texto,
    })
  }

  return {
    cartera_id,
    nombre_cartera: cartera.nombre,
    moneda: cartera.moneda,
    periodos,
  }
}
