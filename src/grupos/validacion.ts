import { z } from 'zod'
import { exigirEntero } from '../enteros'

/**
 * Validacion de entrada de `grupos`.
 *
 * La parte que no es obvia es `sinPadre`. Los grupos no se anidan, y la razon fuerte
 * para que no se aniden es que la tabla no tiene columna de padre: no se puede
 * anidar ni por error. Esta regla existe para el otro caso, que es el formulario: si
 * alguien manda un `grupo_padre`, la peticion se rechaza **explicando** que no se
 * anidan, en vez de ignorar el campo en silencio.
 *
 * Ignorar en silencio es peor que rechazar: el usuario creeria que organizo su
 * agrupamiento, cuando en realidad el sistema tiro lo que mando.
 */

export const NOMBRE_GRUPO_MAXIMO = 60

const MENSAJE_ORDEN = 'El orden tiene que ser un entero igual o mayor que cero.'

const NOMBRE = z
  .string()
  .transform((valor) => valor.trim())
  .pipe(
    z
      .string()
      .min(1, 'El nombre del grupo no puede estar vacio.')
      .max(
        NOMBRE_GRUPO_MAXIMO,
        `El nombre del grupo no puede pasar de ${NOMBRE_GRUPO_MAXIMO} caracteres.`,
      ),
  )

/** Campos que aparecen cuando alguien intenta anidar. */
const CLAVES_DE_ANIDAMIENTO = ['grupo_padre', 'padre_id', 'grupo_id_padre', 'contiene']

export const esquemaGrupo = z.object({
  nombre: NOMBRE,
})

export class ErroresDeGrupo extends Error {
  readonly campos: Record<string, string>

  constructor(campos: Record<string, string>) {
    super('Los datos enviados no son validos.')
    this.name = 'ErroresDeGrupo'
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

export function validarGrupo(datos: unknown): { nombre: string } {
  rechazarAnidamiento(datos)
  const resultado = esquemaGrupo.safeParse(datos)
  if (resultado.success) return resultado.data
  throw new ErroresDeGrupo(aCampos(resultado.error))
}

/**
 * El orden se convierte con el helper de enteros, no con `z.coerce.number()`.
 *
 * Un orden es un entero, no un importe, asi que en teoria podria pasar por un
 * `coerce`. No pasa: `z.coerce` convierte antes de validar, y aceptaria `" 3 "` y
 * `"3abc"` igual que `Number`. Se reusa la unica conversion de `src/` que ya valida
 * la forma antes de convertir, y el error sale con el nombre del campo.
 */
export function validarOrden(datos: unknown): { orden: number } {
  const recibido = (datos ?? {}) as Record<string, unknown>
  let orden: number
  try {
    orden = exigirEntero(String(recibido.orden ?? ''), 'orden')
  } catch {
    throw new ErroresDeGrupo({ orden: MENSAJE_ORDEN })
  }
  // `exigirEntero` acepta negativos porque un entero negativo es un entero. El orden de
  // un grupo no: un `-1` terminaria primero en la lista, y con un `order by asc`.
  if (orden < 0) throw new ErroresDeGrupo({ orden: MENSAJE_ORDEN })
  return { orden }
}

/**
 * Rechaza el anidamiento antes de validar el resto.
 *
 * Va aparte del esquema a proposito: un `z.object` de Zod descarta las claves que no
 * declara en vez de rechazarlas, y para el anidamiento hace falta un error explicito.
 */
function rechazarAnidamiento(datos: unknown): void {
  if (typeof datos !== 'object' || datos === null) return
  const recibido = datos as Record<string, unknown>
  for (const clave of CLAVES_DE_ANIDAMIENTO) {
    if (recibido[clave] === undefined) continue
    throw new ErroresDeGrupo({
      [clave]: 'Los grupos no se anidan: un grupo no puede contener a otro.',
    })
  }
}
