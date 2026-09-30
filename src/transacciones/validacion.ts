import { z } from 'zod'
import { aEntero } from '../enteros'
import { esCero, paraCampo } from '../dinero'
import type { TipoDeMovimiento } from '../repos/movimientos'

/**
 * Validacion de entrada de `transacciones`.
 *
 * Sigue la de `sobres` y `cuentas` en lo importante: **el importe se valida como texto**
 * y nunca como numero. Un `z.coerce.number()` convertiria antes de que la validacion viera
 * el valor, que es exactamente el bug que la regla del dinero prohibe.
 *
 * Lo que cambia con respecto de `sobres` son dos reglas del dominio de un movimiento:
 *
 * 1. **El cero se rechaza** (R1). En `sobres` un cero era inocuo; aca seria un movimiento
 *    que no mueve nada y ademas existe por historial, asi que el requerimiento lo prohibe
 *    explicitamente.
 * 2. **El signo se acepta, y el repositorio decide que significa.** Que el importe sea
 *    negativo es informacion —gasto, o correccion de un ingreso—, y solo el repositorio
 *    sabe de que operacion se trata. Aca se valida la forma, no el significado. Ver D9.
 */

export const MAXIMO_IMPORTE = '99999999999999.99'
export const DESCRIPCION_MAXIMO = 255
export const COMERCIO_MAXIMO = 120

/** Un importe escrito por una persona: signo opcional, y hasta dos decimales. */
const IMPORTE = /^-?\d+(\.\d{1,2})?$/

/** `AAAA-MM-DD`. El dia se valida aparte: el regex acepta el 31 de febrero. */
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** El tope de `numeric(16,2)` en centimos. La comparacion va en `BigInt`, nunca en `number`. */
const TOPE_EN_CENTIMOS = 9999999999999999n

function enCentimos(valor: string): bigint {
  const [entero = '0', decimales = ''] = valor.replace('-', '').split('.') as [string, string?]
  return BigInt(entero) * 100n + BigInt((decimales ?? '').padEnd(2, '0').slice(0, 2))
}

const MENSAJE_IMPORTE = 'El importe es un numero, por ejemplo 1500 o 1500.50.'
const MENSAJE_IMPORTE_CERO = 'El importe debe ser distinto de cero.'
const MENSAJE_FECHA = 'La fecha es un dia, por ejemplo 2026-03-31.'

/**
 * Importe con su forma, su rango y el cero, en un solo chequeo.
 *
 * Van juntos en un `superRefine` y no en un `.regex(...).refine(...)` porque en Zod 4 un
 * `refine` se corre aunque el `regex` de al lado falle: con el texto `abc` terminaria en
 * `BigInt('abc')` y lanzaria una `SyntaxError` en vez de devolver un error de validacion,
 * que es lo que el formulario sabe pintar. Es el mismo motivo que en `sobres`.
 */
const importe = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (!IMPORTE.test(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_IMPORTE })
      return
    }
    // El cero, y solo el cero, con el mensaje de R1. `esCero` mira los digitos y no el
    // signo, asi que `"0"`, `"0.00"` y `"-0.00"` dan **el mismo** error: los tres son un
    // movimiento que no mueve nada.
    if (esCero(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_IMPORTE_CERO })
      return
    }
    if (enCentimos(valor) > TOPE_EN_CENTIMOS) {
      ctx.addIssue({
        code: 'custom',
        message: `El importe no puede pasar de ${MAXIMO_IMPORTE}.`,
      })
    }
  })

/**
 * Una fecha de calendario, con un dia que existe.
 *
 * El regex solo alcanza para la forma. `2026-02-31` lo cumple y no es un dia, asi que
 * despues se comprueba que la fecha arme no se corra de mes: `Date.UTC` normaliza el 31 de
 * febrero al 3 de marzo, y si el dia que vuelve no es el que se escribio, la fecha no
 * existia.
 *
 * Sin hora ni zona a proposito: `fecha` es un `date` y guarda el dia local que el usuario
 * escribio. Ver D8.
 */
function esFechaReal(valor: string): boolean {
  const partes = FECHA.exec(valor)
  if (!partes) return false

  const [, anio = '0000', mes = '01', dia = '01'] = partes
  // Las partes salen del regex como texto, y `Date.UTC` quiere numeros. El paso va por
  // `aEntero` y no por `Number` por la regla del dinero: aca no hay dinero, pero un `Number`
  // suelto seria una puerta trasera de la regla, y una puerta trasera se usa.
  const a = aEntero(anio)
  const m = aEntero(mes)
  const d = aEntero(dia)
  if (a === null || m === null || d === null) return false

  const armado = new Date(Date.UTC(a, m - 1, d))

  return (
    armado.getUTCFullYear() === a && armado.getUTCMonth() === m - 1 && armado.getUTCDate() === d
  )
}

const fecha = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (!esFechaReal(valor)) ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
  })

const descripcion = z
  .string()
  .transform((valor) => valor.trim())
  .pipe(
    z
      .string()
      .min(1, 'La descripcion no puede estar vacia.')
      .max(
        DESCRIPCION_MAXIMO,
        `La descripcion no puede pasar de ${DESCRIPCION_MAXIMO} caracteres.`,
      ),
  )

/**
 * Elcomercio es opcional y **ausente** es una cadena vacia.
 *
 * El formulario manda `''` cuando el campo quedo en blanco, y `''` es un dato valido para
 * "no lo escribi": lo decide el repositorio, que lo guarda en `null`. Si el esquema lo
 * rechazara, un formulario con el campo opcional en blanco no podria enviarse.
 */
