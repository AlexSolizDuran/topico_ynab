import { cookies } from 'next/headers'
import { ATRIBUTOS_TOKEN_PROTECCION, COOKIE_TOKEN_PROTECCION } from './cookies'
import { generarToken } from './tokens'

/**
 * Emite el token de proteccion de las pantallas sin sesion.
 *
 * El registro y el inicio de sesion son la paradoja del doble submit: son las
 * operaciones que CREAN la sesion, asi que no hay hash guardado con el que
 * comparar el token. Lo que se puede exigir es que el navegador tenga uno, y un
 * navegador solo lo tiene si esta app se lo emitio: un formulario desde otro
 * sitio llega sin el.
 *
 * Se emite una vez por visita. Si ya hay cookie, se respeta: rotar el token en
 * cada render haria que un formulario abierto en otra pestana dejara de servir.
 */
export async function emitirTokenDeFormulario(): Promise<void> {
  const almacen = await cookies()

  if (almacen.get(COOKIE_TOKEN_PROTECCION)?.value) return

  almacen.set(COOKIE_TOKEN_PROTECCION, generarToken(), {
    ...ATRIBUTOS_TOKEN_PROTECCION,
    maxAge: 60 * 60,
  })
}
