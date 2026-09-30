import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { asignaciones, carteras, metas, sobres, type Meta } from '../db/schema'
import type { Dinero } from '../dinero'
import { disponibleDeSobre } from './fragmentos'
import type { DatosAltaMeta } from '../metas/validacion'

export class SobreNoExiste extends Error {
  constructor() {
    super('El sobre indicado no existe.')
    this.name = 'SobreNoExiste'
  }
}

export class SobreArchivado extends Error {
  constructor() {
    super('No se puede definir una meta en un sobre archivado. Desarchiva el sobre primero.')
    this.name = 'SobreArchivado'
  }
}

export class MetaNoExiste extends Error {
  constructor() {
    super('La meta indicada no existe.')
    this.name = 'MetaNoExiste'
  }
}

export class MetaActivaYaExiste extends Error {
  constructor() {
    super('El sobre ya tiene una meta activa. Completa o abandona la actual antes de crear una nueva.')
    this.name = 'MetaActivaYaExiste'
  }
}

export class MetaNoEstaActiva extends Error {
  constructor() {
    super('La meta no se encuentra activa.')
    this.name = 'MetaNoEstaActiva'
  }
}

export class MetaObjetivoNoAlcanzado extends Error {
  constructor(
    public disponible: Dinero,
    public objetivo: Dinero,
    public faltante: Dinero,
  ) {
    super(`El disponible del sobre (${disponible}) no alcanza el objetivo (${objetivo}). Faltan ${faltante}.`)
    this.name = 'MetaObjetivoNoAlcanzado'
  }
}

export type EstadoVisualMeta = 'cumplida' | 'en_camino' | 'retrasada'

export interface ProgresoMeta {
  monto_objetivo: Dinero
  disponible: Dinero
  restante: Dinero
  porcentaje: number
  fecha_limite: string | null
  periodos_restantes: number | null
  ritmo_periodo: Dinero | null
  asignado_periodo: Dinero | null
  falta_para_ritmo: Dinero | null
  estado_visual: EstadoVisualMeta
  vencida: boolean
}

export function aCentimos(valor: Dinero): bigint {
  const limpio = valor.trim()
  const negativo = limpio.startsWith('-')
  const sinSigno = negativo ? limpio.slice(1) : limpio
  const [entero = '0', decimales = ''] = sinSigno.split('.') as [string, string?]
  const cent = BigInt(entero) * 100n + BigInt((decimales ?? '').padEnd(2, '0').slice(0, 2))
  return negativo ? -cent : cent
}

export function deCentimos(centimos: bigint): Dinero {
  const negativo = centimos < 0n
  const abs = negativo ? -centimos : centimos
  const entero = abs / 100n
  const resto = abs % 100n
  const dec = resto.toString().padStart(2, '0')
  return `${negativo ? '-' : ''}${entero}.${dec}`
}

export function calcularPeriodosRestantes(periodoActual: string, fechaLimite: string): number {
  const [aAct, mAct] = periodoActual.split('-').map(Number)
  const [aLim, mLim] = fechaLimite.split('-').map(Number)
  if (!aAct || !mAct || !aLim || !mLim) return 0
  const dif = (aLim - aAct) * 12 + (mLim - mAct) + 1
  return dif > 0 ? dif : 0
}

/**
 * Calcula las métricas de avance y ritmo de una meta activa según la regla del dinero.
 *
 * Valores derivados nunca almacenados en base de datos:
 * - `restante`: objetivo - disponible (min 0)
 * - `porcentaje`: avance de 0 a 100%
 * - `ritmo_periodo`: restante / periodos_restantes (si tiene fecha limite)
 * - `estado_visual`:
 *     - 'cumplida': si disponible >= objetivo
 *     - 'retrasada': si vencio la fecha limite O si en el periodo actual el asignado < ritmo
 *     - 'en_camino': en cualquier otro caso
 */
