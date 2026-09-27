import { describe, expect, it } from 'vitest'
import { hashearContrasena, verificarContrasena } from '../../src/sesion/argon'
import {
  ATRIBUTOS_SESION,
  ATRIBUTOS_TOKEN_PROTECCION,
  COOKIE_SESION,
  COOKIE_TOKEN_PROTECCION,
  HEADER_TOKEN_PROTECCION,
  SEGUNDOS_VALIDEZ,
} from '../../src/sesion/cookies'
import { generarToken, hashearToken, tokensIguales } from '../../src/sesion/tokens'

describe('Argon2id', () => {
  it('hashea la contrasena sin que el hash la contenga', async () => {
    const hash = await hashearContrasena('prueba123')

    expect(hash).not.toContain('prueba123')
    // El formato de argon2id lo dice el prefijo: $argon2id$.
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('produce un hash distinto cada vez, por la sal', async () => {
    const uno = await hashearContrasena('prueba123')
    const otro = await hashearContrasena('prueba123')

    expect(uno).not.toBe(otro)
  })

  it('verifica la contrasena correcta', async () => {
    const hash = await hashearContrasena('prueba123')

    expect(await verificarContrasena('prueba123', hash)).toBe(true)
  })

  it('no verifica una contrasena distinta', async () => {
    const hash = await hashearContrasena('prueba123')

    expect(await verificarContrasena('prueba124', hash)).toBe(false)
    expect(await verificarContrasena('', hash)).toBe(false)
  })

  it('devuelve falso ante un hash corrupto, en vez de propagar el error', async () => {
    // Un hash corrupto en la base significa "no sirve", no una pantalla de error.
    expect(await verificarContrasena('prueba123', 'no-es-un-hash')).toBe(false)
  })
})

describe('los tokens', () => {
  it('genera 32 bytes de entropia en base64url', () => {
    const token = generarToken()

    // base64url: sin +, sin /, sin =, porque viaja en una cookie.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token).not.toContain('+')
    expect(token).not.toContain('/')
    expect(token).not.toContain('=')
  })

  it('nunca genera dos tokens iguales', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generarToken()))

    expect(tokens.size).toBe(200)
  })

  it('hashea de forma determinista, que es lo que permite comparar', () => {
    expect(hashearToken('abc')).toBe(hashearToken('abc'))
    expect(hashearToken('abc')).not.toBe(hashearToken('abd'))
  })

  it('el hash no es el token, y no se puede volver al token', () => {
    const token = generarToken()
    const hash = hashearToken(token)

    expect(hash).not.toBe(token)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('compara tokens iguales y distintos sin fallar por longitud', () => {
    expect(tokensIguales(hashearToken('abc'), hashearToken('abc'))).toBe(true)
    expect(tokensIguales(hashearToken('abc'), hashearToken('abd'))).toBe(false)
    // Distintas longitudes: el comparador de tiempo constante exige buffers del mismo
    // tamano y lanzaria si no se comprobaran antes.
    expect(tokensIguales('corto', 'mucholargodemas')).toBe(false)
  })
})

describe('las cookies de sesion', () => {
  it('la cookie de sesion es inaccesible desde el script de la pagina', () => {
    expect(ATRIBUTOS_SESION.httpOnly).toBe(true)
  })

  it('el token de proteccion es legible, porque es un doble submit', () => {
    // A proposito. Por eso va en su propia cookie y no comparte con la de sesion.
    expect(ATRIBUTOS_TOKEN_PROTECCION.httpOnly).toBe(false)
  })

  it('son cookies distintas, con nombres distintos', () => {
    expect(COOKIE_SESION).not.toBe(COOKIE_TOKEN_PROTECCION)
    expect(COOKIE_SESION).toBe('sesion')
    expect(COOKIE_TOKEN_PROTECCION).toBe('token_proteccion')
  })

  it('ambas se limitan al mismo sitio y a todo el dominio', () => {
    // `lax` y no `strict`: con `strict` un clic de vuelta desde el correo
    // llegaria sin cookie y el usuario apareceria deslogueado.
    expect(ATRIBUTOS_SESION.sameSite).toBe('lax')
    expect(ATRIBUTOS_TOKEN_PROTECCION.sameSite).toBe('lax')
    expect(ATRIBUTOS_SESION.path).toBe('/')
    expect(ATRIBUTOS_TOKEN_PROTECCION.path).toBe('/')
  })

  it('la sesion dura 30 dias y se invalida cerrandola, no por vencer', () => {
    expect(SEGUNDOS_VALIDEZ).toBe(30 * 24 * 60 * 60)
  })

  it('acepta el token de proteccion tambien por header, para clientes sin cookies', () => {
    expect(HEADER_TOKEN_PROTECCION).toBe('x-token-proteccion')
  })
})
