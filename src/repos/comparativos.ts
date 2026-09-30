import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import type { Dinero } from '../dinero'
import { carteras, grupos, movimientos, sobres } from '../db/schema'
import { filas } from './filas'
import { aCentimos, deCentimos } from '../patrimonio/calculos'

export class CarteraNoExiste extends Error {
  constructor() {
    super('Esa cartera no existe, o no es tuya.')
    this.name = 'CarteraNoExiste'
  }
}

export type DireccionVariacion = 'aumento' | 'disminucion' | 'sin_cambio'

export interface ConfiguracionUmbral {
  /** Umbral en porcentaje (ej. 20 para 20%). */
  porcentaje?: number
  /** Umbral en importe absoluto exacto en Dinero (ej. '500.00'). */
  importe_absoluto?: Dinero
}

export const UMBRAL_DEFECTO: ConfiguracionUmbral = {
  porcentaje: 20,
  importe_absoluto: '500.00',
}

export interface Variacion {
  periodo: string
  importe: Dinero
  /** Diferencia con signo: positiva si gastó más, negativa si gastó menos. */
  diferencia: Dinero
  /** Importe absoluto de la diferencia (sin signo menos). */
  diferencia_absoluta: Dinero
  direccion: DireccionVariacion
  /** Porcentaje formateado con signo (ej. '+150.00%', '-33.33%'), o null si la base es cero. */
  porcentaje: string | null
  porcentaje_numero: number | null
  destacada: boolean
}

export interface SobreComparativo {
  id: number
  grupo_id: number
  nombre: string
  icono?: string | null
  color?: string | null
  archivado: boolean
  orden: number
  importes_por_periodo: Record<string, Dinero>
  variaciones: Record<string, Variacion>
  tiene_variacion_destacada: boolean
}

export interface GrupoComparativo {
  id: number
  nombre: string
  icono?: string | null
  color?: string | null
  orden: number
  totales_por_periodo: Record<string, Dinero>
  variaciones: Record<string, Variacion>
  sobres: SobreComparativo[]
  tiene_variacion_destacada: boolean
}

export interface ElementoDestacado {
  tipo: 'grupo' | 'sobre'
  id: number
  nombre: string
  periodo: string
  diferencia: Dinero
  diferencia_absoluta: Dinero
  direccion: DireccionVariacion
  porcentaje: string | null
}

export interface DatosComparativo {
  cartera: {
    id: number
    nombre: string
    moneda: string
  }
  periodos: string[]
  periodo_referencia: string
  umbral: ConfiguracionUmbral
  grupos: GrupoComparativo[]
  total_general_por_periodo: Record<string, Dinero>
  variaciones_total_general: Record<string, Variacion>
  hay_variaciones_destacadas: boolean
  elementos_destacados: ElementoDestacado[]
}

/**
 * Evalúa si una variación supera el umbral configurado.
 *
 * Se destaca si la diferencia absoluta en céntimos supera el umbral de importe
 * O si la variación porcentual supera el umbral de porcentaje.
 */
export function superaUmbral(
  diferenciaCentimos: bigint,
  porcentajeNumero: number | null,
  umbral: ConfiguracionUmbral,
): boolean {
  if (diferenciaCentimos === 0n) return false

  const absDiffCentimos = diferenciaCentimos < 0n ? -diferenciaCentimos : diferenciaCentimos

  const tieneImporte = umbral.importe_absoluto !== undefined && umbral.importe_absoluto !== null
  const tienePorcentaje = umbral.porcentaje !== undefined && umbral.porcentaje !== null

  if (tieneImporte && tienePorcentaje) {
    const umbralCentimos = aCentimos(umbral.importe_absoluto!)
    const superaImporte = absDiffCentimos >= umbralCentimos
    const superaPorcentaje = porcentajeNumero !== null && Math.abs(porcentajeNumero) >= umbral.porcentaje!
    return superaImporte || superaPorcentaje
  }

  if (tieneImporte) {
    const umbralCentimos = aCentimos(umbral.importe_absoluto!)
    return absDiffCentimos >= umbralCentimos
  }

  if (tienePorcentaje) {
    return porcentajeNumero !== null && Math.abs(porcentajeNumero) >= umbral.porcentaje!
  }

  return false
}

/**
 * Calcula la variación de gasto de un periodo comparado respecto al periodo de referencia.
 */
