import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearCartera,
  crearCuenta,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import { saldoDeCuenta } from '@/repos/cuentas'
import { buscarMovimiento, listarMovimientos } from '@/repos/movimientos'
import { registrarTraspaso } from '@/repos/traspasos'
import type { Base } from '@/db/tipos'
import type { ResultadoDeTraspaso } from '@/traspasos/acciones'

/**
 * Las Server Actions de `traspasos`: la sesion, el token y la traduccion de errores.
 *
 * Misma estructura que las de `transacciones`, y por el mismo motivo: son adaptadores finos,
 * y lo que se rompe en un adaptador fino no esta en el repositorio sino alrededor de el.
 *
 * 1. **Sin sesion no se escribe nada.** Se comprueba que no quedo la pata, no solo que
 *    volvio un error.
 * 2. **El token de proteccion se exige**, con el mensaje generico.
 * 3. **Cada error de dominio llega con su mensaje.** La columna `mensaje` es la del error
 *    lanzado por el repositorio: si la accion lo cambiara, esta prueba falla. Es lo unico
 *    que impide que un `catch` siga lanzando igual pero diga otra cosa.
 * 4. **El aviso no es un error.** Un traspaso de una sola pata sale con `ok: true` y su
 *    texto en `aviso`; en `error` no hay nada. Mezclarlos seria decir que la operacion fallo.
 */

const dbPorDefecto = { valor: null as Base | null }
const sesionPorDefecto = { valor: { usuario_id: 0 } as { usuario_id: number } | undefined }
const proteccionPorDefecto = { valido: true }

const { revalidar } = vi.hoisted(() => ({ revalidar: vi.fn() }))

vi.mock('next/cache', () => ({
  revalidatePath: revalidar,
  revalidateTag: vi.fn(),
}))

vi.mock('@/db/cliente', () => ({
  obtenerCliente: () => {
    if (!dbPorDefecto.valor) throw new Error('la prueba no fijo la base')
    return dbPorDefecto.valor
  },
}))

vi.mock('@/sesion/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/sesion/server')>()
  return {
    ...original,
    sesionActual: async () => sesionPorDefecto.valor,
    exigirSesion: async () => {
      if (!sesionPorDefecto.valor) throw new original.SesionRequerida()
      return sesionPorDefecto.valor
    },
  }
})

vi.mock('@/sesion/proteccion', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/sesion/proteccion')>()
  const { TokenRequerido } = await import('@/sesion/server')
  return {
    ...original,
    exigirTokenProteccion: async () => {
      if (!proteccionPorDefecto.valido) throw new TokenRequerido()
    },
  }
})

const { accionEditarTraspaso, accionRegistrarTraspaso } = await import('@/traspasos/acciones')

const INICIAL: ResultadoDeTraspaso = { ok: false }

let base: BaseDePruebas
let mio: number
let cartera: number
let corriente: number
let ahorro: number
let carteraSegunda: number
let cuentaDeOtraCartera: number
let otro: number
let cuentaAjena: number

function datos(campos: Record<string, string>): FormData {
  const form = new FormData()
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor)
  return form
}

function alta(extra: Record<string, string> = {}): FormData {
  return datos({
    origen_cuenta_id: String(corriente),
    destino_cuenta_id: String(ahorro),
    monto: '500.00',
    fecha: '2026-03-10',
    descripcion: 'Ahorro de marzo',
    comercio: '',
    ...extra,
  })
}

/** Cuantos movimientos hay antes de que la accion escriba. */
async function cuantosMovimientos(): Promise<number> {
  return (await listarMovimientos(base.db, mio)).length
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  dbPorDefecto.valor = base.db
  proteccionPorDefecto.valido = true
  revalidar.mockClear()

  mio = await crearUsuario(base.db)
  sesionPorDefecto.valor = { usuario_id: mio }

  cartera = await crearCartera(base.db, mio, { nombre: 'Principal' })
  corriente = await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '10000.00' })
  ahorro = await crearCuenta(base.db, cartera, { nombre: 'Ahorro', saldo_inicial: '2000.00' })

  carteraSegunda = await crearCartera(base.db, mio, { nombre: 'Segunda' })
  cuentaDeOtraCartera = await crearCuenta(base.db, carteraSegunda, { nombre: 'Corriente 2' })

  otro = await crearUsuario(base.db)
  const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Ajena' })
  cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: 'Ajena' })
})

