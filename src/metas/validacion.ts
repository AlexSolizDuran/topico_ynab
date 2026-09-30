import { z } from 'zod'
import { aEntero } from '../enteros'
import { esCero, paraCampo } from '../dinero'

export const MAXIMO_IMPORTE = '99999999999999.99'

/** Importe estrictamente positivo, con hasta dos decimales. */
const IMPORTE_POSITIVO = /^\d+(\.\d{1,2})?$/

/** `AAAA-MM-DD`. El dia se valida aparte para comprobar existencia en calendario. */
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

const TOPE_EN_CENTIMOS = 9999999999999999n

function enCentimos(valor: string): bigint {
  const [entero = '0', decimales = ''] = valor.split('.') as [string, string?]
  return BigInt(entero) * 100n + BigInt((decimales ?? '').padEnd(2, '0').slice(0, 2))
}

const MENSAJE_IMPORTE = 'El monto objetivo es un numero positivo, por ejemplo 1500 o 1500.50.'
const MENSAJE_IMPORTE_CERO = 'El monto objetivo debe ser mayor que cero.'
const MENSAJE_FECHA = 'La fecha limite debe ser un dia valido, por ejemplo 2026-12-01.'
const MENSAJE_SOBRE = 'Selecciona un sobre valido para la meta.'

export const montoObjetivoValido = z
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

export const fechaLimiteOpcional = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((valor) => {
    if (!valor || typeof valor !== 'string') return null
    const limpio = valor.trim()
    return limpio === '' ? null : limpio
  })
  .superRefine((valor, ctx) => {
    if (!valor) return
    const coincidencia = FECHA.exec(valor)
    if (!coincidencia) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
      return
    }

    const [, a, m, d] = coincidencia
    const anio = Number(a)
    const mes = Number(m)
    const dia = Number(d)

    if (mes < 1 || mes > 12) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
      return
    }

    const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    if (dia < 1 || dia > diasDelMes) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
    }
  })

const sobreIdValido = z
  .union([z.number(), z.string()])
  .transform((v) => aEntero(v?.toString() ?? null))
  .pipe(z.number({ message: MENSAJE_SOBRE }).positive({ message: MENSAJE_SOBRE }))

export const esquemaAltaMeta = z.object({
  sobre_id: sobreIdValido,
  monto_objetivo: montoObjetivoValido,
  fecha_limite: fechaLimiteOpcional.optional(),
})

export type DatosAltaMeta = z.infer<typeof esquemaAltaMeta>