export function calcularVariacionComparativo(
  periodo: string,
  importeActual: Dinero,
  importeReferencia: Dinero,
  umbral: ConfiguracionUmbral,
): Variacion {
  const actualCent = aCentimos(importeActual)
  const refCent = aCentimos(importeReferencia)
  const diffCent = actualCent - refCent

  let direccion: DireccionVariacion = 'sin_cambio'
  if (diffCent > 0n) {
    direccion = 'aumento'
  } else if (diffCent < 0n) {
    direccion = 'disminucion'
  }

  const difAbsolutaCent = diffCent < 0n ? -diffCent : diffCent
  const difAbsoluta = deCentimos(difAbsolutaCent)
  const diferenciaConSigno = deCentimos(diffCent)

  let porcentaje: string | null = null
  let porcentajeNum: number | null = null

  if (refCent === 0n) {
    if (actualCent === 0n) {
      porcentaje = '0.00%'
      porcentajeNum = 0
    } else {
      porcentaje = null
      porcentajeNum = null
    }
  } else {
    const ajuste = diffCent >= 0n ? refCent / 2n : -refCent / 2n
    const centesimas = (diffCent * 10000n + ajuste) / refCent
    porcentajeNum = Number(centesimas) / 100
    const signo = porcentajeNum > 0 ? '+' : ''
    porcentaje = `${signo}${porcentajeNum.toFixed(2)}%`
  }

  const destacada = superaUmbral(diffCent, porcentajeNum, umbral)

  return {
    periodo,
    importe: importeActual,
    diferencia: diferenciaConSigno,
    diferencia_absoluta: difAbsoluta,
    direccion,
    porcentaje,
    porcentaje_numero: porcentajeNum,
    destacada,
  }
}

/**
 * Consulta la matriz de comparativos entre periodos para la cartera abierta.
 */
