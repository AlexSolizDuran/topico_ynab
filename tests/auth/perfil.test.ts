import { describe, expect, it } from 'vitest'
import { actualizarPerfil } from '../../src/sesion/servicio'
import { DatosDuplicados, buscarPorId, buscarPorNombreUsuario } from '../../src/repos/usuarios'
import { ErroresDeValidacion } from '../../src/sesion/validacion'
import { crearUsuario } from '../helpers/fabricas'
import { crearBaseDePruebas } from '../helpers/pg'

/**
 * `autenticacion`, requisito "El usuario actualiza sus datos de perfil".
 *
 * La prueba central de este archivo no es la que guarda bien, sino las tres que
 *ubara: el nombre de usuario y la zona horaria viajan en el `FormData` —el
 * formulario los reenvia para poder mostrarlos— y no tienen que cambiar.
 */

const PERFIL_VALIDO = {
  nombre: 'Ana Maria',
  apellido: 'Diaz Soto',
  correo: 'ana.nueva@ejemplo.test',
}

describe('actualizar los datos de perfil', () => {
  it('guarda el nombre, el apellido y el correo nuevos', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db, {
      nombre: 'Ana',
      apellido: 'Diaz',
      nombre_usuario: 'ana',
      correo: 'ana@ejemplo.test',
    })

    await actualizarPerfil(db, usuario_id, PERFIL_VALIDO)

    const guardado = await buscarPorId(db, usuario_id)
    expect(guardado?.nombre).toBe('Ana Maria')
    expect(guardado?.apellido).toBe('Diaz Soto')
    expect(guardado?.correo).toBe('ana.nueva@ejemplo.test')

    await cerrar()
  })

  it('no toca la contrasena ni la actividad, que no son datos de perfil', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db, { nombre_usuario: 'ana' })
    const antes = await buscarPorId(db, usuario_id)

    await actualizarPerfil(db, usuario_id, PERFIL_VALIDO)

    const despues = await buscarPorId(db, usuario_id)
    expect(despues?.hash_contrasena).toBe(antes?.hash_contrasena)
    expect(despues?.activo).toBe(true)
    expect(despues?.intentos_fallidos).toBe(antes?.intentos_fallidos)
    expect(despues?.creado_en).toEqual(antes?.creado_en)

    await cerrar()
  })

  it('rechaza un correo que ya es de otra cuenta, sin guardar nada', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await crearUsuario(db, { nombre_usuario: 'ana', correo: 'ana@ejemplo.test' })
    const intruder = await crearUsuario(db, { nombre_usuario: 'bruno', correo: 'bruno@ejemplo.test' })

    const error = await actualizarPerfil(db, intruder, {
      ...PERFIL_VALIDO,
      correo: 'ana@ejemplo.test',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DatosDuplicados)
    expect((error as DatosDuplicados).campo).toBe('correo')

    // Y lo importante: el rechazo es del correo, no de los otros campos. Un nombre
    // ya guardado significa que la operacion se hizo a medias.
    const bruno = await buscarPorId(db, intruder)
    expect(bruno?.nombre).toBe('Ana')
    expect(bruno?.correo).toBe('bruno@ejemplo.test')

    await cerrar()
  })

  it('un guardado normal deja intacto el nombre de usuario', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db, { nombre_usuario: 'ana' })

    await actualizarPerfil(db, usuario_id, {
      ...PERFIL_VALIDO,
      // El formulario reenvia el nombre de usuario para poder mostrarlo.
      nombre_usuario: 'ana',
    })

    expect((await buscarPorNombreUsuario(db, 'ana'))?.nombre_usuario).toBe('ana')
    await cerrar()
  })

  it('ignora un nombre de usuario distinto al que ya tiene', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db, { nombre_usuario: 'ana' })

    // Aunque el esquema no pide `nombre_usuario`, un `FormData` lo trae igual.
    // Que no se escriba es lo que hace que la operacion no exista, no una validacion.
    await actualizarPerfil(db, usuario_id, { ...PERFIL_VALIDO, nombre_usuario: 'otro' })

    expect((await buscarPorId(db, usuario_id))?.nombre_usuario).toBe('ana')
    expect(await buscarPorNombreUsuario(db, 'otro')).toBeUndefined()
    await cerrar()
  })

  it('ignora una zona horaria distinta a la que ya tiene', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db, {
      nombre_usuario: 'ana',
      zona_horaria: 'America/La_Paz',
    })

    await actualizarPerfil(db, usuario_id, { ...PERFIL_VALIDO, zona_horaria: 'Europe/Madrid' })

    // La zona horaria fija donde cae el corte de mes de cada sobre, meta y regla
    // recurrente: moverla desde el perfil desplazaria periodos ya cerrados.
    expect((await buscarPorId(db, usuario_id))?.zona_horaria).toBe('America/La_Paz')
    await cerrar()
  })

  it('sigue aceptando una zona horaria valida en los datos del formulario', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db, {
      nombre_usuario: 'ana',
      zona_horaria: 'America/La_Paz',
    })

    // Que la zona horaria se envie no la hace editable: se ignora, pero tampoco
    // invalida el resto del guardado.
    await actualizarPerfil(db, usuario_id, {
      ...PERFIL_VALIDO,
      zona_horaria: 'America/La_Paz',
    })

    expect((await buscarPorId(db, usuario_id))?.nombre).toBe('Ana Maria')
    await cerrar()
  })

  it('rechaza un correo con formato invalido sin tocar la base', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db, { nombre_usuario: 'ana', nombre: 'Ana' })

    const error = await actualizarPerfil(db, usuario_id, { ...PERFIL_VALIDO, correo: 'no-es' }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ErroresDeValidacion)
    expect((await buscarPorId(db, usuario_id))?.nombre).toBe('Ana')

    await cerrar()
  })
})
