import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearSobre,
  crearUsuario,
  crearRegla,
} from '../helpers/fabricas'
import type { Base } from '@/db/tipos'
import type { ResultadoRecurrencia } from '@/recurrencias/acciones'
import { obtenerReglaRecurrente, listarReglasRecurrentes } from '@/repos/recurrencias'

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
  accionCrearReglaRecurrente,
  accionEditarReglaRecurrente,
  accionAlternarReglaRecurrente,
  accionEliminarReglaRecurrente,
  accionMaterializarRecurrencias,
} = await import('@/recurrencias/acciones')

describe('080: server actions de recurrencias', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let sobre_id: number
  let otraCartera_id: number
  let sobreDeOtra_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    dbPorDefecto.valor = base.db
    proteccionPorDefecto.valido = true

    usuario_id = await crearUsuario(base.db)
    sesionPorDefecto.valor = { usuario_id, usuario: { id: usuario_id } }

    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Principal' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco', saldo_inicial: '5000.00' })
    const grupo = await crearGrupo(base.db, cartera_id, { nombre: 'Servicios' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo, { nombre: 'Luz' })

    otraCartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Segunda Cartera' })
    const grupoOtro = await crearGrupo(base.db, otraCartera_id, { nombre: 'Otros' })
    sobreDeOtra_id = await crearSobre(base.db, otraCartera_id, grupoOtro, { nombre: 'Gym' })
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

  it('exige sesion iniciada para crear regla', async () => {
    sesionPorDefecto.valor = undefined

    const form = crearForm({
      cartera_id: String(cartera_id),
      cuenta_id: String(cuenta_id),
      descripcion: 'Renta',
      monto: '1000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: '1',
      fecha_inicio: '2026-01-01',
    })

    const res = await accionCrearReglaRecurrente(form)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/iniciar sesion/i)
  })

  it('exige token de proteccion valido', async () => {
    proteccionPorDefecto.valido = false

    const form = crearForm({
      cartera_id: String(cartera_id),
      cuenta_id: String(cuenta_id),
      descripcion: 'Renta',
      monto: '1000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: '1',
      fecha_inicio: '2026-01-01',
    })

    const res = await accionCrearReglaRecurrente(form)
    expect(res.ok).toBe(false)
  })

  it('crea una regla valida con exito', async () => {
    const form = crearForm({
      cartera_id: String(cartera_id),
      cuenta_id: String(cuenta_id),
      sobre_id: String(sobre_id),
      descripcion: 'Internet Fibra',
      monto: '500.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: '5',
      fecha_inicio: '2026-01-01',
    })

    const res = await accionCrearReglaRecurrente(form)
    expect(res.ok).toBe(true)
    expect(res.aviso).toMatch(/exito/i)

    const reglas = await listarReglasRecurrentes(base.db, usuario_id, cartera_id)
    expect(reglas.length).toBe(1)
    expect(reglas[0]?.descripcion).toBe('Internet Fibra')
    expect(reglas[0]?.monto).toBe('500.00')
  })

  it('rechaza regla anual sin mes', async () => {
    const form = crearForm({
      cartera_id: String(cartera_id),
      cuenta_id: String(cuenta_id),
      descripcion: 'Seguro auto',
      monto: '12000.00',
      tipo: 'gasto',
      frecuencia: 'anual',
      dia: '15',
      fecha_inicio: '2026-01-01',
    })

    const res = await accionCrearReglaRecurrente(form)
    expect(res.ok).toBe(false)
    expect(res.error).toBeDefined()
  })

  it('rechaza regla con cuenta y sobre de distinta cartera', async () => {
    const form = crearForm({
      cartera_id: String(cartera_id),
      cuenta_id: String(cuenta_id),
      sobre_id: String(sobreDeOtra_id),
      descripcion: 'Gimnasio cruzado',
      monto: '800.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: '10',
      fecha_inicio: '2026-01-01',
    })

    const res = await accionCrearReglaRecurrente(form)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/cartera/i)
  })

  it('alterna el estado de una regla (desactivar y activar)', async () => {
    const reglaId = await crearRegla(base.db, {
      cartera_id,
      cuenta_id,
      descripcion: 'Gimnasio',
      monto: '800.00',
      activa: true,
    })

    // Desactivar
    const formDesactivar = crearForm({
      id: String(reglaId),
      cartera_id: String(cartera_id),
      activa: 'false',
    })
    const resDesactivar = await accionAlternarReglaRecurrente(formDesactivar)
    expect(resDesactivar.ok).toBe(true)

    const reglaDesactivada = await obtenerReglaRecurrente(base.db, usuario_id, reglaId)
    expect(reglaDesactivada.activa).toBe(false)

    // Activar
    const formActivar = crearForm({
      id: String(reglaId),
      cartera_id: String(cartera_id),
      activa: 'true',
    })
    const resActivar = await accionAlternarReglaRecurrente(formActivar)
    expect(resActivar.ok).toBe(true)

    const reglaActivada = await obtenerReglaRecurrente(base.db, usuario_id, reglaId)
    expect(reglaActivada.activa).toBe(true)
  })

  it('elimina una regla de forma logica', async () => {
    const reglaId = await crearRegla(base.db, {
      cartera_id,
      cuenta_id,
      descripcion: 'Suscripcion revista',
      monto: '150.00',
      activa: true,
    })

    const form = crearForm({
      id: String(reglaId),
      cartera_id: String(cartera_id),
    })

    const res = await accionEliminarReglaRecurrente(form)
    expect(res.ok).toBe(true)

    const reglas = await listarReglasRecurrentes(base.db, usuario_id, cartera_id)
    expect(reglas.find((r) => r.id === reglaId)).toBeUndefined()
  })

  it('materializa recurrencias pendientes correctamente', async () => {
    await crearRegla(base.db, {
      cartera_id,
      cuenta_id,
      descripcion: 'Renta Mensual',
      monto: '7500.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      fecha_inicio: '2026-01-01',
      activa: true,
    })

    const res = await accionMaterializarRecurrencias(cartera_id, '2026-03-01')
    expect(res.ok).toBe(true)
    expect(res.generados).toBe(3)
    expect(res.periodos).toEqual(['2026-01', '2026-02', '2026-03'])
  })
})
