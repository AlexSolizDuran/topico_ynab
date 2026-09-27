import 'server-only'

import { cookies, headers } from 'next/headers'
import {
  ATRIBUTOS_SESION,
  ATRIBUTOS_TOKEN_PROTECCION,
  COOKIE_SESION,
  COOKIE_TOKEN_PROTECCION,
  HEADER_TOKEN_PROTECCION,
} from './cookies'
import { obtenerCliente } from '../db/cliente'
import { sesionDe } from './servicio'
import type { SesionVigente } from '../repos/sesiones'

/**
 * Lectura y escritura de cookies. Todo lo que toca `next/headers` vive aca.
 *
 * El archivo lleva `server-only`: si un componente cliente lo importara por
 * error, el build falla en vez de dejar que `cookies()` llegue al navegador. En
 * esta version de Next ya no hace falta la convencion, pero el error de build es
 * mas claro que un `undefined` en produccion.
 */

/** El token de sesion de la peticion, o `undefined` si no hay cookie. */
export async function tokenDeSesion(): Promise<string | undefined> {
  const almacen = await cookies()
  return almacen.get(COOKIE_SESION)?.value
}

/**
 * El token de proteccion de la peticion.
 *
 * Se acepta en la cookie propia —que el navegador envia solo, sin que el
 * formulario tenga que hacer nada— o en el header `x-token-proteccion`, que es lo
 * que usaran los clientes que no dependan de cookies. La cookie tiene prioridad
 * porque es el camino automatico.
 */
export async function tokenDeProteccion(): Promise<string | undefined> {
  const almacen = await cookies()
  const deCookie = almacen.get(COOKIE_TOKEN_PROTECCION)?.value
  if (deCookie) return deCookie

  const cabeceras = await headers()
  return cabeceras.get(HEADER_TOKEN_PROTECCION) ?? undefined
}

/** Escribe las dos cookies de una sesion recien iniciada o renovada. */
export async function escribirCookiesDeSesion(sesion: {
  token: string
  token_proteccion: string
  expira_en: Date
}): Promise<void> {
  const almacen = await cookies()
  const { maxAge } = segundosHasta(sesion.expira_en)

  almacen.set(COOKIE_SESION, sesion.token, { ...ATRIBUTOS_SESION, maxAge })
  almacen.set(COOKIE_TOKEN_PROTECCION, sesion.token_proteccion, {
    ...ATRIBUTOS_TOKEN_PROTECCION,
    maxAge,
  })
}

/** Borra las dos cookies. Se usa al cerrar sesion. */
export async function borrarCookiesDeSesion(): Promise<void> {
  const almacen = await cookies()

  almacen.set(COOKIE_SESION, '', { ...ATRIBUTOS_SESION, maxAge: 0 })
  almacen.set(COOKIE_TOKEN_PROTECCION, '', { ...ATRIBUTOS_TOKEN_PROTECCION, maxAge: 0 })
}

function segundosHasta(fecha: Date): { maxAge: number } {
  const segundos = Math.floor((fecha.getTime() - Date.now()) / 1000)
  return { maxAge: segundos > 0 ? segundos : 0 }
}

/**
 * La sesion vigente de la peticion, o `undefined`.
 *
 * No lanza: casi todas las paginas de la aplicacion necesitan poder preguntar
 * "hay alguien aqui" sin partido. Quien necesite exigir sesion usa
 * `exigirSesion`.
 */
export async function sesionActual(): Promise<SesionVigente | undefined> {
  const token = await tokenDeSesion()
  if (!token) return undefined
  return sesionDe(obtenerCliente(), token)
}

/** Error para las operaciones que necesitan sesion y no la tienen. */
export class SesionRequerida extends Error {
  constructor() {
    super('Necesitas iniciar sesion.')
    this.name = 'SesionRequerida'
  }
}

/** Error para una peticion sin token de proteccion valido. */
export class TokenRequerido extends Error {
  constructor() {
    super('Se requiere una sesion valida para esta operacion.')
    this.name = 'TokenRequerido'
  }
}

/** La sesion vigente, o error. Para las operaciones que no pueden seguir sin ella. */
export async function exigirSesion(): Promise<SesionVigente> {
  const sesion = await sesionActual()
  if (!sesion) throw new SesionRequerida()
  return sesion
}
