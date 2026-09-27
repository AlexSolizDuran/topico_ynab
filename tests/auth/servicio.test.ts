import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { usuarios } from '../../src/db/schema'
import {
  CredencialesInvalidas,
  CuentaBloqueada,
  INTENTOS_MAXIMOS,
  SEGUNDOS_BLOQUEO,
  cambiarContrasena,
  cerrarSesion,
  iniciarSesion,
  registrarUsuario,
} from '../../src/sesion/servicio'
import { ErroresDeValidacion } from '../../src/sesion/validacion'
import { buscarPorNombreUsuario } from '../../src/repos/usuarios'
import { buscarSesionVigente } from '../../src/repos/sesiones'
import { crearUsuario as usuarioDePrueba, CONTRASENA_POR_DEFECTO } from '../helpers/fabricas'
import { crearBaseDePruebas } from '../helpers/pg'

const REGISTRO_VALIDO = {
  nombre: 'Ana',
  apellido: 'Diaz',
  nombre_usuario: 'ana',
  correo: 'ana@ejemplo.test',
  contrasena: 'prueba123',
}

async function estadoDelUsuario(db: Parameters<typeof buscarPorNombreUsuario>[0], nombre_usuario: string) {
  const encontrado = await buscarPorNombreUsuario(db, nombre_usuario)
  if (!encontrado) throw new Error('el usuario no existe')
  return encontrado
}

describe('registro', () => {
  it('crea la cuenta activa y deja al usuario con sesion iniciada', async () => {
    const { db, cerrar } = await crearBaseDePruebas()

    const resultado = await registrarUsuario(db, REGISTRO_VALIDO)

    const usuario = await estadoDelUsuario(db, 'ana')
    expect(usuario.activo).toBe(true)
    // El nombre de usuario se guarda como se escribio, no normalizado.
    expect(usuario.nombre_usuario).toBe('ana')

    // Sesion iniciada: el token entregado resuelve una fila vigente.
    const sesion = await buscarSesionVigente(db, resultado.sesion.token)
    expect(sesion).toBeDefined()
    expect(sesion?.usuario_id).toBe(resultado.usuario_id)

    await cerrar()
  })

  it('crea la cartera inicial, porque un usuario sin cartera no puede hacer nada', async () => {
    const { db, cerrar } = await crearBaseDePruebas()

    const resultado = await registrarUsuario(db, REGISTRO_VALIDO)

    expect(resultado.cartera_id).toBeGreaterThan(0)
    const { pg } = await crearBaseDePruebas()
    expect(resultado.cartera_id).toBeGreaterThan(0)

    await cerrar()
  })

  it('rechaza el nombre de usuario duplicado que solo difiere en mayusculas', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await registrarUsuario(db, REGISTRO_VALIDO)

    await expect(
      registrarUsuario(db, { ...REGISTRO_VALIDO, nombre_usuario: 'ANA', correo: 'otra@ejemplo.test' }),
    ).rejects.toMatchObject({ name: 'DatosDuplicados', campo: 'nombre_usuario' })

    await cerrar()
  })

  it('rechaza el correo duplicado', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await registrarUsuario(db, REGISTRO_VALIDO)

    await expect(
      registrarUsuario(db, { ...REGISTRO_VALIDO, nombre_usuario: 'otra' }),
    ).rejects.toMatchObject({ name: 'DatosDuplicados', campo: 'correo' })

    await cerrar()
  })

  it('rechaza una contrasena de menos de 6 caracteres y no crea la cuenta', async () => {
    const { db, cerrar } = await crearBaseDePruebas()

    await expect(
      registrarUsuario(db, { ...REGISTRO_VALIDO, contrasena: '12345' }),
    ).rejects.toBeInstanceOf(ErroresDeValidacion)

    expect(await buscarPorNombreUsuario(db, 'ana')).toBeUndefined()

    await cerrar()
  })

  it('deja un registro rechazado sin cartera ni sesion a medias', async () => {
    const { db, pg, cerrar } = await crearBaseDePruebas()
    await registrarUsuario(db, REGISTRO_VALIDO)

    // El duplicado revierte la transaccion entera: no hay carteras huerfanas.
    await registrarUsuario(db, {
      ...REGISTRO_VALIDO,
      nombre_usuario: 'ANA',
      correo: 'otra@ejemplo.test',
    }).catch(() => undefined)

    const conteo = await pg.query<{ carteras: number; sesiones: number; usuarios: number }>(
      `select
         (select count(*)::int from usuarios) as usuarios,
         (select count(*)::int from carteras) as carteras,
         (select count(*)::int from sesiones) as sesiones`,
    )
    expect(conteo.rows[0]).toEqual({ usuarios: 1, carteras: 1, sesiones: 1 })

    await cerrar()
  })
})

