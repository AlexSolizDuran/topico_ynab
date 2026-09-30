import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearSobre,
  crearUsuario,
  crearMovimiento,
} from '../helpers/fabricas'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearMeta,
  listarHistorialMetas,
  obtenerMetaActiva,
  SobreArchivado,
} from '../../src/repos/metas'
import { archivarSobre } from '../../src/repos/sobres'

describe('090: metas y archivado de sobres (R6)', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let grupo_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Principal' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco', saldo_inicial: '20000.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Ahorros' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Fondo' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R6: al archivar un sobre con meta activa, la meta pasa a abandonada automaticamente', async () => {
    const meta = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '10000.00',
      fecha_limite: '2026-12-01',
    })

    expect(meta.estado).toBe('activa')

    // Archivamos el sobre (disponible es 0)
    await archivarSobre(base.db, usuario_id, cartera_id, sobre_id, '2026-09')

    // La meta activa ya no existe
    const activa = await obtenerMetaActiva(base.db, usuario_id, sobre_id)
    expect(activa).toBeNull()

    // El historial conserva la meta en estado abandonada
    const historial = await listarHistorialMetas(base.db, usuario_id, sobre_id)
    expect(historial.length).toBe(1)
    expect(historial[0]?.estado).toBe('abandonada')
    expect(historial[0]?.abandonada_en).not.toBeNull()
  })

  it('R6: una devolucion posterior al archivado no reactiva la meta abandonada', async () => {
    await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '5000.00',
    })

    await archivarSobre(base.db, usuario_id, cartera_id, sobre_id, '2026-09')

    // El sobre archivado recibe una devolucion (ingreso de reembolso en ese sobre)
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id,
      monto: '1500.00',
      tipo: 'ingreso',
      fecha: '2026-09-20',
      descripcion: 'Reembolso posterior',
    })

    // La meta sigue abandonada y no vuelve a estar activa
    const activa = await obtenerMetaActiva(base.db, usuario_id, sobre_id)
    expect(activa).toBeNull()

    const historial = await listarHistorialMetas(base.db, usuario_id, sobre_id)
    expect(historial[0]?.estado).toBe('abandonada')
  })

  it('R6: no permite definir una meta nueva sobre un sobre archivado', async () => {
    await archivarSobre(base.db, usuario_id, cartera_id, sobre_id, '2026-09')

    await expect(
      crearMeta(base.db, usuario_id, {
        sobre_id,
        monto_objetivo: '3000.00',
      }),
    ).rejects.toThrow(SobreArchivado)
  })

  it('R6: permite consultar el historial de metas de un sobre archivado', async () => {
    await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '2000.00',
    })

    await archivarSobre(base.db, usuario_id, cartera_id, sobre_id, '2026-09')

    const historial = await listarHistorialMetas(base.db, usuario_id, sobre_id)
    expect(historial.length).toBe(1)
    expect(historial[0]?.monto_objetivo).toBe('2000.00')
    expect(historial[0]?.estado).toBe('abandonada')
  })
})
