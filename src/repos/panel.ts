import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { carteras, cuentas, grupos, sobres } from '../db/schema'
import type { Dinero } from '../dinero'
import { absDinero, esNegativo } from '../dinero'
import { aCentimos } from '../patrimonio/calculos'
import { filas } from './filas'
import { disponibleDeSobre, saldoDeCuenta } from './fragmentos'
import { resumenDeCartera } from './dinero-suelto'
import { calcularProgresoMeta, type ProgresoMeta } from './metas'

export class CarteraNoExiste extends Error {
  constructor() {
    super('Esa cartera no existe, o no es tuya.')
    this.name = 'CarteraNoExiste'
  }
}

export interface CuentaPanel {
  id: number
  nombre: string
  tipo: 'corriente' | 'ahorro' | 'efectivo' | 'credito'
  saldo: Dinero
  archivada: boolean
}

export interface SobrePanel {
  id: number
  nombre: string
  grupo_id: number
  disponible: Dinero
  archivado: boolean
  es_negativo: boolean
  desborde?: Dinero
  meta?: ProgresoMeta
}

export interface GrupoPanel {
  id: number
  nombre: string
  orden: number
  total_disponible: Dinero
  sobres: SobrePanel[]
}

export interface DesbordeAccionPanel {
  sobre_id: number
  nombre_sobre: string
  desborde: Dinero
  disponible_negativo: Dinero
  puede_tapar: boolean
}

export interface MetaPanel {
  id: number
  sobre_id: number
  nombre_sobre: string
  monto_objetivo: Dinero
  disponible: Dinero
  restante: Dinero
  porcentaje: number
  estado_visual: 'cumplida' | 'en_camino' | 'retrasada'
  retrasada: boolean
  falta_para_ritmo: Dinero | null
}

export interface MovimientoPendientePanel {
  id: number
  fecha: string
  monto: Dinero
  descripcion: string
  cuenta_nombre: string
}

export interface DatosPanel {
  cartera: {
    id: number
    nombre: string
    moneda: string
  }
  periodo: string
  patrimonio: {
    total: Dinero
    en_sobres: Dinero
    dinero_suelto: Dinero
  }
  dinero_suelto: {
    monto: Dinero
    es_negativo: boolean
    sobreasignado: boolean
    aviso_sobreasignado?: string
  }
  cuentas: {
    activas: CuentaPanel[]
    archivadas: CuentaPanel[]
    total_activas: Dinero
  }
  grupos: GrupoPanel[]
  sobres_archivados_con_saldo: SobrePanel[]
  sobres_desbordados: SobrePanel[]
  desbordes_acciones: DesbordeAccionPanel[]
  totales_periodo: {
    gastado: Dinero
    ingresado: Dinero
  }
  pendientes_asignacion: {
    cantidad: number
    movimientos: MovimientoPendientePanel[]
  }
  metas_activas: MetaPanel[]
}

/**
 * Consulta de solo lectura que consolida todos los datos derivados del panel
 * para la cartera abierta en el periodo especificado.
 *
 * Cumple con los 13 requisitos del panel:
 * - Patrimonio derivado e invariante
 * - Saldos de cuentas con crédito en rojo y suma total de cuentas activas
 * - Sobres agrupados con pliegue, totales y prioridad a desbordes
 * - Dinero suelto y alerta si es negativo
 * - Detección y cobertura manual de desbordes
 * - Ingresos y gastos del periodo sin contar traspasos
 * - Movimientos sin asignar
 * - Progreso de metas activas destacando retrasadas
 * - Aislamiento estricto por cartera y moneda
 */
