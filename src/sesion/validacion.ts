import { z } from 'zod'

/**
 * Validacion de entrada de `autenticacion`.
 *
 * El minimo de contrasena es **6**, no 8. No es una preferencia: el spec dice 6, y
 * subirlo a 8 rompe un requisito explicito. El mismo valor se usa en el registro
 * y en el cambio de contrasena, y esta constante es el unico lugar donde vive.
 */
export const MINIMO_CONTRASENA = 6

/** Sin espacios al inicio ni al final: se normalizan antes de validar. */
function texto(valor: string): string {
  return valor.trim()
}

const nombreDeUsuario = z
  .string()
  .transform(texto)
  .pipe(
    z
      .string()
      .min(3, 'El nombre de usuario necesita al menos 3 caracteres.')
      .max(50, 'El nombre de usuario no puede pasar de 50 caracteres.')
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        'El nombre de usuario solo admite letras, numeros, punto, guion y guion bajo.',
      ),
  )

const correo = z
  .string()
  .transform(texto)
  .pipe(z.email('El correo no tiene un formato valido.').max(120, 'El correo es demasiado largo.'))

const contrasena = z
  .string()
  .min(MINIMO_CONTRASENA, `La contrasena necesita al menos ${MINIMO_CONTRASENA} caracteres.`)

export const esquemaRegistro = z.object({
  nombre: z.string().transform(texto).pipe(z.string().min(1, 'Escribe tu nombre.').max(80)),
  apellido: z.string().transform(texto).pipe(z.string().min(1, 'Escribe tu apellido.').max(80)),
  nombre_usuario: nombreDeUsuario,
  correo,
  contrasena,
})

export const esquemaInicioSesion = z.object({
  nombre_usuario: z.string().transform(texto).pipe(z.string().min(1, 'Escribe tu nombre de usuario.')),
  contrasena: z.string().pipe(z.string().min(1, 'Escribe tu contrasena.')),
})

export const esquemaCambioContrasena = z.object({
  contrasena_actual: z.string().pipe(z.string().min(1, 'Escribe tu contrasena actual.')),
  contrasena_nueva: contrasena,
  confirmacion: z.string().pipe(z.string().min(1, 'Repite la contrasena nueva.')),
})

export type EntradaRegistro = z.infer<typeof esquemaRegistro>
export type EntradaInicioSesion = z.infer<typeof esquemaInicioSesion>
export type EntradaCambioContrasena = z.infer<typeof esquemaCambioContrasena>

/** Un error de validacion, por campo, listo para que la vista lo señale. */
export class ErroresDeValidacion extends Error {
  readonly campos: Record<string, string>

  constructor(campos: Record<string, string>) {
    super('Los datos enviados no son validos.')
    this.name = 'ErroresDeValidacion'
    this.campos = campos
  }
}

/**
 * Valida y convierte los errores de zod en errores por campo.
 *
 * Se devuelve el primer mensaje de cada campo, no la lista: la vista tiene un
 * solo lugar donde pintar el error de un input.
 */
export function validar<T>(esquema: z.ZodType<T>, entrada: unknown): T {
  const resultado = esquema.safeParse(entrada)

  if (resultado.success) return resultado.data

  const campos: Record<string, string> = {}
  for (const problema of resultado.error.issues) {
    const campo = String(problema.path[0] ?? 'formulario')
    if (!campos[campo]) campos[campo] = problema.message
  }
  throw new ErroresDeValidacion(campos)
}
