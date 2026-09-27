import { z } from 'zod'
import { paraCampo } from '../dinero'

/**
 * Validacion de entrada de `cuentas`.
 *
 * `saldo_inicial` se valida como TEXTO con una forma de importe, nunca como numero.
 * Aceptarlo como `z.coerce.number()` seria exactamente el error que la regla del
 * dinero prohibe: el numero ya entro convertido antes de que la validacion lo viera,
 * y un `numeric(16,2)` con 16 digitos no sobrevive a un `number` de 64 bits.
 */

export const NOMBRE_CUENTA_MAXIMO = 60
export const MAXIMO_IMPORTE = '99999999999999.99'

const TIPOS = ['corriente', 'ahorro', 'efectivo', 'credito'] as const

/**
 * Un importe escrito por una persona: opcionalmente con signo, un digito entero, y
 * hasta dos decimales. Acepta `1000`, `1000.5` y `1000.50`, y rechaza `1.234` —que
 * en parte del mundo es un importe valido— porque el separador de miles se reporta
 * como punto y traeria dos puntos en el mismo numero.
 */
const IMPORTE = /^-?\d+(\.\d{1,2})?$/

/**
 * El tope de `numeric(16,2)`, en unidades de centimos: 14 digitos enteros y 2
 * decimales son 16 digitos, y el 16 vale 99. La comparacion va en `BigInt` y no en
 * `number` porque comparar el string con un numero seria justamente la conversion
 * que este proyecto prohibe.
 */
const TOPE_EN_CENTIMOS = 9999999999999999n

function enCentimos(valor: string): bigint {
  const [entero = '0', decimales = ''] = valor.replace('-', '').split('.') as [string, string?]
  return BigInt(entero) * 100n + BigInt((decimales ?? '').padEnd(2, '0').slice(0, 2))
}

const MENSAJE_IMPORTE = 'El saldo inicial es un importe, por ejemplo 1500 o 1500.50.'

/**
 * Importe con su rango, en un solo chequeo.
 *
 * Van juntos en un `superRefine` y no en un `.regex(...).refine(...)` porque en Zod 4
 * un `refine` se corre aunque el `regex` de al lado falle: los `check` no cortan la
 * cadena. Con el texto `abc` el `refine` terminaria en `BigInt('abc')` y lanzaria una
 * `SyntaxError` en vez de devolver un error de validacion, que es lo que el formulario
 * sabe pintar.
 */
const saldoInicial = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (!IMPORTE.test(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_IMPORTE })
      return
    }
    if (enCentimos(valor) > TOPE_EN_CENTIMOS) {
      ctx.addIssue({
        code: 'custom',
        message: `El saldo inicial no puede pasar de ${MAXIMO_IMPORTE}.`,
      })
    }
  })

export const esquemaCuenta = z.object({
  nombre: z
    .string()
    .transform((valor) => valor.trim())
    .pipe(
      z
        .string()
        .min(1, 'El nombre de la cuenta no puede estar vacio.')
        .max(
          NOMBRE_CUENTA_MAXIMO,
          `El nombre de la cuenta no puede pasar de ${NOMBRE_CUENTA_MAXIMO} caracteres.`,
        ),
    ),
  tipo: z.enum(TIPOS),
  saldo_inicial: saldoInicial,
})

export const esquemaRenombre = z.object({
  nombre: z
    .string()
    .transform((valor) => valor.trim())
    .pipe(z.string().min(1, 'El nombre de la cuenta no puede estar vacio.').max(NOMBRE_CUENTA_MAXIMO)),
})

export class ErroresDeCuenta extends Error {
  readonly campos: Record<string, string>

  constructor(campos: Record<string, string>) {
    super('Los datos enviados no son validos.')
    this.name = 'ErroresDeCuenta'
    this.campos = campos
  }
}

/**
 * Un mensaje por campo, tomando el primero.
 *
 * Se recorre `issues` y no `fieldErrors` porque en Zod 4 `fieldErrors` viene tipado
 * como `{}` y obliga a un cast que esconderia la forma real.
 */
function aCampos(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? 'formulario')
    if (!campos[campo]) campos[campo] = problema.message
  }
  return campos
}

export function validarCuenta(datos: unknown): {
  nombre: string
  tipo: (typeof TIPOS)[number]
  saldo_inicial: string
} {
  const resultado = esquemaCuenta.safeParse(datos)
  if (resultado.success) return resultado.data
  throw new ErroresDeCuenta(aCampos(resultado.error))
}

/**
 * Solo el saldo inicial, para la pantalla de ajuste.
 *
 * Va aparte de `validarCuenta` porque alli el nombre y el tipo no se estan cambiando:
 * mandarlos como valores de relleno para alcanzar el mismo esquema seria hacer que
 * la validacion del nombre y del tipo parecieran exigirse cuando no se tocan.
 */
export function validarSaldoInicial(datos: unknown): { saldo_inicial: string } {
  const resultado = z.object({ saldo_inicial: saldoInicial }).safeParse(datos)
  if (resultado.success) return resultado.data
  throw new ErroresDeCuenta(aCampos(resultado.error))
}

export function validarRenombre(datos: unknown): { nombre: string } {
  const resultado = esquemaRenombre.safeParse(datos)
  if (resultado.success) return resultado.data
  throw new ErroresDeCuenta(aCampos(resultado.error))
}

/** El saldo inicial que ve el usuario en el campo: vacio, no "0.00". */
export function saldoEnCampo(saldo: string): string {
  return paraCampo(saldo)
}

export { TIPOS as TIPOS_DE_CUENTA }
