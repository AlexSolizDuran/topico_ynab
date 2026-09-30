import { z } from 'zod'
import { aEntero } from '../enteros'
import { esCero, paraCampo } from '../dinero'

/**
 * Validacion de entrada de `traspasos`.
 *
 * Replica el camino de `transacciones/validacion.ts` en lo que importa: **el importe se
 * valida como texto** y nunca como numero. Un `z.coerce.number()` convertiria antes de que
 * la validacion viera el valor, que es exactamente el bug que la regla del dinero prohibe, y
 * en el alta de traspaso ese bug seria mas caro: el signo lo decide el lado, asi que perder la
 * Precision del texto no seria solo un redondeo, seria una pata con el signo cambiado.
 *
 * Las diferencias con `transacciones`, todas deliberadas:
 *
 * 1. **No hay `sobre_id`.** Un traspaso no se asigna a un sobre (R2), asi que el campo ni
 *    siquiera existe en el formulario: no reaches el esquema lo que despues se rechaza.
 * 2. **No hay `tipo`.** El tipo lo pone el repositorio; el formulario no elige si esto es un
 *    gasto, un ingreso o un traspaso, elige un traspaso y ya.
 * 3. **El destino puede ir vacio**, y vacio es una peticion valida: es el traspaso de una sola
 *    pata de R1, que ademas lleva aviso. Rechazarlo en el esquema dejaria esa operacion sin
 *    forma de escribirse.
 * 4. **Origen y destino tienen que ser distintos** (D3). Un traspaso a si mismo no empareja
 *    nada: las dos patas caerian en la misma cuenta y se anularian entre si.
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
const MENSAJE_MISMA_CUENTA =
  'Elige dos cuentas distintas: un traspaso a si mismo no mueve nada.'

/**
 * Importe con su forma, su rango y el cero, en un solo chequeo.
 *
 * Van juntos en un `superRefine` y no en un `.regex(...).refine(...)` porque en Zod 4 un
 * `refine` se corre aunque el `regex` de al lado falle: con el texto `abc` terminaria en
 * `BigInt('abc')` y lanzaria una `SyntaxError` en vez de devolver un error de validacion,
 * que es lo que el formulario sabe pintar. Es el mismo motivo que en `transacciones`.
 */
const importe = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (!IMPORTE.test(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_IMPORTE })
      return
    }
    // El cero, y solo el cero, con su propio mensaje: un traspaso de cero no empareja nada y
    // deja un grupo de dos filas que valen cero, que es historial sin movimiento.
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
 * despues se comprueba que la fecha arme no se corra de mes. Sin hora ni zona a proposito:
 * `fecha` es un `date` y guarda el dia local que el usuario escribio. Ver D8.
 */
function esFechaReal(valor: string): boolean {
  const partes = FECHA.exec(valor)
  if (!partes) return false

  const [, anio = '0000', mes = '01', dia = '01'] = partes
  // El paso va por `aEntero` y no por `Number` por la regla del dinero: aca no hay dinero, pero
  // un `Number` suelto seria una puerta trasera de la regla, y una puerta trasera se usa.
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
 * El comercio es opcional y **ausente** es una cadena vacia.
 *
 * El formulario manda `''` cuando el campo quedo en blanco, y `''` es un dato valido para
 * "no lo escribi": lo decide el repositorio, que lo guarda en `null`.
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
 * La cuenta de destino, que **puede ir vacia**.
 *
 * Vacio no es un dato faltante: es el traspaso de una sola pata de R1. La diferencia importa
 * y por eso el esquema entrega `null` y no `''`: "no hay destino" y "no se leyo el campo" no
 * pueden llegar al repositorio como lo mismo.
 */
const destino = z
  .string()
  .transform((valor) => valor.trim())
  .superRefine((valor, ctx) => {
    if (valor !== '' && !/^[1-9]\d*$/.test(valor)) {
      ctx.addIssue({ code: 'custom', message: 'Esa cuenta de destino no existe en esta cartera.' })
    }
  })

/** La base del formulario, sin la regla que cruza origen y destino. */
const campos = {
  origen_cuenta_id: idObligatorio('la cuenta de origen'),
  destino_cuenta_id: destino.default(''),
  monto: importe,
  fecha,
  descripcion,
  comercio: comercio.default(''),
}

/**
 * El alta de un traspaso.
 *
 * El origen es obligatorio y el destino no, y la asimetria es el modelo: R1 permite el
 * traspaso de una sola pata con aviso, asi que el formulario tiene que poder pedirlo.
 *
 * La regla de "las dos cuentas distintas" va en un `superRefine` y no en el objeto porque
 * necesita leer **dos** campos ya validados. Si se hiciera con un `refine` sobre el
 * resultado entero, el mensaje quedaria sin `path` y el formulario no sabria donde
 * colgarlo; atandolo a `origen_cuenta_id` el error aparece bajo la cuenta de origen, que es
 * donde el usuario tiene que corregir.
 */
export const esquemaAlta = z.object(campos).superRefine((valor, ctx) => {
  if (valor.destino_cuenta_id !== '' && valor.destino_cuenta_id === valor.origen_cuenta_id) {
    ctx.addIssue({
      code: 'custom',
      path: ['origen_cuenta_id'],
      message: MENSAJE_MISMA_CUENTA,
    })
  }
})

/**
 * Editar repite los campos del alta.
 *
 * La misma regla de cuentas distintas aplica: mover una pata a la misma cuenta donde esta la
 * otra dejaria el par en una sola cuenta, y el traspaso se anularia a si mismo.
 */
export const esquemaEdicion = z.object(campos).superRefine((valor, ctx) => {
  if (valor.destino_cuenta_id !== '' && valor.destino_cuenta_id === valor.origen_cuenta_id) {
    ctx.addIssue({
      code: 'custom',
      path: ['origen_cuenta_id'],
      message: MENSAJE_MISMA_CUENTA,
    })
  }
})

export class ErroresDeTraspaso extends Error {
  readonly campos: Record<string, string>

  constructor(campos: Record<string, string>) {
    super('Los datos enviados no son validos.')
    this.name = 'ErroresDeTraspaso'
    this.campos = campos
  }
}

/**
 * Un mensaje por campo, tomando el primero.
 *
 * Se recorre `issues` y no `fieldErrors` porque en Zod 4 `fieldErrors` viene tipado como `{}`
 * y obliga a un cast que esconderia la forma real. Mismo criterio que en `transacciones`.
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
  throw new ErroresDeTraspaso(aCampos(resultado.error))
}

export interface DatosAlta {
  origen_cuenta_id: string
  /** `''` es la pata unica de R1; el repositorio la recibe como `null`. */
  destino_cuenta_id: string
  monto: string
  fecha: string
  descripcion: string
  comercio: string
}

export function validarAlta(datos: unknown): DatosAlta {
  return validar(esquemaAlta, datos)
}

export function validarEdicion(datos: unknown): DatosAlta {
  return validar(esquemaEdicion, datos)
}

/**
 * El destino ya traducido a `number | null` para el repositorio.
 *
 * Vive aca y no en la accion para que el `'' -> null` se decida en un solo lugar: el
 * repositorio recibe `null` y nunca una cadena, y asi no hay forma de que alguien pase `''`
 * como si fuera un id.
 */
export function destinoComoId(destino: string): number | null {
  if (destino === '') return null
  return aEntero(destino) ?? null
}

/** El importe que ve el usuario en el campo: sin el `.00` de relleno. */
export function importeEnCampo(importe: string): string {
  return paraCampo(importe)
}
