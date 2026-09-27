import { describe, expect, it } from 'vitest'
import { tokenCoincide } from '../../src/sesion/proteccion'
import { generarToken, hashearToken } from '../../src/sesion/tokens'
import { buscarCartera } from '../../src/repos/carteras'
import { eliminarSesion } from '../../src/repos/sesiones'
import { crearCartera, crearSesion, crearUsuario } from '../helpers/fabricas'
import { crearBaseDePruebas } from '../helpers/pg'

describe('el token de proteccion', () => {
  it('acepta el token de la sesion que lo emitio', () => {
    const token = generarToken()
    const sesion = { token_proteccion: hashearToken(token) }

    expect(tokenCoincide(sesion, token)).toBe(true)
  })

  it('rechaza un token ausente o vacio', () => {
    const sesion = { token_proteccion: hashearToken(generarToken()) }

    expect(tokenCoincide(sesion, '')).toBe(false)
  })

  it('rechaza un token inventado', () => {
    const sesion = { token_proteccion: hashearToken('el-token-real') }

    expect(tokenCoincide(sesion, 'otro-token-cualquiera')).toBe(false)
  })

  it('rechaza un token que es el de OTRA sesion', () => {
    const tokenDeAna = generarToken()
    const tokenDeBruno = generarToken()
    const sesionDeBruno = { token_proteccion: hashearToken(tokenDeBruno) }

    // El token de Ana no sirve en la sesion de Bruno.
    expect(tokenCoincide(sesionDeBruno, tokenDeAna)).toBe(false)
  })

  it('rechaza cualquier token cuando no hay sesion', () => {
    // Sin fila no hay hash con el que comparar, y por lo tanto ningun token
    // puede ser valido. Devolver `true` con sesion indefinida seria un
    //oglyph: abriria la puerta a las operaciones de registro e inicio de sesion.
    expect(tokenCoincide(undefined, generarToken())).toBe(false)
  })
})

describe('el token no se reutiliza entre sesiones', () => {
  it('tras cerrar sesion, el token anterior ya no sirve', async () => {
    const { db, pg, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const sesion = await crearSesion(db, { usuario_id })

    const antes = await pg.query<{ token_proteccion: string }>(
      'select token_proteccion from sesiones where id = $1',
      [sesion.id],
    )
    // Con la sesion viva, el token que se entrego al cliente coincide.
    expect(tokenCoincide(antes.rows[0], sesion.token_proteccion)).toBe(true)

    await eliminarSesion(db, usuario_id, sesion.token)

    const despues = await pg.query<{ token_proteccion: string }>(
      'select token_proteccion from sesiones where id = $1',
      [sesion.id],
    )
    // La fila desaparecio, y sin fila no hay contra que comparar.
    expect(despues.rows[0]).toBeUndefined()
    expect(tokenCoincide(undefined, sesion.token_proteccion)).toBe(false)

    await cerrar()
  })
})

describe('la respuesta es indistinguible', () => {
  it('un recurso ajeno y uno inexistente dan el mismo resultado', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const ana = await crearUsuario(db, { nombre_usuario: 'ana' })
    const bruno = await crearUsuario(db, { nombre_usuario: 'bruno' })

    const cartera_de_bruno = await crearCartera(db, bruno, { nombre: 'Suya' })
    const inexistente = cartera_de_bruno + 9_999

    const ajeno = await buscarCartera(db, ana, cartera_de_bruno)
    const no_existente = await buscarCartera(db, ana, inexistente)

    // El mismo valor, no un `undefined` en un caso y un error en el otro: la
    // diferencia entre "no existe" y "es de otro" convierte la app en un
    // oraculo de que identificadores existen.
    expect(ajeno).toBeUndefined()
    expect(no_existente).toBeUndefined()
    expect(ajeno).toEqual(no_existente)

    await cerrar()
  })
})
