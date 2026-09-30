import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import type { Base, Base as BaseDeDatos } from '../db/tipos'
import { carteras } from '../db/tablas/carteras'
import { cuentas, movimientos } from '../db/tablas/cuentas'
import { reglasRecurrentes, type ReglaRecurrente } from '../db/tablas/recurrencias'
import { sobres } from '../db/tablas/sobres'
import type { DatosAltaRegla, DatosEdicionRegla } from '../recurrencias/validacion'

export class ReglaNoExiste extends Error {
  constructor() {
    super('La regla recurrente no existe.')
    this.name = 'ReglaNoExiste'
  }
}

export class CuentaYSobreDeDistintaCartera extends Error {
  constructor() {
    super('La cuenta y el sobre deben pertenecer a la misma cartera.')
    this.name = 'CuentaYSobreDeDistintaCartera'
  }
}

export class CuentaAjena extends Error {
  constructor() {
    super('La cuenta indicada no existe o pertenece a otra cartera.')
    this.name = 'CuentaAjena'
  }
}

export class CarteraAjena extends Error {
  constructor() {
    super('La cartera indicada no existe o no pertenece al usuario.')
    this.name = 'CarteraAjena'
  }
}

export class ReglaAnualSinMes extends Error {
  constructor() {
    super('Una regla anual requiere indicar el mes.')
    this.name = 'ReglaAnualSinMes'
  }
}

function diasEnMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function formatearFecha(anio: number, mes: number, dia: number): string {
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${anio}-${m}-${d}`
}

/**
 * Calcula todas las fechas de ocurrencia de una regla hasta `fecha_hasta`.
 * No genera fechas anteriores a `regla.fecha_inicio`.
 */
export function calcularFechasOcurrencia(
  regla: {
    frecuencia: 'diaria' | 'semanal' | 'mensual' | 'anual'
    dia: number
    mes?: number | null
    fecha_inicio: string
  },
  fecha_hasta: string,
): string[] {
  if (regla.fecha_inicio > fecha_hasta) {
    return []
  }

  const fechas: string[] = []
  const [startYear, startMonth, startDay] = regla.fecha_inicio.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const [endYear, endMonth, endDay] = fecha_hasta.split('-').map(Number) as [
    number,
    number,
    number,
  ]

  const inicioUtc = Date.UTC(startYear, startMonth - 1, startDay)
  const finUtc = Date.UTC(endYear, endMonth - 1, endDay)

  if (regla.frecuencia === 'diaria') {
    let curr = inicioUtc
    while (curr <= finUtc) {
      const d = new Date(curr)
      fechas.push(formatearFecha(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()))
      curr += 86400000
    }
    return fechas
  }

  if (regla.frecuencia === 'semanal') {
    let curr = inicioUtc
    while (curr <= finUtc) {
      const d = new Date(curr)
      fechas.push(formatearFecha(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()))
      curr += 7 * 86400000
    }
    return fechas
  }

  if (regla.frecuencia === 'mensual') {
    let anio = startYear
    let mes = startMonth

    while (anio < endYear || (anio === endYear && mes <= endMonth)) {
      const maxDia = diasEnMes(anio, mes)
      const diaEfectivo = Math.min(regla.dia, maxDia)
      const fechaStr = formatearFecha(anio, mes, diaEfectivo)

      if (fechaStr >= regla.fecha_inicio && fechaStr <= fecha_hasta) {
        fechas.push(fechaStr)
      }

      mes++
      if (mes > 12) {
        mes = 1
        anio++
      }
    }
    return fechas
  }

  if (regla.frecuencia === 'anual') {
    if (!regla.mes) {
      throw new ReglaAnualSinMes()
    }
    const mes = regla.mes
    for (let anio = startYear; anio <= endYear; anio++) {
      const maxDia = diasEnMes(anio, mes)
      const diaEfectivo = Math.min(regla.dia, maxDia)
      const fechaStr = formatearFecha(anio, mes, diaEfectivo)

      if (fechaStr >= regla.fecha_inicio && fechaStr <= fecha_hasta) {
        fechas.push(fechaStr)
      }
    }
    return fechas
  }

  return fechas
}

/**
 * Valida la pertenencia de cuenta y sobre a la misma cartera del usuario.
 */
async function validarCarteraCuentaYSobre(
  db: Base,
  usuario_id: number,
  cuenta_id: number,
  sobre_id: number | null,
): Promise<{ cartera_id: number }> {
  const [cuenta] = await db
    .select({
      id: cuentas.id,
      cartera_id: cuentas.cartera_id,
    })
    .from(cuentas)
    .innerJoin(carteras, eq(cuentas.cartera_id, carteras.id))
    .where(
      and(
        eq(cuentas.id, cuenta_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(cuentas.eliminado_en),
      ),
    )

  if (!cuenta) {
    throw new CuentaAjena()
  }

  if (sobre_id !== null) {
    const [sobre] = await db
      .select({
        id: sobres.id,
        cartera_id: sobres.cartera_id,
      })
      .from(sobres)
      .where(
        and(
          eq(sobres.id, sobre_id),
          eq(sobres.cartera_id, cuenta.cartera_id),
          isNull(sobres.eliminado_en),
        ),
      )

    if (!sobre) {
      throw new CuentaYSobreDeDistintaCartera()
    }
  }

  return { cartera_id: cuenta.cartera_id }
}

export async function crearReglaRecurrente(
  db: BaseDeDatos,
  usuario_id: number,
  datos: DatosAltaRegla,
): Promise<ReglaRecurrente> {
  if (datos.frecuencia === 'anual' && !datos.mes) {
    throw new ReglaAnualSinMes()
  }

  const { cartera_id } = await validarCarteraCuentaYSobre(
    db,
    usuario_id,
    datos.cuenta_id,
    datos.sobre_id ?? null,
  )

  const [creada] = await db
    .insert(reglasRecurrentes)
    .values({
      cartera_id,
      cuenta_id: datos.cuenta_id,
      sobre_id: datos.sobre_id ?? null,
      descripcion: datos.descripcion,
      monto: datos.monto,
      tipo: datos.tipo,
      frecuencia: datos.frecuencia,
      dia: datos.dia,
      mes: datos.frecuencia === 'anual' ? datos.mes : null,
      fecha_inicio: datos.fecha_inicio,
      activa: true,
      comercio: datos.comercio,
    })
    .returning()

  if (!creada) {
    throw new Error('No se pudo crear la regla recurrente.')
  }

  return creada
}

export async function listarReglasRecurrentes(
  db: BaseDeDatos,
  usuario_id: number,
  cartera_id: number,
): Promise<ReglaRecurrente[]> {
  const [cartera] = await db
    .select({ id: carteras.id })
    .from(carteras)
    .where(and(eq(carteras.id, cartera_id), eq(carteras.usuario_id, usuario_id)))

  if (!cartera) {
    throw new CarteraAjena()
  }

  return db
    .select()
    .from(reglasRecurrentes)
    .where(
      and(
        eq(reglasRecurrentes.cartera_id, cartera_id),
        isNull(reglasRecurrentes.eliminado_en),
      ),
    )
    .orderBy(desc(reglasRecurrentes.creado_en))
}

export async function obtenerReglaRecurrente(
  db: BaseDeDatos,
  usuario_id: number,
  regla_id: number,
): Promise<ReglaRecurrente> {
  const [regla] = await db
    .select({
      regla: reglasRecurrentes,
    })
    .from(reglasRecurrentes)
    .innerJoin(carteras, eq(reglasRecurrentes.cartera_id, carteras.id))
    .where(
      and(
        eq(reglasRecurrentes.id, regla_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(reglasRecurrentes.eliminado_en),
      ),
    )

  if (!regla?.regla) {
    throw new ReglaNoExiste()
  }

  return regla.regla
}

export async function editarReglaRecurrente(
  db: BaseDeDatos,
  usuario_id: number,
  datos: DatosEdicionRegla,
): Promise<ReglaRecurrente> {
  const reglaExistente = await obtenerReglaRecurrente(db, usuario_id, datos.id)

  if (datos.frecuencia === 'anual' && !datos.mes) {
    throw new ReglaAnualSinMes()
  }

  await validarCarteraCuentaYSobre(
    db,
    usuario_id,
    datos.cuenta_id,
    datos.sobre_id ?? null,
  )

  const [actualizada] = await db
    .update(reglasRecurrentes)
    .set({
      cuenta_id: datos.cuenta_id,
      sobre_id: datos.sobre_id ?? null,
      descripcion: datos.descripcion,
      monto: datos.monto,
      tipo: datos.tipo,
      frecuencia: datos.frecuencia,
      dia: datos.dia,
      mes: datos.frecuencia === 'anual' ? datos.mes : null,
      fecha_inicio: datos.fecha_inicio,
      activa: datos.activa !== undefined ? datos.activa : reglaExistente.activa,
      comercio: datos.comercio,
      actualizado_en: new Date(),
    })
    .where(eq(reglasRecurrentes.id, datos.id))
    .returning()

  if (!actualizada) {
    throw new ReglaNoExiste()
  }

  return actualizada
}

export async function alternarEstadoReglaRecurrente(
  db: BaseDeDatos,
  usuario_id: number,
  regla_id: number,
  activa: boolean,
): Promise<ReglaRecurrente> {
  await obtenerReglaRecurrente(db, usuario_id, regla_id)

  const [actualizada] = await db
    .update(reglasRecurrentes)
    .set({ activa, actualizado_en: new Date() })
    .where(eq(reglasRecurrentes.id, regla_id))
    .returning()

  return actualizada!
}

export async function eliminarReglaRecurrente(
  db: BaseDeDatos,
  usuario_id: number,
  regla_id: number,
): Promise<void> {
  await obtenerReglaRecurrente(db, usuario_id, regla_id)

  await db
    .update(reglasRecurrentes)
    .set({ eliminado_en: new Date(), activa: false })
    .where(eq(reglasRecurrentes.id, regla_id))
}

export interface ResultadoMaterializacion {
  totalGenerados: number
  periodosAfectados: string[]
}

/**
 * Materializa los movimientos pendientes para todas las reglas activas de la cartera
 * hasta `fecha_hasta`.
 *
 * Sigue R2, R3 y R4:
 * - Omite duplicados si ya existe un movimiento equivalente activo.
 * - Si el movimiento previo fue eliminado logicamente, lo vuelve a generar.
 * - Soporta ausencias largas (genera varios periodos).
 * - No genera nada anterior a fecha_inicio.
 */
export async function materializarRecurrencias(
  db: BaseDeDatos,
  usuario_id: number,
  cartera_id: number,
  fecha_hasta: string,
): Promise<ResultadoMaterializacion> {
  const reglas = await db
    .select({
      regla: reglasRecurrentes,
    })
    .from(reglasRecurrentes)
    .innerJoin(carteras, eq(reglasRecurrentes.cartera_id, carteras.id))
    .where(
      and(
        eq(reglasRecurrentes.cartera_id, cartera_id),
        eq(carteras.usuario_id, usuario_id),
        eq(reglasRecurrentes.activa, true),
        isNull(reglasRecurrentes.eliminado_en),
      ),
    )

  if (reglas.length === 0) {
    return { totalGenerados: 0, periodosAfectados: [] }
  }

  let totalGenerados = 0
  const periodosSet = new Set<string>()

  for (const { regla } of reglas) {
    const fechas = calcularFechasOcurrencia(regla, fecha_hasta)
    const montoConSigno = regla.tipo === 'gasto' ? `-${regla.monto}` : regla.monto

    for (const fecha of fechas) {
      // Deteccion de duplicados: se omite si ya existe un movimiento VIVO:
      // a) Ya generado por esta misma regla para esta fecha (incluso si fue editado)
      // b) Registrado a mano con igual cuenta, fecha, monto y descripcion
      const [duplicado] = await db
        .select({ id: movimientos.id })
        .from(movimientos)
        .where(
          and(
            isNull(movimientos.eliminado_en),
            eq(movimientos.fecha, fecha),
            or(
              eq(movimientos.regla_id, regla.id),
              and(
                isNull(movimientos.regla_id),
                eq(movimientos.cuenta_id, regla.cuenta_id),
                eq(movimientos.monto, montoConSigno),
                eq(movimientos.descripcion, regla.descripcion),
              ),
            ),
          ),
        )

      if (duplicado) {
        continue
      }

      await db.insert(movimientos).values({
        cuenta_id: regla.cuenta_id,
        sobre_id: regla.sobre_id,
        tipo: regla.tipo,
        monto: montoConSigno,
        fecha,
        descripcion: regla.descripcion,
        comercio: regla.comercio,
        origen: 'recurrente',
        regla_id: regla.id,
      })

      totalGenerados++
      periodosSet.add(fecha.slice(0, 7))
    }
  }

  return {
    totalGenerados,
    periodosAfectados: Array.from(periodosSet).sort(),
  }
}
