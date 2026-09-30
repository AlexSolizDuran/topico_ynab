import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearTransferencia,
  crearUsuario,
} from '../helpers/fabricas'
import { buscarMovimiento, eliminarMovimiento, listarMovimientos } from '@/repos/movimientos'
import { crearSobre, disponibleDeSobre } from '@/repos/sobres'
import { saldoDeCuenta } from '@/repos/cuentas'
import type { Base } from '@/db/tipos'
import type { ResultadoDeMovimiento } from '@/transacciones/acciones'

/**
 * Las Server Actions de `transacciones`: la sesion, el token y la traduccion de errores.
 *
 * Misma estructura que las de `sobres`, y por el mismo motivo: son adaptadores finos, y lo
 * que se rompe en un adaptador fino no esta en el repositorio sino alrededor de el.
 *
 * 1. **Sin sesion no se escribe nada.** Se comprueba que no quedo el movimiento, no solo
 *    que volvio un error: un error de forma no escribe, y uno de permiso tampoco, porque
 *    `exigirSesion` va antes del repositorio.
 * 2. **El token de proteccion se exige**, con el mensaje generico, como en las otras
 *    capacidades.
 * 3. **Cada error de dominio llega con su mensaje.** La columna `mensaje` es la del error
 *    lanzado por el repositorio: si la accion lo cambiara, esta prueba falla. Es lo unico
 *    que impide que un `catch` sigailingualmente igual pero diga otra cosa.
 *
 * Sobre la cartera: estas acciones reciben `cartera_id` de la ruta y no lo cruzan con
 * nadie. No es confianza, es que el dato no viaja: el repositorio deduce la cartera de la
 * `cuenta_id` que eligio el usuario, y si esa cuenta no es suya lanza `CuentaAjena`. Por eso
 * `CarteraAjena` no aparece en la lista de 9.2, y probarlo exigiria una comprobacion que el
 * codigo no hace.
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

const {
  accionAsignarSobre,
  accionEditarMovimiento,
  accionEliminarMovimiento,
  accionRegistrarMovimiento,
  accionRestaurarMovimiento,
} = await import('@/transacciones/acciones')

const ENERO = '2026-01'
const INICIAL: ResultadoDeMovimiento = { ok: false }

/**
 * Cuantos movimientos ve `listarMovimientos` antes de que la accion escriba.
 *
 * No son dos: son los dos de `beforeEach` mas **las dos patas** del traspaso. Por eso el
 * numero es 4 y no 3; contarlo mal aca hacia que "no se escribio nada" pase sin comprobar
 * nada, que es justo lo que estas pruebas existen para evitar.
 */
const MOVIMIENTOS_INICIALES = 4

let base: BaseDePruebas
let mio: number
let cartera: number
let carteraSegunda: number
let grupo: number
let cuenta: number
let sobre: number
let otro: number
let ajena: number
let cuentaAjena: number
let sobreDeOtra: number
let movimientoAjeno: number
let gasto: number
let eliminable: number
let pata: number

function datos(campos: Record<string, string>): FormData {
  const form = new FormData()
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor)
  return form
}

function alta(extra: Record<string, string> = {}): Record<string, string> {
  return {
    cuenta_id: String(cuenta),
    sobre_id: String(sobre),
    monto: '-450',
    fecha: '2026-01-15',
    descripcion: 'Compra',
    comercio: '',
    ...extra,
  }
}

async function disponibleDe(sobre_id: number): Promise<string> {
  return disponibleDeSobre(base.db, mio, cartera, sobre_id, ENERO)
}

async function saldo(): Promise<string> {
  return saldoDeCuenta(base.db, mio, cartera, cuenta)
}