describe('inicio de sesion', () => {
  it('autentica con la contrasena correcta y genera un identificador nuevo', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    const primera = await iniciarSesion(db, { nombre_usuario: 'ana', contrasena: CONTRASENA_POR_DEFECTO })
    const segunda = await iniciarSesion(db, { nombre_usuario: 'ana', contrasena: CONTRASENA_POR_DEFECTO })

    expect(primera.usuario_id).toBe(usuario_id)
    // Identificador nuevo en cada inicio de sesion: si se reutilizara, cerrar
    // una sesion cerraria las otras.
    expect(primera.sesion.token).not.toBe(segunda.sesion.token)
    expect(primera.sesion.token_proteccion).not.toBe(segunda.sesion.token_proteccion)

    await cerrar()
  })

  it('trata el nombre de usuario sin distinguir mayusculas', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'Ana' })

    for (const intento of ['Ana', 'ana', 'ANA', 'aNa']) {
      const resultado = await iniciarSesion(db, {
        nombre_usuario: intento,
        contrasena: CONTRASENA_POR_DEFECTO,
      })
      expect(resultado.usuario_id).toBe(usuario_id)
    }

    await cerrar()
  })

  it('rechaza una contrasena incorrecta sin crear sesion', async () => {
    const { db, pg, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    await expect(
      iniciarSesion(db, { nombre_usuario: 'ana', contrasena: 'equivocada' }),
    ).rejects.toBeInstanceOf(CredencialesInvalidas)

    const sesiones = await pg.query<{ total: number }>('select count(*)::int as total from sesiones')
    expect(sesiones.rows[0]?.total).toBe(0)

    await cerrar()
  })

  it('rechaza un nombre de usuario desconocido con el MISMO error que una contrasena mala', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    const desconocido = await iniciarSesion(db, { nombre_usuario: 'bruno', contrasena: 'x' }).catch(
      (e: unknown) => e,
    )
    const contrasenaMala = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: 'equivocada',
    }).catch((e: unknown) => e)

    expect((desconocido as Error).message).toBe((contrasenaMala as Error).message)

    await cerrar()
  })

  it('bloquea durante 60 segundos tras 5 intentos fallidos', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    for (let intento = 1; intento <= INTENTOS_MAXIMOS; intento += 1) {
      await iniciarSesion(db, { nombre_usuario: 'ana', contrasena: 'mala' }).catch(() => undefined)
    }

    // La contrasena correcta ya no sirve: la cuenta esta bloqueada.
    const error = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(CuentaBloqueada)
    const restantes = (error as CuentaBloqueada).segundos_restantes
    expect(restantes).toBeGreaterThan(0)
    expect(restantes).toBeLessThanOrEqual(SEGUNDOS_BLOQUEO)

    await cerrar()
  })

  it('reinicia el conteo de intentos tras un acceso exitoso', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    // Cuatro fallos: uno menos que el limite.
    for (let intento = 0; intento < INTENTOS_MAXIMOS - 1; intento += 1) {
      await iniciarSesion(db, { nombre_usuario: 'ana', contrasena: 'mala' }).catch(() => undefined)
    }
    expect((await estadoDelUsuario(db, 'ana')).intentos_fallidos).toBe(INTENTOS_MAXIMOS - 1)

    // El quinto acierto, con la contrasena buena, deja el contador en cero.
    await iniciarSesion(db, { nombre_usuario: 'ana', contrasena: CONTRASENA_POR_DEFECTO })
    const usuario = await estadoDelUsuario(db, 'ana')
    expect(usuario.intentos_fallidos).toBe(0)
    expect(usuario.bloqueado_hasta).toBeNull()

    // Por eso el quinto fallo seguido del acierto no bloquea: quedaria en 1.
    await cerrar()
  })

  it('el bloqueo expira solo, sin un proceso que lo limpie', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    // Un bloqueo ya vencido, del pasado: nobody lo limpio, expiro solo.
    await db
      .update(usuarios)
      .set({ intentos_fallidos: INTENTOS_MAXIMOS, bloqueado_hasta: new Date(Date.now() - 1000) })
      .where(eq(usuarios.id, usuario_id))

    const resultado = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    })
    expect(resultado.usuario_id).toBe(usuario_id)

    await cerrar()
  })
})

