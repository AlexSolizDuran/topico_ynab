import { z } from 'zod'
import { paraCampo } from '../dinero'

/**
 * Validacion de entrada de `sobres` y de sus asignaciones.
 *
 * Sigue la de `cuentas`: los importes se validan como **texto** con la forma de un
 * importe, nunca como numero. Aceptarlos con `z.coerce.number()` seria el error que la
 * regla del dinero prohibe, porque la conversion ocurre antes de que la validacion vea
 * el valor.
 *
 * Lo que se agrega aca es el `periodo`, que es la parte con mas chances de colarse mal:
 * se compara con `a.periodo <= ${periodo}` contra una columna de texto, asi que un
 * `"2026-1"` no seria "el mes equivocado" sino un texto distinto que ordena distinto. Por
 * eso el formato se exige aca, con cuatro digitos de anio y dos de mes.
 */

export const NOMBRE_SOBRE_MAXIMO = 60
export const MAXIMO_IMPORTE = '99999999999999.99'

/** `AAAA-MM`, con mes de 01 a 12. */
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Un importe escrito por una persona: signo opcional, y hasta dos decimales.
 *
 * El signo se acepta porque un sobre puede quedar en negativo, y el usuario va a
 * escribirlo para corregir una asignacion. Que el valor sea negativo es una regla del
 * dominio, no del formato: la comprueba el repositorio, que sabe de que operacion se
 * trata.
 */
const IMPORTE = /^-?\d+(\.\d{1,2})?$/

/** El tope de `numeric(16,2)` en centimos. La comparacion va en `BigInt`, nunca en `number`. */
const TOPE_EN_CENTIMOS = 9999999999999999n

function enCentimos(valor: string): bigint {
  const [entero = '0', decimales = ''] = valor.replace('-', '').split('.') as [string, string?]
  return BigInt(entero) * 100n + BigInt((decimales ?? '').padEnd(2, '0').slice(0, 2))
}

const MENSAJE_IMPORTE = 'El importe es un numero, por ejemplo 1500 o 1500.50.'
const MENSAJE_PERIODO = 'El periodo es un mes, por ejemplo 2026-01.'

/**
 * Importe con su rango, en un solo chequeo.
 *
 * Van juntos en un `superRefine` y no en un `.regex(...).refine(...)` porque en Zod 4 un
 * `refine` se corre aunque el `regex` de al lado falle: con el texto `abc` terminaria en
 * `BigInt('abc')` y lanzaria una `SyntaxError` en vez de devolver un error de validacion,
 * que es lo que el formulario sabe pintar.
 */
const importe = z
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
        message: `El importe no puede pasar de ${MAXIMO_IMPORTE}.`,
      })
    }
  })

const periodo = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (!PERIODO.test(valor)) ctx.addIssue({ code: 'custom', message: MENSAJE_PERIODO })
  })

const nombre = z
  .string()
  .transform((valor) => valor.trim())
  .pipe(
    z
      .string()
      .min(1, 'El nombre del sobre no puede estar vacio.')
      .max(
        NOMBRE_SOBRE_MAXIMO,
        `El nombre del sobre no puede pasar de ${NOMBRE_SOBRE_MAXIMO} caracteres.`,
      ),
  )

/** Un id que viene del formulario: entero positivo, nunca opcional. */
const idPositivo = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (!/^[1-9]\d*$/.test(valor)) {
      ctx.addIssue({ code: 'custom', message: 'No se pudo identificar el sobre.' })
    }
  })

/** Un id de grupo que puede venir vacio, para que lo rechace el dominio. */
const grupoOpcional = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (valor !== '' && !/^[1-9]\d*$/.test(valor)) {
      ctx.addIssue({ code: 'custom', message: 'Ese grupo no existe en esta cartera.' })
    }
  })
const orden = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    const numero = /^\d+$/.test(valor) ? BigInt(valor) : null
    if (numero === null) {
      ctx.addIssue({ code: 'custom', message: 'El orden es un numero entero.' })
    } else if (numero > 100000n) {
      ctx.addIssue({ code: 'custom', message: 'El orden es un numero razonable.' })
    }
  })

/**
 * El grupo es obligatorio, pero un valor vacio **no** se rechaza aca.
 *
 * La regla es "rechaza la creacion y solicita un grupo", y el mensaje que lo dice
 * pertenece al dominio (`SinGrupo`). Si el esquema exigiera un id, el formulario
 * responderia "No se pudo identificar el sobre", que es un error de forma y no el que el
 * usuario necesita leer. Por eso un `grupo_id` vacio pasa y lo decide el repositorio.
 */
export const esquemaNuevoSobre = z.object({ nombre, grupo_id: grupoOpcional })

/** Archivar y eliminar dependen del disponible, y el disponible depende del periodo. */
export const esquemaOperacion = z.object({ periodo })

export const esquemaRenombre = z.object({ nombre })

export const esquemaOrden = z.object({ orden })

export const esquemaCambioDeGrupo = z.object({ grupo_id: grupoOpcional })

export const esquemaAsignacion = z.object({ periodo, monto: importe })

export const esquemaCorreccion = z.object({ monto: importe })

export const esquemaTapar = z.object({ periodo, monto: importe })

export const esquemaMover = z.object({
  periodo,
  monto: importe,
  destino_id: idPositivo,
})

export class ErroresDeSobre extends Error {
  readonly campos: Record<string, string>

  constructor(campos: Record<string, string>) {
    super('Los datos enviados no son validos.')
    this.name = 'ErroresDeSobre'
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
  throw new ErroresDeSobre(aCampos(resultado.error))
}

export function validarNuevoSobre(datos: unknown): { nombre: string; grupo_id: string } {
  return validar(esquemaNuevoSobre, datos)
}

export function validarOperacion(datos: unknown): { periodo: string } {
  return validar(esquemaOperacion, datos)
}

export function validarRenombre(datos: unknown): { nombre: string } {
  return validar(esquemaRenombre, datos)
}

export function validarOrden(datos: unknown): { orden: string } {
  return validar(esquemaOrden, datos)
}

export function validarCambioDeGrupo(datos: unknown): { grupo_id: string } {
  return validar(esquemaCambioDeGrupo, datos)
}

export function validarAsignacion(datos: unknown): { periodo: string; monto: string } {
  return validar(esquemaAsignacion, datos)
}

export function validarCorreccion(datos: unknown): { monto: string } {
  return validar(esquemaCorreccion, datos)
}

export function validarTapar(datos: unknown): { periodo: string; monto: string } {
  return validar(esquemaTapar, datos)
}

export function validarMover(
  datos: unknown,
): { periodo: string; monto: string; destino_id: string } {
  return validar(esquemaMover, datos)
}

/** El importe que ve el usuario en el campo: sin el `.00` de relleno. */
export function importeEnCampo(importe: string): string {
  return paraCampo(importe)
}