afterEach(async () => {
  await base.cerrar()
})

describe('070: sin sesion no se escribe nada', () => {
  it('no crea el traspaso y avisa que hace falta entrar', async () => {
    sesionPorDefecto.valor = undefined
    const antes = await cuantosMovimientos()

    const resultado = await accionRegistrarTraspaso(cartera, INICIAL, alta())

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBeDefined()
    expect(await cuantosMovimientos()).toBe(antes)
  })

  it('no edita la pata', async () => {
    const alta_ = await registrarTraspaso(base.db, mio, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Ahorro',
    })
    sesionPorDefecto.valor = undefined

    const resultado = await accionEditarTraspaso(cartera, alta_.origen_id, INICIAL, alta())

    expect(resultado.ok).toBe(false)
    expect((await buscarMovimiento(base.db, mio, alta_.origen_id))?.monto).toBe('-500.00')
  })
})

describe('070: el token de proteccion se exige', () => {
  it('sin token no se escribe nada, con el mensaje generico', async () => {
    proteccionPorDefecto.valido = false
    const antes = await cuantosMovimientos()

    const resultado = await accionRegistrarTraspaso(cartera, INICIAL, alta())

    // El mensaje es generico a proposito: no le dice al otro sitio por que fallo.
    expect(resultado.ok).toBe(false)
    expect(resultado.error).not.toBe(cartera.toString())
    expect(await cuantosMovimientos()).toBe(antes)
  })
})