describe('cambio de contrasena', () => {
  it('cambia la contrasena y la anterior deja de ser valida', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    await cambiarContrasena(db, usuario_id, {
      contrasena_actual: CONTRASENA_POR_DEFECTO,
      contrasena_nueva: 'nuevacontra',
      confirmacion: 'nuevacontra',
    })

    // La anterior ya no entra.
    await expect(
      iniciarSesion(db, { nombre_usuario: 'ana', contrasena: CONTRASENA_POR_DEFECTO }),
    ).rejects.toBeInstanceOf(CredencialesInvalidas)

    // La nueva si.
    const resultado = await iniciarSesion(db, { nombre_usuario: 'ana', contrasena: 'nuevacontra' })
    expect(resultado.usuario_id).toBe(usuario_id)

    await cerrar()
  })

  it('deja al usuario autenticado con la credencial nueva', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    const { sesion } = await cambiarContrasena(db, usuario_id, {
      contrasena_actual: CONTRASENA_POR_DEFECTO,
      contrasena_nueva: 'nuevacontra',
      confirmacion: 'nuevacontra',
    })

    // La sesion devuelta resuelve una fila vigente: el usuario no quedo afuera.
    expect(await buscarSesionVigente(db, sesion.token)).toBeDefined()

    await cerrar()
  })

  it('rechaza una contrasena actual incorrecta sin cambiar nada', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    await expect(
      cambiarContrasena(db, usuario_id, {
        contrasena_actual: 'no-es-la-mia',
        contrasena_nueva: 'nuevacontra',
        confirmacion: 'nuevacontra',
      }),
    ).rejects.toBeInstanceOf(CredencialesInvalidas)

    // La original sigue funcionando: no se toco nada.
    const resultado = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    })
    expect(resultado.usuario_id).toBe(usuario_id)

    await cerrar()
  })

  it('explica el requisito de longitud cuando la nueva es corta', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    const error = await cambiarContrasena(db, usuario_id, {
      contrasena_actual: CONTRASENA_POR_DEFECTO,
      contrasena_nueva: '12345',
      confirmacion: '12345',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ErroresDeValidacion)
    expect((error as ErroresDeValidacion).campos.contrasena_nueva).toContain('6')

    await cerrar()
  })

  it('exige que las dos contrasenas nuevas coincidan', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    const error = await cambiarContrasena(db, usuario_id, {
      contrasena_actual: CONTRASENA_POR_DEFECTO,
      contrasena_nueva: 'nuevacontra',
      confirmacion: 'otracosa',
    }).catch((e: unknown) => e)

    expect((error as ErroresDeValidacion).campos.confirmacion).toBeDefined()

    await cerrar()
  })

  it('cierra las demas sesiones, para que cambiar la contrasena corte el acceso robado', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })

    const primerAcceso = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    })
    const segundoAcceso = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    })

    const { sesion: nueva } = await cambiarContrasena(db, usuario_id, {
      contrasena_actual: CONTRASENA_POR_DEFECTO,
      contrasena_nueva: 'nuevacontra',
      confirmacion: 'nuevacontra',
    })

    // Las dos sesiones anteriores quedaron sin uso.
    expect(await buscarSesionVigente(db, primerAcceso.sesion.token)).toBeUndefined()
    expect(await buscarSesionVigente(db, segundoAcceso.sesion.token)).toBeUndefined()
    // Y la nueva sirve.
    expect(await buscarSesionVigente(db, nueva.token)).toBeDefined()

    await cerrar()
  })
})

describe('cierre de sesion', () => {
  it('destruye la sesion y despues el token ya no sirve', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })
    const { sesion } = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    })

    expect(await cerrarSesion(db, usuario_id, sesion.token)).toBe(true)
    expect(await buscarSesionVigente(db, sesion.token)).toBeUndefined()
  })

  it('es idempotente: cerrar dos veces no es un error', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db, { nombre_usuario: 'ana' })
    const { sesion } = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    })

    expect(await cerrarSesion(db, usuario_id, sesion.token)).toBe(true)
    expect(await cerrarSesion(db, usuario_id, sesion.token)).toBe(false)

    await cerrar()
  })

  it('no deja cerrar la sesion de otro usuario con un token ajeno', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const ana = await usuarioDePrueba(db, { nombre_usuario: 'ana' })
    const bruno = await usuarioDePrueba(db, { nombre_usuario: 'bruno' })

    const { sesion } = await iniciarSesion(db, {
      nombre_usuario: 'bruno',
      contrasena: CONTRASENA_POR_DEFECTO,
    })

    // Bruno pide cerrar la sesion de Ana: no puede.
    expect(await cerrarSesion(db, ana, sesion.token)).toBe(false)
    expect(await buscarSesionVigente(db, sesion.token)).toBeDefined()

    await cerrar()
  })
})

describe('la cartera inicial', () => {
  it('el registro deja exactamente una cartera, con el nombre del usuario', async () => {
    const { db, pg, cerrar } = await crearBaseDePruebas()
    const resultado = await registrarUsuario(db, REGISTRO_VALIDO)

    const carteras = await pg.query<{ id: number; nombre: string; usuario_id: number }>(
      'select id, nombre, usuario_id from carteras',
    )
    expect(carteras.rows).toHaveLength(1)
    expect(carteras.rows[0]?.nombre).toBe('Ana')
    expect(carteras.rows[0]?.usuario_id).toBe(resultado.usuario_id)
    expect(carteras.rows[0]?.id).toBe(resultado.cartera_id)

    await cerrar()
  })
})
