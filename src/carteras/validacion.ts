import { z } from 'zod'
import { esCodigoMoneda } from './monedas'

/**
 * Validacion de entrada de `carteras`.
 *
 * `ErroresDeCartera` repite el patron de `autenticacion` a proposito, en vez de
 * exportar el de alla. Una clase de error de diez lineas compartida entre dos
 * capacidades vale menos que el acoplamiento: si `carteras` importara el modulo de
 * `sesion`, cualquier cambio en autenticacion la tocaria.
 */

function texto(valor: string): string {
  return valor.trim()
}

export const NOMBRE_CARTERA_MAXIMO = 60

/** El mismo limite que la columna `carteras.nombre`. */
const nombre = z
  .string()
  .transform(texto)
  .pipe(
    z
      .string()
      .min(1, 'El nombre de la cartera no puede estar vacio.')
      .max(
        NOMBRE_CARTERA_MAXIMO,
        `El nombre de la cartera no puede pasar de ${NOMBRE_CARTERA_MAXIMO} caracteres.`,
      ),
  )

/** Se pasa a mayusculas antes de validar: escribir `mxn` no es un error de la moneda. */
const moneda = z
  .string()
  .transform((valor) => texto(valor).toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'La moneda necesita un codigo de 3 letras, como MXN o USD.'))

/** Alta de cartera: nombre y moneda. La moneda se elige una vez y nunca se cambia. */
export const esquemaCartera = z.object({ nombre, moneda })

/** Renombrar no toca la moneda, y el esquema no la acepta: no hay por que mandarla. */
export const esquemaRenombre = z.object({ nombre })

/** El mismo error por campo que en `autenticacion`, con su propia clase. */
/**
 * Un mensaje por campo, tomando el primero.
 *
 * Se recorre `issues` y no `fieldErrors` porque en Zod 4 `fieldErrors` viene
 * tipado como `{}` y obliga a un cast que esconderia la forma real. Ademas `issues`
 * conserva el orden en que Zod encontro los problemas, que es el orden que el
 * usuario ve.
 */
function aCampos(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? 'formulario')
    if (!campos[campo]) campos[campo] = problema.message
  }
  return campos
}

export class ErroresDeCartera extends Error {
  readonly campos: Record<string, string>

  constructor(campos: Record<string, string>) {
    super('Los datos enviados no son validos.')
    this.name = 'ErroresDeCartera'
    this.campos = campos
  }
}

/** Devuelve el primer mensaje de cada campo, no la lista: la vista tiene un lugar por campo. */
export function validarCartera(datos: unknown): { nombre: string; moneda: string } {
  const resultado = esquemaCartera.safeParse(datos)
  if (resultado.success) return resultado.data

  throw new ErroresDeCartera(aCampos(resultado.error))
}

export function validarRenombre(datos: unknown): { nombre: string } {
  const resultado = esquemaRenombre.safeParse(datos)
  if (resultado.success) return resultado.data

  throw new ErroresDeCartera(aCampos(resultado.error))
}

export { esCodigoMoneda }