beforeEach(async () => {
  revalidar.mockClear()
  base = await crearBaseDePruebas()
  dbPorDefecto.valor = base.db

  mio = await crearUsuario(base.db)
  sesionPorDefecto.valor = { usuario_id: mio }
  proteccionPorDefecto.valido = true

  cartera = await crearCartera(base.db, mio, { nombre: 'Mia' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: 'Banco', saldo_inicial: '10000.00' })

  otro = await crearCuenta(base.db, cartera, { nombre: 'Efectivo', saldo_inicial: '0.00' })
  sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: ENERO })

  // Una **segunda cartera del mismo usuario**. El sobre de aca es mio, asi que existe y se
  // ve; lo que no se ve es desde la cartera de la cuenta. Esa distincion es la que separa
  // `SobreDeOtraCartera` de `SobreNoExiste`: un sobre de otro usuario ni siquiera se
  // encuentra, y uno mio de otra cartera se encuentra y recien ahi se rechaza.
  carteraSegunda = await crearCartera(base.db, mio, { nombre: 'Segunda' })
  const grupoSegundo = await crearGrupo(base.db, carteraSegunda, { nombre: 'Otros' })
  sobreDeOtra = (await crearSobre(base.db, mio, carteraSegunda, grupoSegundo, 'Viajes')).id

  const otroUsuario = await crearUsuario(base.db)
  ajena = await crearCartera(base.db, otroUsuario, { nombre: 'Suyos' })
  const grupoAjeno = await crearGrupo(base.db, ajena, { nombre: 'Ajeno' })
  cuentaAjena = await crearCuenta(base.db, ajena, { nombre: 'Su banco', saldo_inicial: '500.00' })
  movimientoAjeno = await crearMovimiento(base.db, {
    cuenta_id: cuentaAjena,
    monto: '-10.00',
    fecha: '2026-01-15',
  })

  gasto = await crearMovimiento(base.db, {
    cuenta_id: cuenta,
    sobre_id: sobre,
    monto: '-450.00',
    fecha: '2026-01-15',
    descripcion: 'Compra previa',
  })

  eliminable = await crearMovimiento(base.db, {
    cuenta_id: cuenta,
    sobre_id: sobre,
    monto: '-100.00',
    fecha: '2026-01-16',
    descripcion: 'Para borrar y restaurar',
  })

  const traspaso = await crearTransferencia(base.db, {
    origen_cuenta_id: cuenta,
    destino_cuenta_id: otro,
    monto: '500.00',
  })
  pata = traspaso.origen_id
})

afterEach(async () => {
  dbPorDefecto.valor = null
  sesionPorDefecto.valor = undefined
  proteccionPorDefecto.valido = true
  await base.cerrar()
})

describe('transacciones: sin sesion no se hace nada', () => {
  it('no registra el movimiento, y lo dice con el mensaje de sesion', async () => {
    sesionPorDefecto.valor = undefined

    const resultado = await accionRegistrarMovimiento(cartera, INICIAL, new FormData())

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe('Necesitas iniciar sesion.')
    // Lo que importa: no quedo nada escrito. La sesion va antes del repositorio, asi que el
    // corte no deja un movimiento a medio crear.
    expect(await listarMovimientos(base.db, mio)).toHaveLength(MOVIMIENTOS_INICIALES)
  })

  it('tampoco edita, borra, restaura ni asigna', async () => {
    sesionPorDefecto.valor = undefined

    const casos = [
      accionEditarMovimiento(cartera, gasto, INICIAL, new FormData()),
      accionEliminarMovimiento(cartera, eliminable, INICIAL, new FormData()),
      accionRestaurarMovimiento(cartera, eliminable, INICIAL, new FormData()),
      accionAsignarSobre(cartera, gasto, INICIAL, new FormData()),
    ]

    for (const resultado of await Promise.all(casos)) {
      expect(resultado.ok).toBe(false)
      expect(resultado.error).toBe('Necesitas iniciar sesion.')
    }

    // El gasto sigue con su sobre y su importe, y el eliminable sigue vivo.
    expect(await disponibleDe(sobre)).toBe('2450.00')
    const guardado = await buscarMovimiento(base.db, mio, gasto)
    expect(guardado?.monto).toBe('-450.00')
    expect(guardado?.sobre_id).toBe(sobre)
    expect(guardado?.eliminado_en).toBeNull()
    expect((await buscarMovimiento(base.db, mio, eliminable))?.eliminado_en).toBeNull()
  })

  it('una cartera ajena en la ruta no cambia el resultado: el corte esta antes', async () => {
    // El `cartera_id` de la ruta no se cruza con nadie en la accion. Un id inventado no
    // habilita nada, porque el repositorio deduce la cartera de la cuenta.
    sesionPorDefecto.valor = undefined

    const resultado = await accionRegistrarMovimiento(999999, INICIAL, new FormData())

    expect(resultado.error).toBe('Necesitas iniciar sesion.')
  })
})