export function calcularProgresoMeta({
  monto_objetivo,
  disponible,
  fecha_limite,
  periodoActual,
  asignadoEnPeriodo = '0.00',
  fechaHoy,
}: {
  monto_objetivo: Dinero
  disponible: Dinero
  fecha_limite: string | null
  periodoActual: string
  asignadoEnPeriodo?: Dinero
  fechaHoy?: string
}): ProgresoMeta {
  const centObjetivo = aCentimos(monto_objetivo)
  const centDisponible = aCentimos(disponible)

  const restanteCent = centDisponible >= centObjetivo ? 0n : centObjetivo - centDisponible
  const restante = deCentimos(restanteCent)

  const porcentaje =
    centObjetivo <= 0n
      ? 100
      : Number((centDisponible * 100n) / centObjetivo)

  let periodosRestantes: number | null = null
  let ritmoPeriodo: Dinero | null = null
  let faltaParaRitmo: Dinero | null = null
  let vencida = false

  const hoy = fechaHoy ?? `${periodoActual}-01`

  if (fecha_limite) {
    periodosRestantes = calcularPeriodosRestantes(periodoActual, fecha_limite)
    vencida = fecha_limite < hoy

    if (periodosRestantes > 0 && restanteCent > 0n) {
      // Ritmo en centavos: division redondeada hacia arriba para no quedar corto
      const numPeriodos = BigInt(periodosRestantes)
      const ritmoCent = (restanteCent + numPeriodos - 1n) / numPeriodos
      ritmoPeriodo = deCentimos(ritmoCent)

      const centAsignado = aCentimos(asignadoEnPeriodo)
      if (centAsignado < ritmoCent) {
        faltaParaRitmo = deCentimos(ritmoCent - centAsignado)
      } else {
        faltaParaRitmo = '0.00'
      }
    }
  }

  let estado_visual: EstadoVisualMeta = 'en_camino'
  if (centDisponible >= centObjetivo) {
    estado_visual = 'cumplida'
  } else if (vencida) {
    estado_visual = 'retrasada'
  } else if (fecha_limite && faltaParaRitmo && aCentimos(faltaParaRitmo) > 0n) {
    estado_visual = 'retrasada'
  }

  return {
    monto_objetivo,
    disponible,
    restante,
    porcentaje,
    fecha_limite,
    periodos_restantes: periodosRestantes,
    ritmo_periodo: ritmoPeriodo,
    asignado_periodo: asignadoEnPeriodo,
    falta_para_ritmo: faltaParaRitmo,
    estado_visual,
    vencida,
  }
}