export async function consultarComparativo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodos: string[],
  periodo_referencia: string,
  umbralConfig: ConfiguracionUmbral = UMBRAL_DEFECTO,
): Promise<DatosComparativo> {
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

  const listaPeriodos = Array.from(new Set([...periodos, periodo_referencia])).sort()

  const umbral: ConfiguracionUmbral = {
    porcentaje: umbralConfig.porcentaje ?? UMBRAL_DEFECTO.porcentaje,
    importe_absoluto: umbralConfig.importe_absoluto ?? UMBRAL_DEFECTO.importe_absoluto,
  }

  const filasGrupos = await db
    .select({
      id: grupos.id,
      nombre: grupos.nombre,
      orden: grupos.orden,
      archivado: grupos.archivado,
    })
    .from(grupos)
    .where(
      and(
        eq(grupos.cartera_id, cartera_id),
        eq(grupos.archivado, false),
      ),
    )
    .orderBy(grupos.orden, grupos.nombre)

  const filasSobres = await db
    .select({
      id: sobres.id,
      grupo_id: sobres.grupo_id,
      nombre: sobres.nombre,
      orden: sobres.orden,
      archivado: sobres.archivado,
    })
    .from(sobres)
    .where(
      and(
        eq(sobres.cartera_id, cartera_id),
        isNull(sobres.eliminado_en),
      ),
    )
    .orderBy(sobres.orden, sobres.nombre)

  const clausulaPeriodos = sql.join(listaPeriodos.map((p) => sql`${p}`), sql`, `)
  const gastosSobres = await filas<{
    sobre_id: number
    periodo: string
    gasto: Dinero
  }>(
    db,
    sql`
      select
        m.sobre_id,
        to_char(m.fecha, 'YYYY-MM') as periodo,
        coalesce(sum(case when m.tipo = 'gasto' or (m.tipo is null and m.monto < 0) then abs(m.monto) else 0 end), 0) as gasto
      from movimientos m
      join cuentas c on c.id = m.cuenta_id
      where c.cartera_id = ${cartera_id}
        and c.eliminado_en is null
        and m.eliminado_en is null
        and m.transferencia_id is null
        and m.tipo <> 'traspaso'
        and m.sobre_id is not null
        and to_char(m.fecha, 'YYYY-MM') in (${clausulaPeriodos})
      group by m.sobre_id, to_char(m.fecha, 'YYYY-MM')
    `,
  )

  const gastosMap = new Map<string, Dinero>()
  for (const g of gastosSobres) {
    gastosMap.set(`${g.sobre_id}:${g.periodo}`, g.gasto)
  }

  const elementosDestacados: ElementoDestacado[] = []
  const sobresPorGrupo = new Map<number, SobreComparativo[]>()

  for (const s of filasSobres) {
    const importesPorPeriodo: Record<string, Dinero> = {}
    for (const p of listaPeriodos) {
      importesPorPeriodo[p] = gastosMap.get(`${s.id}:${p}`) ?? '0.00'
    }

    const variaciones: Record<string, Variacion> = {}
    let tieneVariacionDestacada = false
    const refGasto = importesPorPeriodo[periodo_referencia] ?? '0.00'

    for (const p of listaPeriodos) {
      if (p === periodo_referencia) continue
      const gastoP = importesPorPeriodo[p] ?? '0.00'
      const v = calcularVariacionComparativo(p, gastoP, refGasto, umbral)
      variaciones[p] = v
      if (v.destacada) {
        tieneVariacionDestacada = true
        elementosDestacados.push({
          tipo: 'sobre',
          id: s.id,
          nombre: s.nombre,
          periodo: p,
          diferencia: v.diferencia,
          diferencia_absoluta: v.diferencia_absoluta,
          direccion: v.direccion,
          porcentaje: v.porcentaje,
        })
      }
    }

    const sobreComp: SobreComparativo = {
      id: s.id,
      grupo_id: s.grupo_id,
      nombre: s.nombre,
      archivado: s.archivado,
      orden: s.orden,
      importes_por_periodo: importesPorPeriodo,
      variaciones,
      tiene_variacion_destacada: tieneVariacionDestacada,
    }

    const lista = sobresPorGrupo.get(s.grupo_id) ?? []
    lista.push(sobreComp)
    sobresPorGrupo.set(s.grupo_id, lista)
  }

  const gruposComparativos: GrupoComparativo[] = []
  const totalGeneralPorPeriodo: Record<string, Dinero> = {}
  for (const p of listaPeriodos) {
    totalGeneralPorPeriodo[p] = '0.00'
  }

  for (const g of filasGrupos) {
    const sobresDelGrupo = sobresPorGrupo.get(g.id) ?? []
    const totalesPorPeriodo: Record<string, Dinero> = {}

    for (const p of listaPeriodos) {
      const sumaCent = sobresDelGrupo.reduce((acc, s) => {
        return acc + aCentimos(s.importes_por_periodo[p] ?? '0.00')
      }, 0n)
      totalesPorPeriodo[p] = deCentimos(sumaCent)

      const prevTotalGen = aCentimos(totalGeneralPorPeriodo[p] ?? '0.00')
      totalGeneralPorPeriodo[p] = deCentimos(prevTotalGen + sumaCent)
    }

    const variacionesGrupo: Record<string, Variacion> = {}
    let tieneVariacionDestacada = false
    const refTotal = totalesPorPeriodo[periodo_referencia] ?? '0.00'

    for (const p of listaPeriodos) {
      if (p === periodo_referencia) continue
      const totalP = totalesPorPeriodo[p] ?? '0.00'
      const v = calcularVariacionComparativo(p, totalP, refTotal, umbral)
      variacionesGrupo[p] = v
      if (v.destacada) {
        tieneVariacionDestacada = true
        elementosDestacados.push({
          tipo: 'grupo',
          id: g.id,
          nombre: g.nombre,
          periodo: p,
          diferencia: v.diferencia,
          diferencia_absoluta: v.diferencia_absoluta,
          direccion: v.direccion,
          porcentaje: v.porcentaje,
        })
      }
    }

    gruposComparativos.push({
      id: g.id,
      nombre: g.nombre,
      orden: g.orden,
      totales_por_periodo: totalesPorPeriodo,
      variaciones: variacionesGrupo,
      sobres: sobresDelGrupo,
      tiene_variacion_destacada: tieneVariacionDestacada,
    })
  }

  const variacionesTotalGeneral: Record<string, Variacion> = {}
  const refTotalGeneral = totalGeneralPorPeriodo[periodo_referencia] ?? '0.00'
  for (const p of listaPeriodos) {
    if (p === periodo_referencia) continue
    const totP = totalGeneralPorPeriodo[p] ?? '0.00'
    variacionesTotalGeneral[p] = calcularVariacionComparativo(p, totP, refTotalGeneral, umbral)
  }

  return {
    cartera: {
      id: cartera.id,
      nombre: cartera.nombre,
      moneda: cartera.moneda,
    },
    periodos: listaPeriodos,
    periodo_referencia,
    umbral,
    grupos: gruposComparativos,
    total_general_por_periodo: totalGeneralPorPeriodo,
    variaciones_total_general: variacionesTotalGeneral,
    hay_variaciones_destacadas: elementosDestacados.length > 0,
    elementos_destacados: elementosDestacados,
  }
}