export async function consultarDatosPanel(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<DatosPanel> {
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

  // 1. Resumen patrimonial e invariante (usando la consulta de dinero-suelto)
  const resumen = await resumenDeCartera(db, usuario_id, cartera_id, periodo)

  const dineroSueltoEsNegativo = esNegativo(resumen.dinero_suelto)
  const centimosDineroSuelto = aCentimos(resumen.dinero_suelto)

  // 2. Cuentas vivas y archivadas con su saldo al corte del periodo
  const filasCuentas = await filas<{
    id: number
    nombre: string
    tipo: 'corriente' | 'ahorro' | 'efectivo' | 'credito'
    saldo: Dinero
    archivada: boolean
  }>(
    db,
    sql`
      select
        c.id,
        c.nombre,
        c.tipo,
        c.archivada,
        (${saldoDeCuenta('c', periodo)}) as saldo
      from cuentas c
      where c.cartera_id = ${cartera_id}
        and c.eliminado_en is null
      order by c.orden asc, c.nombre asc
    `,
  )

  const cuentasActivas: CuentaPanel[] = []
  const cuentasArchivadas: CuentaPanel[] = []
  let totalCuentasActivasCentimos = 0n

  for (const c of filasCuentas) {
    if (c.archivada) {
      cuentasArchivadas.push(c)
    } else {
      cuentasActivas.push(c)
      totalCuentasActivasCentimos += aCentimos(c.saldo)
    }
  }

  const [totalActivasFila] = await filas<{ total: Dinero }>(
    db,
    sql`
      select coalesce(sum(${saldoDeCuenta('c', periodo)}), 0)::numeric(16,2) as total
      from cuentas c
      where c.cartera_id = ${cartera_id}
        and c.eliminado_en is null
        and not c.archivada
    `,
  )
  const totalCuentasActivas = totalActivasFila?.total ?? '0.00'

  // 3. Grupos y sobres
  const filasGrupos = await filas<{ id: number; nombre: string; orden: number }>(
    db,
    sql`
      select id, nombre, orden
      from grupos
      where cartera_id = ${cartera_id}
        and not archivado
      order by orden asc, nombre asc
    `,
  )

  const filasSobres = await filas<{
    id: number
    nombre: string
    grupo_id: number
    disponible: Dinero
    archivado: boolean
  }>(
    db,
    sql`
      select
        s.id,
        s.nombre,
        s.grupo_id,
        (${disponibleDeSobre('s', periodo)}) as disponible,
        s.archivado
      from sobres s
      where s.cartera_id = ${cartera_id}
        and s.eliminado_en is null
      order by s.orden asc, s.nombre asc
    `,
  )

  // Metas activas
  const filasMetas = await filas<{
    id: number
    sobre_id: number
    monto_objetivo: Dinero
    fecha_limite: string | null
    asignado_mes: Dinero
  }>(
    db,
    sql`
      select
        m.id,
        m.sobre_id,
        m.monto_objetivo,
        m.fecha_limite,
        coalesce((
          select sum(a.monto) from asignaciones a
          where a.sobre_id = m.sobre_id and a.periodo = ${periodo}
        ), 0)::numeric(16,2) as asignado_mes
      from metas m
      join sobres s on s.id = m.sobre_id
      where s.cartera_id = ${cartera_id}
        and s.eliminado_en is null
        and m.estado = 'activa'
    `,
  )

  const metasMap = new Map<number, ProgresoMeta>()
  const metasPanelList: MetaPanel[] = []

  for (const meta of filasMetas) {
    const sobreFila = filasSobres.find((s) => s.id === meta.sobre_id)
    const disp = sobreFila?.disponible ?? '0.00'
    const progreso = calcularProgresoMeta({
      monto_objetivo: meta.monto_objetivo,
      disponible: disp,
      fecha_limite: meta.fecha_limite,
      periodoActual: periodo,
      asignadoEnPeriodo: meta.asignado_mes,
    })
    metasMap.set(meta.sobre_id, progreso)

    metasPanelList.push({
      id: meta.id,
      sobre_id: meta.sobre_id,
      nombre_sobre: sobreFila?.nombre ?? '',
      monto_objetivo: meta.monto_objetivo,
      disponible: disp,
      restante: progreso.restante,
      porcentaje: progreso.porcentaje,
      estado_visual: progreso.estado_visual,
      retrasada: progreso.estado_visual === 'retrasada',
      falta_para_ritmo: progreso.falta_para_ritmo,
    })
  }

  const sobresDesbordados: SobrePanel[] = []
  const desbordesAcciones: DesbordeAccionPanel[] = []
  const sobresArchivadosConSaldo: SobrePanel[] = []

  // Clasificar sobres
  for (const s of filasSobres) {
    const neg = esNegativo(s.disponible)
    const desborde = neg ? absDinero(s.disponible) : undefined
    const metaProgreso = metasMap.get(s.id)

    const sp: SobrePanel = {
      id: s.id,
      nombre: s.nombre,
      grupo_id: s.grupo_id,
      disponible: s.disponible,
      archivado: s.archivado,
      es_negativo: neg,
      desborde,
      meta: metaProgreso,
    }

    if (neg) {
      sobresDesbordados.push(sp)
      const centDesborde = aCentimos(desborde ?? '0.00')
      const puedeTapar = centimosDineroSuelto >= centDesborde && centimosDineroSuelto > 0n
      desbordesAcciones.push({
        sobre_id: s.id,
        nombre_sobre: s.nombre,
        desborde: desborde ?? '0.00',
        disponible_negativo: s.disponible,
        puede_tapar: puedeTapar,
      })
    }

    if (s.archivado && s.disponible !== '0.00') {
      sobresArchivadosConSaldo.push(sp)
    }
  }

  // Grupos con sobres (sobres activos agrupados, desbordes ordenados primero dentro de cada grupo)
  const gruposPanel: GrupoPanel[] = []
  for (const g of filasGrupos) {
    const sobresDeGrupo = filasSobres
      .filter((s) => s.grupo_id === g.id && !s.archivado)
      .map((s) => {
        const neg = esNegativo(s.disponible)
        return {
          id: s.id,
          nombre: s.nombre,
          grupo_id: s.grupo_id,
          disponible: s.disponible,
          archivado: s.archivado,
          es_negativo: neg,
          desborde: neg ? absDinero(s.disponible) : undefined,
          meta: metasMap.get(s.id),
        }
      })

    // Ordenar sobres: los negativos primero, luego los demás
    sobresDeGrupo.sort((a, b) => {
      if (a.es_negativo && !b.es_negativo) return -1
      if (!a.es_negativo && b.es_negativo) return 1
      return 0
    })

    const [totalGrupoFila] = await filas<{ total: Dinero }>(
      db,
      sql`
        select coalesce(sum(${disponibleDeSobre('s', periodo)}), 0)::numeric(16,2) as total
        from sobres s
        where s.grupo_id = ${g.id}
          and s.eliminado_en is null
      `,
    )

    gruposPanel.push({
      id: g.id,
      nombre: g.nombre,
      orden: g.orden,
      total_disponible: totalGrupoFila?.total ?? '0.00',
      sobres: sobresDeGrupo,
    })
  }

  // 4. Totales de ingresos y gastos del periodo (excluyendo traspasos)
  const [totalesFila] = await filas<{ gastado: Dinero; ingresado: Dinero }>(
    db,
    sql`
      select
        coalesce(sum(case when m.tipo = 'gasto' then -m.monto else 0 end), 0)::numeric(16,2) as gastado,
        coalesce(sum(case when m.tipo = 'ingreso' then m.monto else 0 end), 0)::numeric(16,2) as ingresado
      from movimientos m
      join cuentas c on c.id = m.cuenta_id
      where c.cartera_id = ${cartera_id}
        and c.eliminado_en is null
        and m.eliminado_en is null
        and m.tipo <> 'traspaso'
        and to_char(m.fecha, 'YYYY-MM') = ${periodo}
    `,
  )

  // 5. Movimientos sin sobre asignado
  const pendientesFilas = await filas<MovimientoPendientePanel>(
    db,
    sql`
      select
        m.id,
        m.fecha,
        m.monto,
        m.descripcion,
        c.nombre as cuenta_nombre
      from movimientos m
      join cuentas c on c.id = m.cuenta_id
      where c.cartera_id = ${cartera_id}
        and c.eliminado_en is null
        and m.eliminado_en is null
        and m.sobre_id is null
        and m.tipo <> 'traspaso'
      order by m.fecha desc
    `,
  )

  return {
    cartera,
    periodo,
    patrimonio: {
      total: resumen.patrimonio,
      en_sobres: resumen.asignado,
      dinero_suelto: resumen.dinero_suelto,
    },
    dinero_suelto: {
      monto: resumen.dinero_suelto,
      es_negativo: dineroSueltoEsNegativo,
      sobreasignado: dineroSueltoEsNegativo,
      aviso_sobreasignado: dineroSueltoEsNegativo
        ? 'Asignaste más dinero del que tienes'
        : undefined,
    },
    cuentas: {
      activas: cuentasActivas,
      archivadas: cuentasArchivadas,
      total_activas: totalCuentasActivas,
    },
    grupos: gruposPanel,
    sobres_archivados_con_saldo: sobresArchivadosConSaldo,
    sobres_desbordados: sobresDesbordados,
    desbordes_acciones: desbordesAcciones,
    totales_periodo: {
      gastado: totalesFila?.gastado ?? '0.00',
      ingresado: totalesFila?.ingresado ?? '0.00',
    },
    pendientes_asignacion: {
      cantidad: pendientesFilas.length,
      movimientos: pendientesFilas,
    },
    metas_activas: metasPanelList,
  }
}
