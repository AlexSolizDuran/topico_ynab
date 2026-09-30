import { z } from 'zod'
import { aEntero } from '../enteros'
import { esCero, paraCampo } from '../dinero'

export const MAXIMO_IMPORTE = '99999999999999.99'
export const DESCRIPCION_MAXIMO = 255
export const COMERCIO_MAXIMO = 120

/** Importe estrictamente positivo, con hasta dos decimales. */
const IMPORTE_POSITIVO = /^\d+(\.\d{1,2})?$/

/** `AAAA-MM-DD`. El dia se valida aparte para comprobar existencia en calendario. */
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

const TOPE_EN_CENTIMOS = 9999999999999999n

function enCentimos(valor: string): bigint {
  const [entero = '0', decimales = ''] = valor.split('.') as [string, string?]
  return BigInt(entero) * 100n + BigInt((decimales ?? '').padEnd(2, '0').slice(0, 2))
}

const MENSAJE_IMPORTE = 'El importe es un numero positivo, por ejemplo 1500 o 1500.50.'
const MENSAJE_IMPORTE_CERO = 'El importe debe ser mayor que cero.'
const MENSAJE_FECHA = 'La fecha es un dia, por ejemplo 2026-03-31.'
const MENSAJE_DIA = 'El dia debe ser un numero entre 1 y 31.'
const MENSAJE_MES_ANUAL = 'Una regla anual requiere indicar el mes (1 a 12).'

const importePositivo = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (!IMPORTE_POSITIVO.test(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_IMPORTE })
      return
    }

    if (esCero(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_IMPORTE_CERO })
      return
    }

    if (enCentimos(valor) > TOPE_EN_CENTIMOS) {
      ctx.addIssue({
        code: 'custom',
        message: `El importe no puede superar ${MAXIMO_IMPORTE}.`,
      })
    }
  })
  .transform((valor) => paraCampo(valor))

const fechaValida = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    const coincidencia = FECHA.exec(valor)
    if (!coincidencia) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
      return
    }

    const anio = Number(coincidencia[1])
    const mes = Number(coincidencia[2])
    const dia = Number(coincidencia[3])

    if (mes < 1 || mes > 12) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
      return
    }

    const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    if (dia < 1 || dia > diasDelMes) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
    }
  })

export const tipoReglaSchema = z.enum(['gasto', 'ingreso'])
export const frecuenciaSchema = z.enum(['diaria', 'semanal', 'mensual', 'anual'])

export type TipoRegla = z.infer<typeof tipoReglaSchema>
export type FrecuenciaRecurrencia = z.infer<typeof frecuenciaSchema>

const campoId = z
  .union([z.string(), z.number()])
  .transform((val) => (typeof val === 'number' ? String(val) : val.trim()))
  .superRefine((val, ctx) => {
    if (!val) {
      ctx.addIssue({ code: 'custom', message: 'Se requiere una cuenta.' })
      return
    }
    const entero = aEntero(val)
    if (entero === null || entero <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Identificador invalido.' })
    }
  })
  .transform((val) => Number(val))

const campoSobreId = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined) return null
    const str = typeof val === 'number' ? String(val) : val.trim()
    return str === '' ? null : str
  })
  .superRefine((val, ctx) => {
    if (val === null) return
    const entero = aEntero(val)
    if (entero === null || entero <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Sobre invalido.' })
    }
  })
  .transform((val) => (val === null ? null : Number(val)))

const campoDia = z
  .union([z.string(), z.number()])
  .transform((val) => (typeof val === 'number' ? String(val) : val.trim()))
  .superRefine((val, ctx) => {
    const num = aEntero(val)
    if (num === null || num < 1 || num > 31) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_DIA })
    }
  })
  .transform((val) => Number(val))

const campoMes = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined) return null
    const str = typeof val === 'number' ? String(val) : val.trim()
    return str === '' ? null : str
  })
  .superRefine((val, ctx) => {
    if (val === null) return
    const num = aEntero(val)
    if (num === null || num < 1 || num > 12) {
      ctx.addIssue({ code: 'custom', message: 'El mes debe ser un numero entre 1 y 12.' })
    }
  })
  .transform((val) => (val === null ? null : Number(val)))

export const esquemaAltaRegla = z
  .object({
    cartera_id: campoId,
    cuenta_id: campoId,
    sobre_id: campoSobreId.optional().default(null),
    descripcion: z
      .string()
      .transform((val) => val.trim())
      .pipe(
        z
          .string()
          .min(1, 'La descripcion no puede quedar vacia.')
          .max(DESCRIPCION_MAXIMO, `La descripcion admite hasta ${DESCRIPCION_MAXIMO} caracteres.`),
      ),
    monto: importePositivo,
    tipo: tipoReglaSchema.default('gasto'),
    frecuencia: frecuenciaSchema,
    dia: campoDia,
    mes: campoMes.optional().default(null),
    fecha_inicio: fechaValida,
    comercio: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((val) => {
        if (!val) return null
        const trimmed = val.trim()
        return trimmed === '' ? null : trimmed
      })
      .pipe(
        z
          .string()
          .max(COMERCIO_MAXIMO, `El comercio admite hasta ${COMERCIO_MAXIMO} caracteres.`)
          .nullable(),
      ),
  })
  .superRefine((data, ctx) => {
    if (data.frecuencia === 'anual' && (data.mes === null || data.mes === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mes'],
        message: MENSAJE_MES_ANUAL,
      })
    }
  })

export const esquemaEdicionRegla = z
  .object({
    id: campoId,
    cuenta_id: campoId,
    sobre_id: campoSobreId.optional().default(null),
    descripcion: z
      .string()
      .transform((val) => val.trim())
      .pipe(
        z
          .string()
          .min(1, 'La descripcion no puede quedar vacia.')
          .max(DESCRIPCION_MAXIMO, `La descripcion admite hasta ${DESCRIPCION_MAXIMO} caracteres.`),
      ),
    monto: importePositivo,
    tipo: tipoReglaSchema,
    frecuencia: frecuenciaSchema,
    dia: campoDia,
    mes: campoMes.optional().default(null),
    fecha_inicio: fechaValida,
    activa: z.boolean().optional(),
    comercio: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((val) => {
        if (!val) return null
        const trimmed = val.trim()
        return trimmed === '' ? null : trimmed
      })
      .pipe(
        z
          .string()
          .max(COMERCIO_MAXIMO, `El comercio admite hasta ${COMERCIO_MAXIMO} caracteres.`)
          .nullable(),
      ),
  })
  .superRefine((data, ctx) => {
    if (data.frecuencia === 'anual' && (data.mes === null || data.mes === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mes'],
        message: MENSAJE_MES_ANUAL,
      })
    }
  })

export interface DatosAltaRegla {
  cartera_id: number
  cuenta_id: number
  sobre_id?: number | null
  descripcion: string
  monto: string
  tipo: 'gasto' | 'ingreso'
  frecuencia: 'diaria' | 'semanal' | 'mensual' | 'anual'
  dia: number
  mes?: number | null
  fecha_inicio: string
  comercio?: string | null
}

export interface DatosEdicionRegla {
  id: number
  cuenta_id: number
  sobre_id?: number | null
  descripcion: string
  monto: string
  tipo: 'gasto' | 'ingreso'
  frecuencia: 'diaria' | 'semanal' | 'mensual' | 'anual'
  dia: number
  mes?: number | null
  fecha_inicio: string
  comercio?: string | null
  activa?: boolean
}