describe('070: el alta escribe el traspaso', () => {
  it('crea las dos patas y devuelve el periodo', async () => {
    const resultado = await accionRegistrarTraspaso(cartera, INICIAL, alta())

    expect(resultado.ok).toBe(true)
    expect(resultado.periodo_afectado).toBe('2026-03')
    expect(await saldoDeCuenta(base.db, mio, cartera, corriente)).toBe('9500.00')
    expect(await saldoDeCuenta(base.db, mio, cartera, ahorro)).toBe('2500.00')
  })

  it('acepta el destino vacio y devuelve el aviso de pata unica', async () => {
    const resultado = await accionRegistrarTraspaso(
      cartera,
      INICIAL,
      alta({ destino_cuenta_id: '' }),
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toContain('contraparte')
    // El aviso viaja en su campo y **no** en `error`: la operacion esta bien hecha.
    expect(resultado.error).toBeUndefined()
    expect(await saldoDeCuenta(base.db, mio, cartera, corriente)).toBe('9500.00')
  })

  it('revalida la cartera de la ruta', async () => {
    await accionRegistrarTraspaso(cartera, INICIAL, alta())

    expect(revalidar).toHaveBeenCalledWith(`/cartera/${cartera}`)
  })
})

describe('070: cada error de dominio llega con su mensaje', () => {
  /**
   * Errores que lanza el **repositorio**: llegan en `error`, con el texto del error.
   *
   * Se prueban aparte de los de validacion porque viajan distinto: un error de validacion
   * tiene un mensaje resumen y el detalle por campo en `campos`; un error de dominio no tiene
   * campos, tiene un mensaje que ya es para el usuario. Meterlos en una sola tabla obliga a
   * decidir en cada fila por donde se espera el texto, y esa decision es justo lo que hay que
   * fijar.
   */
  const DE_REPOSITORIO = [
    {
      nombre: 'carteras distintas',
      mensaje: 'Un traspaso no puede cruzar carteras: las dos cuentas tienen que ser de la misma.',
      form: () => alta({ destino_cuenta_id: String(cuentaDeOtraCartera) }),
    },
    {
      nombre: 'cuenta que no es del usuario',
      mensaje: 'Esa cuenta no existe, o no es tuya.',
      form: () => alta({ destino_cuenta_id: String(cuentaAjena) }),
    },
  ] as const

  it.each(DE_REPOSITORIO)('$nombre', async ({ mensaje, form }) => {
    const antes = await cuantosMovimientos()

    const resultado = await accionRegistrarTraspaso(cartera, INICIAL, form())

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe(mensaje)
    // Un error de dominio no trae `campos`: no hay ningun campo que corregir, hay una cuenta
    // que no es tuya.
    expect(resultado.campos).toBeUndefined()
    expect(await cuantosMovimientos()).toBe(antes)
  })

  /**
   * Errores de la **validacion**: un mensaje resumen en `error` y el detalle en `campos`,
   * colgando del campo que hay que corregir.
   */
  const DE_VALIDACION = [
    {
      nombre: 'importe en cero',
      campo: 'monto',
      mensaje: 'El importe debe ser distinto de cero.',
      form: () => alta({ monto: '0' }),
    },
    {
      nombre: 'importe que no es numero',
      campo: 'monto',
      mensaje: 'El importe es un numero, por ejemplo 1500 o 1500.50.',
      form: () => alta({ monto: 'abc' }),
    },
    {
      nombre: 'las dos cuentas iguales',
      campo: 'origen_cuenta_id',
      mensaje: 'Elige dos cuentas distintas: un traspaso a si mismo no mueve nada.',
      form: () => alta({ destino_cuenta_id: String(corriente) }),
    },
    {
      nombre: 'cuenta de origen que no se pudo leer',
      campo: 'origen_cuenta_id',
      mensaje: 'No se pudo identificar la cuenta de origen.',
      form: () => alta({ origen_cuenta_id: 'abc' }),
    },
    {
      nombre: 'fecha que no es un dia',
      campo: 'fecha',
      mensaje: 'La fecha es un dia, por ejemplo 2026-03-31.',
      form: () => alta({ fecha: '2026-02-31' }),
    },
  ] as const

  it.each(DE_VALIDACION)('$nombre', async ({ campo, mensaje, form }) => {
    const antes = await cuantosMovimientos()

    const resultado = await accionRegistrarTraspaso(cartera, INICIAL, form())

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe('Los datos enviados no son validos.')
    expect(resultado.campos).toMatchObject({ [campo]: mensaje })
    expect(await cuantosMovimientos()).toBe(antes)
  })
})

describe('070: la edicion reescribe el grupo', () => {
  it('deja las dos patas con el signo dado la vuelta y devuelve el periodo', async () => {
    const creado = await registrarTraspaso(base.db, mio, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Ahorro de marzo',
    })
    if (creado.destino_id === null) throw new Error('debia tener dos patas')

    const resultado = await accionEditarTraspaso(
      cartera,
      creado.origen_id,
      INICIAL,
      alta({ monto: '800.00', fecha: '2026-04-02' }),
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.periodo_afectado).toBe('2026-04')
    expect((await buscarMovimiento(base.db, mio, creado.origen_id))?.monto).toBe('-800.00')
    expect((await buscarMovimiento(base.db, mio, creado.destino_id))?.monto).toBe('800.00')
  })

  it('de una pata sola devuelve el aviso de R1 en `aviso`, no en `error`', async () => {
    const creado = await registrarTraspaso(base.db, mio, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Sin contraparte',
    })

    const resultado = await accionEditarTraspaso(
      cartera,
      creado.origen_id,
      INICIAL,
      alta({ destino_cuenta_id: '', monto: '900.00' }),
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toContain('contraparte')
    expect(resultado.aviso).toContain('900.00')
    expect(resultado.error).toBeUndefined()
  })

  it('un traspaso de dos patas edita sin dejar aviso', async () => {
    const creado = await registrarTraspaso(base.db, mio, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Ahorro',
    })

    const resultado = await accionEditarTraspaso(
      cartera,
      creado.origen_id,
      INICIAL,
      alta({ monto: '600.00' }),
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toBe('El traspaso quedo corregido.')
  })

  it('una cuenta de otra cartera se rechaza con su mensaje y no cambia nada', async () => {
    const creado = await registrarTraspaso(base.db, mio, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Ahorro',
    })

    const resultado = await accionEditarTraspaso(
      cartera,
      creado.origen_id,
      INICIAL,
      alta({ origen_cuenta_id: String(cuentaDeOtraCartera) }),
    )

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe(
      'Un traspaso no puede cruzar carteras: las dos cuentas tienen que ser de la misma.',
    )
    expect((await buscarMovimiento(base.db, mio, creado.origen_id))?.cuenta_id).toBe(corriente)
  })
})
