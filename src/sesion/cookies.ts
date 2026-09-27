/**
 * Las dos cookies de sesion, y por que estan separadas.
 *
 * `sesion` es `httpOnly`: si un XSS logra ejecutar script en la pagina, no puede
 * leer el identificador. Ese es el requisito de `La sesion esta endurecida`.
 *
 * `token_proteccion` NO puede ser `httpOnly`, y esa es la tension del diseno: es
 * un doble submit, asi que el navegador tiene que poder leerlo y devolverlo. Por
 * eso viaja en su propia cookie en vez de compartir la de sesion —compartirla
 * obligaria a volver legible la que protege el identificador— y por eso
 * `sesiones.token_proteccion` guarda su hash: que sea legible en el cliente no
 * significa que sea utilizable desde otro sitio.
 *
 * El token tambien se acepta en el header `x-token-proteccion`, que es lo que
 * usaran los clientes que no dependan de cookies.
 */

/** Cookie del identificador de sesion. Inaccesible desde el script de la pagina. */
export const COOKIE_SESION = 'sesion'

/** Cookie del token de proteccion. Legible a proposito, con su propio nombre. */
export const COOKIE_TOKEN_PROTECCION = 'token_proteccion'

/** Header alternativo al token de proteccion, para clientes sin cookies. */
export const HEADER_TOKEN_PROTECCION = 'x-token-proteccion'

/** 30 dias. La sesion se invalida cerrandola, no porvenochez. */
export const DIAS_VALIDEZ = 30

export const SEGUNDOS_VALIDEZ = DIAS_VALIDEZ * 24 * 60 * 60

/**
 * Atributos de la cookie de sesion.
 *
 * `sameSite: 'lax'` no `strict`: con `strict`, un enlace desde el correo o desde
 * otro sitio llega sin la cookie y el usuario aparece deslogueado en cada
 * clic de vuelta. `lax` bloquea el envio en peticiones de terceros, que es de
 * donde viene el CSRF, y deja pasar la navegacion de nivel superior.
 */
export const ATRIBUTOS_SESION = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
} as const

/**
 * Atributos de la cookie de proteccion.
 *
 * `httpOnly: false` es deliberado, no un descuido. Va en una cookie propia para
 * que la de sesion pueda seguir siendo `httpOnly`.
 */
export const ATRIBUTOS_TOKEN_PROTECCION = {
  httpOnly: false,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
} as const

/** La fecha de expiracion de la cookie de sesion, en segundos. */
export function maximaEdadSesion(): number {
  return SEGUNDOS_VALIDEZ
}
