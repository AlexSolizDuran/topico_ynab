import { describe, expect, it } from 'vitest'
import { CredencialesInvalidas, CuentaBloqueada, cambiarContrasena, iniciarSesion } from '../../src/sesion/servicio'
import { buscarPorNombreUsuario } from '../../src/repos/usuarios'
import { crearUsuario, CONTRASENA_POR_DEFECTO } from '../helpers/fabricas'
import { crearBaseDePruebas } from '../helpers/pg'

describe('el aviso de bloqueo', () => {
  it('el mensaje de bloqueo dice cuanto falta esperar', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await crearUsuario(db, { nombre_usuario: 'ana' })

    for (let intento = 0; intento < 5; intento += 1) {
      await iniciarSesion(db, { nombre_usuario: 'ana', contrasena: 'mala' }).catch(() => undefined)
    }

    const error = await iniciarSesion(db, {
      nombre_usuario: 'ana',
      contrasena: CONTRASENA_POR_DEFECTO,
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(CuentaBloqueada)
    // El mensaje dice el numero de segundos, para que el usuario sepa cuando
    // volver a intentar en vez de tener que adivinarlo.
    expect((error as Error).message).toMatch(/\d+ segundos/)

    await cerrar()
  })

  it('una peticion sin sesion no puede cambiar la contrasena de nadie', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    // Sin sesion no hay `usuario_id` verificado. Un identificador cualquiera no
    // debe bastar para cambiar la credencial de una cuenta.
    const error = await cambiarContrasena(db, 99_999, {
      contrasena_actual: CONTRASENA_POR_DEFECTO,
      contrasena_nueva: 'nuevacontra',
      confirmacion: 'nuevacontra',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(CredencialesInvalidas)
    expect(await buscarPorNombreUsuario(db, 'quien-sea')).toBeUndefined()

    await cerrar()
  })
})
