import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Tokens de sesion y de proteccion.
 *
 * La regla es una sola y no admite excepciones: al servidor NUNCA se guarda un
 * token en claro. Se genera en claro, se entrega al cliente una vez, y lo que se
 * persiste es su SHA-256. Por eso cada funcion viene en pareja —la que genera y
 * la que hashea— y nunca hay una forma de persistir el token en claro por
 * descuido.
 *
 * SHA-256 y no Argon2id aqui, a proposito: estos tokens no son contrasenas que el
 * usuario recuerde, son cadenas aleatorias de 32 bytes. No hay ataque de
 * diccionario contra algo que no se puede adivinar, y verificar el hash en cada
 * peticion tiene que ser barato.
 */

const BYTES = 32

/**
 * Genera un token en claro, listo para ir en cookie o header.
 *
 * 32 bytes = 256 bits de entropia. base64url porque el token viaja en una cookie,
 * y `+`, `/` y `=` no estan permitidos ahi sin citation.
 */
export function generarToken(): string {
  return randomBytes(BYTES).toString('base64url')
}

/**
 * Hashea un token para persistirlo o compararlo.
 *
 * Determinista a proposito: comparar es hashear el token recibido y buscar por el
 * resultado, en vez de recorrer sesiones y comparar uno por uno.
 */
export function hashearToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Compara dos tokens sin convertirlos en numeros ni usar `===` sobre el hash.
 *
 * `timingSafeEqual` exige buffers del mismo tamano, asi que la longitud se
 * comprueba antes. El comparador no evita un ataque de temporizacion por completo
 * —la longitud de la fila filtrada sigue siendo informacion— pero evita que dos
 * tokens que comparten prefijo se distingan por cuanto tarda la comparacion.
 */
export function tokensIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}
