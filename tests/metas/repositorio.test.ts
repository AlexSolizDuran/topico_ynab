import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearSobre,
  crearUsuario,
  crearAsignacion,
  crearMovimiento,
} from '../helpers/fabricas'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  abandonarMeta,
  completarMeta,
  consultarMetaYProgreso,
  crearMeta,
  listarHistorialMetas,
  obtenerMetaActiva,
  MetaActivaYaExiste,
  MetaObjetivoNoAlcanzado,
  SobreArchivado,
} from '../../src/repos/metas'
import { archivarSobre } from '../../src/repos/sobres'

describe('090: repositorio de metas', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let grupo_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Metas' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco', saldo_inicial: '50000.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Ahorros' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Vacaciones' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R1: crea una meta con fecha limite sobre un sobre existente', async () => {
    const creada = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '20000.00',
      fecha_limite: '2026-12-01',
    })

    expect(creada.id).toBeDefined()
    expect(creada.sobre_id).toBe(sobre_id)
    expect(creada.monto_objetivo).toBe('20000.00')
    expect(creada.fecha_limite).toBe('2026-12-01')
    expect(creada.estado).toBe('activa')

    const activa = await obtenerMetaActiva(base.db, usuario_id, sobre_id)
    expect(activa?.id).toBe(creada.id)
  })

  it('R1: acepta una meta sin fecha limite', async () => {
    const creada = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '5000.00',
    })

    expect(creada.fecha_limite).toBeNull()
    expect(creada.estado).toBe('activa')
  })

  it('R4: rechaza crear una segunda meta activa en el mismo sobre', async () => {
    await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '10000.00',
    })

    await expect(
      crearMeta(base.db, usuario_id, {
        sobre_id,
        monto_objetivo: '15000.00',
      }),
    ).rejects.toThrow(MetaActivaYaExiste)
  })

  it('R6: rechaza crear una meta en un sobre archivado', async () => {
    await archivarSobre(base.db, usuario_id, cartera_id, sobre_id, '2026-09')

    await expect(
      crearMeta(base.db, usuario_id, {
        sobre_id,
        monto_objetivo: '5000.00',
      }),
    ).rejects.toThrow(SobreArchivado)
  })

  it('R5: rechaza completar una meta cuando el disponible no alcanza el objetivo', async () => {
    const meta = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '20000.00',
    })

    // Asignamos solo 12,400 al sobre
    await crearAsignacion(base.db, {
      sobre_id,
      monto: '12400.00',
      periodo: '2026-09',
    })

    await expect(completarMeta(base.db, usuario_id, meta.id, '2026-09')).rejects.toThrow(
      MetaObjetivoNoAlcanzado,
    )

    try {
      await completarMeta(base.db, usuario_id, meta.id, '2026-09')
    } catch (e) {
      if (e instanceof MetaObjetivoNoAlcanzado) {
        expect(e.disponible).toBe('12400.00')
        expect(e.objetivo).toBe('20000.00')
        expect(e.faltante).toBe('7600.00')
      }
    }
  })

  it('R5: completa una meta alcanzada y registra fecha de cumplimiento', async () => {
    const meta = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '20000.00',
    })

    await crearAsignacion(base.db, {
      sobre_id,
      monto: '20000.00',
      periodo: '2026-09',
    })

    const completada = await completarMeta(base.db, usuario_id, meta.id, '2026-09')
    expect(completada.estado).toBe('completada')
    expect(completada.completada_en).not.toBeNull()

    // El sobre ya no tiene meta activa
    const activa = await obtenerMetaActiva(base.db, usuario_id, sobre_id)
    expect(activa).toBeNull()
  })

  it('R4: permite crear una nueva meta activa tras completar la primera', async () => {
    const meta1 = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '20000.00',
    })

    await crearAsignacion(base.db, {
      sobre_id,
      monto: '20000.00',
      periodo: '2026-09',
    })

    await completarMeta(base.db, usuario_id, meta1.id, '2026-09')

    // Ahora creamos la segunda meta
    const meta2 = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '25000.00',
    })

    expect(meta2.estado).toBe('activa')
    expect(meta2.monto_objetivo).toBe('25000.00')

    const historial = await listarHistorialMetas(base.db, usuario_id, sobre_id)
    expect(historial.length).toBe(2)
    expect(historial.map((m) => m.monto_objetivo)).toEqual(['25000.00', '20000.00'])
  })

  it('R5: abandona una meta activa conservando el disponible y permitiendo una nueva', async () => {
    const meta = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '15000.00',
    })

    await crearAsignacion(base.db, {
      sobre_id,
      monto: '5000.00',
      periodo: '2026-09',
    })

    const abandonada = await abandonarMeta(base.db, usuario_id, meta.id)
    expect(abandonada.estado).toBe('abandonada')
    expect(abandonada.abandonada_en).not.toBeNull()

    // El dinero sigue en el sobre
    const activa = await obtenerMetaActiva(base.db, usuario_id, sobre_id)
    expect(activa).toBeNull()

    // Podemos crear una nueva
    const nueva = await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '8000.00',
    })
    expect(nueva.estado).toBe('activa')
  })

  it('R1 y R2: el avance se recalcula dinamicamente tras movimientos en el sobre', async () => {
    await crearMeta(base.db, usuario_id, {
      sobre_id,
      monto_objetivo: '10000.00',
      fecha_limite: '2026-12-01',
    })

    // Inicialmente disponible 0
    let consulta = await consultarMetaYProgreso(base.db, usuario_id, sobre_id, '2026-09')
    expect(consulta?.progreso.disponible).toBe('0.00')
    expect(consulta?.progreso.restante).toBe('10000.00')
    expect(consulta?.progreso.porcentaje).toBe(0)

    // Asignamos 5,000
    await crearAsignacion(base.db, {
      sobre_id,
      monto: '5000.00',
      periodo: '2026-09',
    })

    consulta = await consultarMetaYProgreso(base.db, usuario_id, sobre_id, '2026-09')
    expect(consulta?.progreso.disponible).toBe('5000.00')
    expect(consulta?.progreso.restante).toBe('5000.00')
    expect(consulta?.progreso.porcentaje).toBe(50)

    // Gastamos 1,000 en el sobre -> el avance baja inmediatamente porque comparte disponible
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id,
      monto: '-1000.00',
      tipo: 'gasto',
      fecha: '2026-09-10',
      descripcion: 'Compra',
    })

    consulta = await consultarMetaYProgreso(base.db, usuario_id, sobre_id, '2026-09')
    expect(consulta?.progreso.disponible).toBe('4000.00')
    expect(consulta?.progreso.restante).toBe('6000.00')
    expect(consulta?.progreso.porcentaje).toBe(40)
  })
})