describe('transacciones: el token de proteccion se exige', () => {
  it('sin token no se escribe, aunque la sesion exista', async () => {
    proteccionPorDefecto.valido = false

    const resultado = await accionRegistrarMovimiento(cartera, INICIAL, datos(alta()))

    expect(resultado.ok).toBe(false)
    // El mensaje es el generico a proposito, como en cuentas, grupos, carteras y sobres: lo
    // que no se permite es la escritura, y el texto no le dice al otro sitio por que fallo.
    expect(resultado.error).toBe('Ocurrio un problema. Intenta de nuevo.')
    expect(await listarMovimientos(base.db, mio)).toHaveLength(MOVIMIENTOS_INICIALES)
    // Y `revalidatePath` no se llamo: sin escritura no hay nada que revalidar.
    expect(revalidar).not.toHaveBeenCalled()
  })
})

/**
 * Cada error de dominio, con el mensaje que el usuario tiene que leer.
 *
 * R3 exige que el mensaje distinga los casos; esta tabla es la que lo verifica, y ademas
 * cubre los errores **nuevos** de este change: `SobreDeOtraCartera`, `PataDeTraspaso` y
 * `TraspasoNoAsignable`.
 */
describe('transacciones: cada error de dominio llega a la pantalla con su mensaje', () => {
  const CASOS: Array<{
    nombre: string
    mensaje: string
    correr: () => Promise<ResultadoDeMovimiento>
  }> = [
    {
      nombre: 'una cuenta de otro usuario',
      mensaje: 'Esa cuenta no existe, o no es tuya.',
      correr: () =>
        accionRegistrarMovimiento(cartera, INICIAL, datos(alta({ cuenta_id: String(cuentaAjena) }))),
    },
    {
      nombre: 'un sobre de otra cartera del mismo usuario',
      mensaje: 'El sobre es de otra cartera que la de la cuenta.',
      correr: () =>
        accionRegistrarMovimiento(cartera, INICIAL, datos(alta({ sobre_id: String(sobreDeOtra) }))),
    },
    {
      nombre: 'un sobre de otro usuario, que ni existe para esta cartera',
      mensaje: 'El sobre no existe en esta cartera.',
      correr: () => accionRegistrarMovimiento(cartera, INICIAL, datos(alta({ sobre_id: '999999' }))),
    },
    {
      nombre: 'un alta que pide ser un traspaso',
      mensaje: 'Un traspaso se registra con su par de movimientos, no con un alta simple.',
      correr: () => accionRegistrarMovimiento(cartera, INICIAL, datos(alta({ tipo: 'traspaso' }))),
    },
    {
      nombre: 'editar una pata de traspaso',
      mensaje: 'Este movimiento es una pata de un traspaso: no se puede editar por separado.',
      correr: () => accionEditarMovimiento(cartera, pata, INICIAL, datos(alta())),
    },
    {
      nombre: 'asignar sobre a una pata de traspaso',
      mensaje: 'Un traspaso no se asigna a un sobre.',
      correr: () =>
        accionAsignarSobre(cartera, pata, INICIAL, datos({ sobre_id: String(sobre) })),
    },
    {
      nombre: 'borrar un movimiento que no existe',
      mensaje: 'Ese movimiento no existe, o no es tuyo.',
      correr: () => accionEliminarMovimiento(cartera, 999999, INICIAL, new FormData()),
    },
    {
      nombre: 'borrar uno que ya esta eliminado',
      mensaje: 'Este movimiento esta eliminado: restauralo antes de corregirlo.',
      correr: async () => {
        await eliminarMovimiento(base.db, mio, eliminable)
        return accionEliminarMovimiento(cartera, eliminable, INICIAL, new FormData())
      },
    },
    {
      nombre: 'editar uno que ya esta eliminado',
      mensaje: 'Este movimiento esta eliminado: restauralo antes de corregirlo.',
      correr: async () => {
        await eliminarMovimiento(base.db, mio, eliminable)
        return accionEditarMovimiento(cartera, eliminable, INICIAL, datos(alta()))
      },
    },
    {
      nombre: 'restaurar uno que esta vivo',
      mensaje: 'Este movimiento no esta eliminado.',
      correr: () => accionRestaurarMovimiento(cartera, gasto, INICIAL, new FormData()),
    },
    {
      nombre: 'asignar a un sobre de otra cartera',
      mensaje: 'El sobre es de otra cartera que la de la cuenta.',
      correr: () =>
        accionAsignarSobre(cartera, gasto, INICIAL, datos({ sobre_id: String(sobreDeOtra) })),
    },
    {
      nombre: 'asignar sobre a un movimiento de otro usuario',
      mensaje: 'Ese movimiento no existe, o no es tuyo.',
      correr: () =>
        accionAsignarSobre(cartera, movimientoAjeno, INICIAL, datos({ sobre_id: String(sobre) })),
    },
  ]

  it.each(CASOS)('$nombre', async ({ mensaje, correr }) => {
    const resultado = await correr()

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe(mensaje)
  })

  it('el cero lo frena la validacion, con el mensaje en el campo', async () => {
    const resultado = await accionRegistrarMovimiento(cartera, INICIAL, datos(alta({ monto: '0' })))

    expect(resultado.ok).toBe(false)
    // El mensaje generico del formulario y el motivo en el campo. `ImporteCero` del
    // repositorio existe igual —R1 lo exige alla— pero por la accion no se llega: el `0`
    // muere antes, en el esquema. Las dos barreras dan el mismo texto a proposito.
    expect(resultado.error).toBe('Los datos enviados no son validos.')
    expect(resultado.campos?.monto).toBe('El importe debe ser distinto de cero.')
    expect(await listarMovimientos(base.db, mio)).toHaveLength(MOVIMIENTOS_INICIALES)
  })

  it('el error de forma trae el mensaje por campo, no el generico', async () => {
    const resultado = await accionRegistrarMovimiento(
      cartera,
      INICIAL,
      datos(alta({ fecha: 'no-es-fecha' })),
    )

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe('Los datos enviados no son validos.')
    expect(resultado.campos?.fecha).toBeTruthy()
  })
})

