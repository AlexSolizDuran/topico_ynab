import 'server-only'

import { buscarSesionVigente } from '../repos/sesiones'
import { obtenerCliente } from '../db/cliente'
import { hashearToken, tokensIguales } from './tokens'
import { TokenRequerido, tokenDeProteccion, tokenDeSesion } from './server'

/**
 * Doble submit: la proteccion de las operaciones que cambian estado.
 *
 * El token de proteccion viaja en una cookie propia, sin `httpOnly`, y el
 * navegador lo devuelve automaticamente en cada peticion. El servidor lo hashea y
 * lo compara con el hash guardado en la sesion. Que el token sea legible desde el
 * cliente no significa que sirva: solo vale dentro de la sesion que lo emitio, y
 * al cerrar sesion la fila desaparece y el token se queda sin con que compararse.
 *
 * Que no baste con la cookie de sesion es lo que evita que un formulario de otro
 * sitio pueda usar la sesion de quien esta usando la app: sin el token, la
 * peticion no trae nada que la vincule a esta sesion.
 */

/**
 * Compara el token presentado contra el hash guardado en la sesion.
 *
 * Aislada del sistema de archivos y de `next/headers` a proposito: es la parte
 * que decide, y se prueba sola. `false` cuando no hay sesion, porque sin fila no
 * hay hash contra el cual comparar, y por lo tanto ningun token puede valer.
 */
export function tokenCoincide(sesion: { token_proteccion: string } | undefined, token: string): boolean {
  if (!sesion) return false
  return tokensIguales(sesion.token_proteccion, hashearToken(token))
}

/**
 * Exige un token de proteccion valido para la sesion actual.
 *
 * Se aplica al registro, al inicio de sesion, al cierre de sesion y al cambio de
 * contrasena: son las operaciones con las que cambia el estado de la cuenta.
 */
export async function exigirTokenProteccion(): Promise<void> {
  const [tokenSesion, tokenPresentado] = await Promise.all([tokenDeSesion(), tokenDeProteccion()])

  if (!tokenPresentado) throw new TokenRequerido()

  const sesion = tokenSesion
    ? await buscarSesionVigente(obtenerCliente(), tokenSesion)
    : undefined

  if (!tokenCoincide(sesion, tokenPresentado)) throw new TokenRequerido()
}

/**
 * Exige un token de proteccion cuando todavia no hay sesion.
 *
 * El registro y el inicio de sesion son la paradoja del doble submit: son las
 * operaciones que CREAN la sesion, asi que no hay hash guardado con el que
 * comparar. Lo que se exige es que el token este presente y tenga la forma
 * correcta, lo que ya filtra el envio desde otros sitios: un atacante externo no
 * tiene con que obtener una cookie emitida por esta app.
 *
 * El resto del tiempo, `exigirTokenProteccion` es la que manda.
 */
export async function exigirTokenDeFormulario(): Promise<void> {
  const token = await tokenDeProteccion()

  if (!token || token.length < 32) throw new TokenRequerido()
}
