import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearSobre,
  crearUsuario,
  crearAsignacion,
  crearMeta,
} from '../helpers/fabricas'
import type { Base } from '@/db/tipos'
import { obtenerMetaActiva } from '@/repos/metas'

const dbPorDefecto = { valor: null as Base | null }
const sesionPorDefecto = {
  valor: { usuario_id: 0, usuario: { id: 0 } } as
    | { usuario_id: number; usuario: { id: number } }
    | undefined,
}
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
    sesionActual: async () => (sesionPorDefecto.valor ? { usuario_id: sesionPorDefecto.valor.usuario_id } : undefined),
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
  accionCrearMeta,
  accionCompletarMeta,
  accionAbandonarMeta,
} = await import('@/metas/acciones')

describe('090: server actions de metas', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    dbPorDefecto.valor = base.db
    proteccionPorDefecto.valido = true

    usuario_id = await crearUsuario(base.db)
    sesionPorDefecto.valor = { usuario_id, usuario: { id: usuario_id } }

    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Metas' })
    await crearCuenta(base.db, cartera_id, { nombre: 'Banco', saldo_inicial: '20000.00' })
    const grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Ahorro' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Viaje' })
  })

  afterEach(async () => {
    await base.cerrar()
    dbPorDefecto.valor = null
    sesionPorDefecto.valor = undefined
  })

  function crearForm(campos: Record<string, string>): FormData {
    const form = new FormData()
    for (const [clave, valor] of Object.entries(campos)) {
      form.append(clave, valor)
    }
    return form
  }

  it('exige sesion iniciada para fijar meta', async () => {
    sesionPorDefecto.valor = undefined

    const form = crearForm({
      sobre_id: String(sobre_id),
      monto_objetivo: '10000.00',
    })

    const res = await accionCrearMeta(form)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/iniciar sesion/i)
  })

  it('exige token de proteccion valido', async () => {
    proteccionPorDefecto.valido = false

    const form = crearForm({
      sobre_id: String(sobre_id),
      monto_objetivo: '10000.00',
    })

    const res = await accionCrearMeta(form)
    expect(res.ok).toBe(false)
  })

  it('crea una meta valida con exito', async () => {
    const form = crearForm({
      cartera_id: String(cartera_id),
      sobre_id: String(sobre_id),
      monto_objetivo: '15000.00',
      fecha_limite: '2026-12-01',
    })

    const res = await accionCrearMeta(form)
    expect(res.ok).toBe(true)
    expect(res.aviso).toMatch(/exito/i)

    const activa = await obtenerMetaActiva(base.db, usuario_id, sobre_id)
    expect(activa?.monto_objetivo).toBe('15000.00')
    expect(revalidar).toHaveBeenCalledWith(`/cartera/${cartera_id}`)
  })

  it('rechaza completar meta si no alcanza el disponible', async () => {
    const meta_id = await crearMeta(base.db, sobre_id, {
      monto_objetivo: '20000.00',
    })

    const form = crearForm({
      id: String(meta_id),
      cartera_id: String(cartera_id),
      periodo: '2026-09',
    })

    const res = await accionCompletarMeta(form)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/faltan/i)
  })

  it('completa meta con exito si el disponible alcanza el objetivo', async () => {
    const meta_id = await crearMeta(base.db, sobre_id, {
      monto_objetivo: '5000.00',
    })

    await crearAsignacion(base.db, {
      sobre_id,
      monto: '5000.00',
      periodo: '2026-09',
    })

    const form = crearForm({
      id: String(meta_id),
      cartera_id: String(cartera_id),
      periodo: '2026-09',
    })

    const res = await accionCompletarMeta(form)
    expect(res.ok).toBe(true)
    expect(res.aviso).toMatch(/completada/i)
  })

  it('abandona una meta activa con exito', async () => {
    const meta_id = await crearMeta(base.db, sobre_id, {
      monto_objetivo: '8000.00',
    })

    const form = crearForm({
      id: String(meta_id),
      cartera_id: String(cartera_id),
    })

    const res = await accionAbandonarMeta(form)
    expect(res.ok).toBe(true)
    expect(res.aviso).toMatch(/abandonada/i)

    const activa = await obtenerMetaActiva(base.db, usuario_id, sobre_id)
    expect(activa).toBeNull()
  })
})