describe('transacciones: la accion correcta escribe y avisa', () => {
  it('registra y revalida la pagina de la cartera', async () => {
    const resultado = await accionRegistrarMovimiento(cartera, INICIAL, datos(alta()))

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toBe('El movimiento quedo registrado en 2026-01.')
    expect(resultado.periodo_afectado).toBe('2026-01')
    expect(revalidar).toHaveBeenCalledWith(`/cartera/${cartera}`)
    // El disponible bajo 450 y el saldo tambien: el alta si mueve las dos sumas.
    // 3000 de asignacion, menos los -450 y -100 de `beforeEach`, menos estos -450.
    expect(await disponibleDe(sobre)).toBe('2000.00')
    // El saldo arrastra ademas la pata de salida del traspaso de `beforeEach`: de ahi el
    // -500. Olvidarse de ese -500 hace pensar que el alta movio de mas.
    expect(await saldo()).toBe('8500.00')
  })

  it('el periodo viaja para que la vista pueda avisar si fue retroactivo', async () => {
    // R7: el aviso retroactivo necesita saber el periodo afectado, y la accion es lo
    // unico que lo sabe sin volver a derivarlo en el componente.
    const resultado = await accionRegistrarMovimiento(
      cartera,
      INICIAL,
      datos(alta({ fecha: '2026-04-20', monto: '-100' })),
    )

    expect(resultado.periodo_afectado).toBe('2026-04')
    expect(resultado.aviso).toContain('2026-04')
  })

  it('un alta sin sobre es un ingreso normal, no una devolucion', async () => {
    const resultado = await accionRegistrarMovimiento(
      cartera,
      INICIAL,
      datos(alta({ sobre_id: '', monto: '200' })),
    )

    expect(resultado.ok).toBe(true)
    // El disponible no se movio: la accion no tiene ningun caso especial para devoluciones,
    // y por eso no puede inventarse uno.
    expect(await disponibleDe(sobre)).toBe('2450.00')
  })

  it('editar corrige los derivados y revalida', async () => {
    const resultado = await accionEditarMovimiento(
      cartera,
      gasto,
      INICIAL,
      datos(alta({ monto: '-1000', descripcion: 'Corregida' })),
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toBe('El movimiento quedo corregido.')
    expect(revalidar).toHaveBeenCalledWith(`/cartera/${cartera}`)
    expect(await disponibleDe(sobre)).toBe('1900.00')
    const corregido = await buscarMovimiento(base.db, mio, gasto)
    expect(corregido?.descripcion).toBe('Corregida')
  })

  it('borrar avisa que se puede restaurar, y restaurarlo lo devuelve', async () => {
    const borrado = await accionEliminarMovimiento(cartera, eliminable, INICIAL, new FormData())

    expect(borrado.ok).toBe(true)
    expect(borrado.aviso).toBe('El movimiento quedo eliminado. Puedes restaurarlo.')
    expect(await disponibleDe(sobre)).toBe('2550.00')

    const restaurado = await accionRestaurarMovimiento(cartera, eliminable, INICIAL, new FormData())

    expect(restaurado.ok).toBe(true)
    expect(restaurado.aviso).toBe('El movimiento volvio a estar.')
    expect(await disponibleDe(sobre)).toBe('2450.00')
  })

  it('borrar una pata avisa que se fueron las dos, no una', async () => {
    const resultado = await accionEliminarMovimiento(cartera, pata, INICIAL, new FormData())

    expect(resultado.ok).toBe(true)
    // Decir "se borro" a secas dejaria al usuario sin saber que tambien se fue la otra pata.
    expect(resultado.aviso).toBe('Se eliminaron 2 movimientos: el traspaso completo.')
    const ambas = await listarMovimientos(
      base.db,
      mio,
      {},
    )
    expect(ambas.map((m) => m.id)).not.toContain(pata)
  })

  it('restaurar una pata devuelve las dos juntas', async () => {
    await eliminarMovimiento(base.db, mio, pata)

    const resultado = await accionRestaurarMovimiento(cartera, pata, INICIAL, new FormData())

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toBe('Se restauraron 2 movimientos: el traspaso completo.')
    expect((await buscarMovimiento(base.db, mio, pata))?.eliminado_en).toBeNull()
  })

  it('asignar sobre lo mueve, y vacio lo quita', async () => {
    // Sin la clave `sobre_id`: la factory no distingue "sin sobre" de "no me importa".
    const sinSobre = await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      monto: '-80.00',
      fecha: '2026-01-17',
    })

    const asignado = await accionAsignarSobre(
      cartera,
      sinSobre,
      INICIAL,
      datos({ sobre_id: String(sobre) }),
    )
    expect(asignado.ok).toBe(true)
    expect(asignado.aviso).toBe('Se le asigno el sobre.')
    expect((await buscarMovimiento(base.db, mio, sinSobre))?.sobre_id).toBe(sobre)

    const quitado = await accionAsignarSobre(cartera, sinSobre, INICIAL, datos({ sobre_id: '' }))
    expect(quitado.ok).toBe(true)
    expect(quitado.aviso).toBe('Se le quito el sobre.')
    expect((await buscarMovimiento(base.db, mio, sinSobre))?.sobre_id).toBeNull()
  })
})