async function comprobarSobreDelUsuario(
  db: Base,
  usuario_id: number,
  sobre_id: number,
) {
  const [fila] = await db
    .select({
      id: sobres.id,
      cartera_id: sobres.cartera_id,
      archivado: sobres.archivado,
    })
    .from(sobres)
    .innerJoin(carteras, eq(sobres.cartera_id, carteras.id))
    .where(
      and(
        eq(sobres.id, sobre_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(sobres.eliminado_en),
      ),
    )
    .limit(1)

  if (!fila) throw new SobreNoExiste()
  return fila
}

export async function crearMeta(
  db: Base,
  usuario_id: number,
  datos: DatosAltaMeta,
): Promise<Meta> {
  const sobre = await comprobarSobreDelUsuario(db, usuario_id, datos.sobre_id)
  if (sobre.archivado) {
    throw new SobreArchivado()
  }

  const [activaPrevia] = await db
    .select({ id: metas.id })
    .from(metas)
    .where(and(eq(metas.sobre_id, datos.sobre_id), eq(metas.estado, 'activa')))
    .limit(1)

  if (activaPrevia) {
    throw new MetaActivaYaExiste()
  }

  const [creada] = await db
    .insert(metas)
    .values({
      sobre_id: datos.sobre_id,
      monto_objetivo: datos.monto_objetivo,
      fecha_limite: datos.fecha_limite ?? null,
      estado: 'activa',
    })
    .returning()

  if (!creada) throw new Error('Error al registrar la meta.')
  return creada
}

export async function obtenerMetaActiva(
  db: Base,
  usuario_id: number,
  sobre_id: number,
): Promise<Meta | null> {
  await comprobarSobreDelUsuario(db, usuario_id, sobre_id)

  const [activa] = await db
    .select()
    .from(metas)
    .where(and(eq(metas.sobre_id, sobre_id), eq(metas.estado, 'activa')))
    .limit(1)

  return activa ?? null
}

export async function listarHistorialMetas(
  db: Base,
  usuario_id: number,
  sobre_id: number,
): Promise<Meta[]> {
  await comprobarSobreDelUsuario(db, usuario_id, sobre_id)

  return db
    .select()
    .from(metas)
    .where(eq(metas.sobre_id, sobre_id))
    .orderBy(desc(metas.creado_en))
}

export async function obtenerMetaPorId(
  db: Base,
  usuario_id: number,
  meta_id: number,
): Promise<{ meta: Meta; sobre_id: number; cartera_id: number }> {
  const [fila] = await db
    .select({
      meta: metas,
      sobre_id: sobres.id,
      cartera_id: sobres.cartera_id,
    })
    .from(metas)
    .innerJoin(sobres, eq(metas.sobre_id, sobres.id))
    .innerJoin(carteras, eq(sobres.cartera_id, carteras.id))
    .where(
      and(
        eq(metas.id, meta_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(sobres.eliminado_en),
      ),
    )
    .limit(1)

  if (!fila) throw new MetaNoExiste()
  return fila
}

export async function abandonarMeta(
  db: Base,
  usuario_id: number,
  meta_id: number,
): Promise<Meta> {
  const { meta } = await obtenerMetaPorId(db, usuario_id, meta_id)
  if (meta.estado !== 'activa') {
    throw new MetaNoEstaActiva()
  }

  const [actualizada] = await db
    .update(metas)
    .set({
      estado: 'abandonada',
      abandonada_en: new Date(),
      actualizado_en: new Date(),
    })
    .where(eq(metas.id, meta_id))
    .returning()

  if (!actualizada) throw new MetaNoExiste()
  return actualizada
}

export async function completarMeta(
  db: Base,
  usuario_id: number,
  meta_id: number,
  periodo?: string,
): Promise<Meta> {
  const { meta, sobre_id } = await obtenerMetaPorId(db, usuario_id, meta_id)
  if (meta.estado !== 'activa') {
    throw new MetaNoEstaActiva()
  }

  // Obtenemos el disponible actual del sobre
  const [fila] = await db
    .select({
      disponible: disponibleDeSobre('sobres', periodo ?? null),
    })
    .from(sobres)
    .where(eq(sobres.id, sobre_id))
    .limit(1)

  const disponible = fila?.disponible ?? '0.00'
  const centDisponible = aCentimos(disponible)
  const centObjetivo = aCentimos(meta.monto_objetivo)

  if (centDisponible < centObjetivo) {
    const faltanteCent = centObjetivo - centDisponible
    throw new MetaObjetivoNoAlcanzado(
      disponible,
      meta.monto_objetivo,
      deCentimos(faltanteCent),
    )
  }

  const [completada] = await db
    .update(metas)
    .set({
      estado: 'completada',
      completada_en: new Date(),
      actualizado_en: new Date(),
    })
    .where(eq(metas.id, meta_id))
    .returning()

  if (!completada) throw new MetaNoExiste()
  return completada
}

/**
 * Consulta la meta activa de un sobre junto con su disponible y progreso en un periodo.
 */
export async function consultarMetaYProgreso(
  db: Base,
  usuario_id: number,
  sobre_id: number,
  periodoActual: string,
  fechaHoy?: string,
): Promise<{ meta: Meta; progreso: ProgresoMeta } | null> {
  const meta = await obtenerMetaActiva(db, usuario_id, sobre_id)
  if (!meta) return null

  const [filaDisponible] = await db
    .select({
      disponible: disponibleDeSobre('sobres', periodoActual),
    })
    .from(sobres)
    .where(eq(sobres.id, sobre_id))
    .limit(1)

  const disponible = deCentimos(aCentimos(filaDisponible?.disponible ?? '0.00'))

  // Sumamos lo asignado exclusivamente en el periodo actual
  const [filaAsignado] = await db
    .select({
      totalAsignado: sql<Dinero>`coalesce(sum(${asignaciones.monto}), 0)::text`,
    })
    .from(asignaciones)
    .where(
      and(
        eq(asignaciones.sobre_id, sobre_id),
        eq(asignaciones.periodo, periodoActual),
      ),
    )
    .limit(1)

  const asignadoEnPeriodo = deCentimos(aCentimos(filaAsignado?.totalAsignado ?? '0.00'))

  const progreso = calcularProgresoMeta({
    monto_objetivo: meta.monto_objetivo,
    disponible,
    fecha_limite: meta.fecha_limite,
    periodoActual,
    asignadoEnPeriodo,
    fechaHoy,
  })

  return { meta, progreso }
}