const comercio = z
  .string()
  .transform((valor) => valor.trim())
  .refine((valor) => valor.length <= COMERCIO_MAXIMO, {
    message: `El comercio no puede pasar de ${COMERCIO_MAXIMO} caracteres.`,
  })

/** Un id obligatorio del formulario. El mensaje nombra la entidad que no se pudo leer. */
function idObligatorio(entidad: string) {
  return z
    .string()
    .transform((valor) => valor.trim())
    .superRefine((valor, ctx) => {
      if (!/^[1-9]\d*$/.test(valor)) {
        ctx.addIssue({ code: 'custom', message: `No se pudo identificar ${entidad}.` })
      }
    })
}

/**
 * Un id que puede venir vacio.
 *
 * Vacio **no** se rechaza aca, porque "no hay sobre" es una peticion valida: es el
 * movimiento pendiente de R2. Si el esquema exigiera un id, no habria forma de registrar
 * un gasto sin asignar.
 */
function idOpcional(entidad: string) {
  return z
    .string()
    .transform((valor) => valor.trim())
    .superRefine((valor, ctx) => {
      if (valor !== '' && !/^[1-9]\d*$/.test(valor)) {
        ctx.addIssue({ code: 'custom', message: `Ese ${entidad} no existe en esta cartera.` })
      }
    })
}

/**
 * El tipo es opcional en el alta, y si viene tiene que ser uno de los tres.
 *
 * Omitirlo no es "gasto por defecto": el repositorio lo deduce del signo. Ver D9.
 *
 * Es un `z.enum` y no un `string().refine(...)` a proposito. El `refine` tambien acepta las
 * tres etiquetas, pero su tipo de salida sigue siendo `string`, y entonces la accion tiene
 * que castear `validado.tipo` a `never` para pasarlo al repositorio: un `never` es la
 * manera de que TypeScript acepte lo que el runtime ya habia filtrado. Con el enum el
 * compilador conoce la union, el casteo desaparece, y el filtro deja de depender de que
 * el `.refine` se haya escrito bien.
 */
const TIPOS = ['gasto', 'ingreso', 'traspaso'] as const satisfies readonly TipoDeMovimiento[]

const tipo = z.enum(TIPOS, { message: 'El tipo es gasto, ingreso o traspaso.' })

/** Una fecha opcional: vacio es "sin limite", no "una fecha invalida". */
const fechaOpcional = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (valor !== '' && !esFechaReal(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_FECHA })
    }
  })

/**
 * El alta de un movimiento.
 *
 * `cuenta_id` es obligatorio porque es lo que deduce la cartera (R10, D2): sin cuenta no
 * hay cartera, y una cartera declarada por el formulario seria justo lo que el
 * requerimiento prohibe.
 */
export const esquemaAlta = z.object({
  cuenta_id: idObligatorio('la cuenta'),
  sobre_id: idOpcional('sobre').default(''),
  monto: importe,
  fecha,
  descripcion,
  comercio: comercio.default(''),
  tipo: tipo.optional(),
})

/** Editar repite los campos del alta: el mismo formulario, otra vez. */
export const esquemaEdicion = z.object({
  cuenta_id: idObligatorio('la cuenta'),
  sobre_id: idOpcional('sobre').default(''),
  monto: importe,
  fecha,
  descripcion,
  comercio: comercio.default(''),
})

/** Asignar y quitar sobre es un solo campo: el sobre elegido, o vacio para quitarlo. */
export const esquemaAsignacionSobre = z.object({
  sobre_id: idOpcional('sobre'),
})

/** El filtro de R9. Todos los campos son opcionales y combinables. */
export const esquemaFiltro = z.object({
  texto: z.string().transform((valor) => valor.trim()).default(''),
  cuenta_id: idOpcional('cuenta').default(''),
  sobre_id: idOpcional('sobre').default(''),
  tipo: tipo.optional(),
  desde: fechaOpcional.default(''),
  hasta: fechaOpcional.default(''),
})

export class ErroresDeMovimiento extends Error {
  readonly campos: Record<string, string>

  constructor(campos: Record<string, string>) {
    super('Los datos enviados no son validos.')
    this.name = 'ErroresDeMovimiento'
    this.campos = campos
  }
}

/**
 * Un mensaje por campo, tomando el primero.
 *
 * Se recorre `issues` y no `fieldErrors` porque en Zod 4 `fieldErrors` viene tipado como
 * `{}` y obliga a un cast que esconderia la forma real.
 */
function aCampos(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? 'formulario')
    if (!campos[campo]) campos[campo] = problema.message
  }
  return campos
}

function validar<T>(esquema: z.ZodType<T>, datos: unknown): T {
  const resultado = esquema.safeParse(datos)
  if (resultado.success) return resultado.data
  throw new ErroresDeMovimiento(aCampos(resultado.error))
}

export interface DatosAlta {
  cuenta_id: string
  sobre_id: string
  monto: string
  fecha: string
  descripcion: string
  comercio: string
  tipo?: TipoDeMovimiento
}

export function validarAlta(datos: unknown): DatosAlta {
  return validar(esquemaAlta, datos)
}

export function validarEdicion(datos: unknown): DatosAlta {
  return validar(esquemaEdicion, datos)
}

export function validarAsignacionSobre(datos: unknown): { sobre_id: string } {
  return validar(esquemaAsignacionSobre, datos)
}

export interface DatosFiltro {
  texto: string
  cuenta_id: string
  sobre_id: string
  tipo?: TipoDeMovimiento
  desde: string
  hasta: string
}

export function validarFiltro(datos: unknown): DatosFiltro {
  return validar(esquemaFiltro, datos)
}

/** El importe que ve el usuario en el campo: sin el `.00` de relleno. */
export function importeEnCampo(importe: string): string {
  return paraCampo(importe)
}
