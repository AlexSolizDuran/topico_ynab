import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ATRIBUTOS_TOKEN_PROTECCION, COOKIE_TOKEN_PROTECCION } from '@/sesion/cookies'
import { generarToken } from '@/sesion/tokens'

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
 * cada peticion haria que un formulario abierto en otra pestana dejara de servir.
 *
 * Vive aca y no en la pagina porque `cookies().set()` solo existe en Server
 * Actions y Route Handlers: escribirla durante el render de un Server Component
 * lanza. El proxy corre antes del render, asi que la cookie viaja en el mismo
 * `Set-Cookie` que el HTML y no hay carrera entre emitirla y enviar el
 * formulario.
 */

/** Una hora. El token de un formulario sin sesion es de vida corta a proposito. */
const MAX_AGE_TOKEN = 60 * 60

export function proxy(request: NextRequest): NextResponse {
  const respuesta = NextResponse.next()

  // Las Server Actions de estas mismas rutas llegan por POST y ya traen la
  // cookie de la peticion anterior: emitirla ahi solo gastaria un token.
  if (request.method !== 'GET') return respuesta

  if (request.cookies.has(COOKIE_TOKEN_PROTECCION)) return respuesta

  respuesta.cookies.set(COOKIE_TOKEN_PROTECCION, generarToken(), {
    ...ATRIBUTOS_TOKEN_PROTECCION,
    maxAge: MAX_AGE_TOKEN,
  })

  return respuesta
}

export const config = {
  matcher: ['/entrar', '/registro'],
}