import 'server-only'

import { hash, verify } from '@node-rs/argon2'

/**
 * Parametros de Argon2id.
 *
 * En un solo modulo y en constantes nombradas, para poder subirlos sin tocar el
 * resto del codigo. Los valores por defecto de la biblioteca estan elegidos para
 * una maquina de escritorio; subirlos aqui los ajusta al entorno real.
 */
const PARAMETROS = {
  algorithm: 2, // argon2id
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * Hashea una contrasena con Argon2id.
 *
 * Nunca se registra ni se devuelve el resultado de esto junto a la contrasena.
 */
export async function hashearContrasena(contrasena: string): Promise<string> {
  return hash(contrasena, PARAMETROS)
}

/**
 * Verifica una contrasena contra un hash.
 *
 * Devuelve `false` ante cualquier hash malformado en vez de propagar el error:
 * un hash corrupto en la base significa "esta contrasena no sirve", y no una
 * excepcion que tumbe la pantalla de inicio de sesion.
 */
export async function verificarContrasena(contrasena: string, hash_contrasena: string): Promise<boolean> {
  try {
    return await verify(hash_contrasena, contrasena, PARAMETROS)
  } catch {
    return false
  }
}
