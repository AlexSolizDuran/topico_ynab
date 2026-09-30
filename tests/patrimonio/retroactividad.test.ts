import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  crearCartera,
  crearCuenta,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  consultarHistorialPatrimonio,
  consultarPatrimonioAlCierre,
} from '../../src/repos/patrimonio'
import {
  detectarAfectacionHistorica,
  esPeriodoCerrado,
  MENSAJE_HISTORIA_MODIFICADA,
} from '../../src/patrimonio/retroactividad'
import { editarMovimiento, eliminarMovimiento } from '../../src/repos/movimientos'

describe('100: retroactividad y correcciones históricas (R3)', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Principal', moneda: 'MXN' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco', saldo_inicial: '0.00' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R3: corregir un gasto registrado en marzo estando en junio recalcula marzo y los periodos posteriores', async () => {
    // Escenario normativo:
    // WHEN el usuario corrige un gasto registrado en marzo estando en junio
    // THEN el patrimonio de marzo y de los periodos posteriores se recalcula

    // Saldo inicial en marzo: 50,000
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '50000.00',
      fecha: '2026-03-01',
      tipo: 'ingreso',
    })

    // Gasto original en marzo: 10,000 (patrimonio marzo = 40,000)
    const gastoMarzoId = await crearMovimiento(base.db, {
      cuenta_id,
      monto: '-10000.00',
      fecha: '2026-03-10',
      descripcion: 'Gasto marzo original',
      tipo: 'gasto',
    })

    // Movimiento en abril: +5,000 (patrimonio abril = 45,000)
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '5000.00',
      fecha: '2026-04-15',
      tipo: 'ingreso',
    })

    // Movimiento en mayo: +2,000 (patrimonio mayo = 47,000)
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '2000.00',
      fecha: '2026-05-10',
      tipo: 'ingreso',
    })

    // En junio: verificar valores antes de la corrección
    const antesMarzo = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
    const antesAbril = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-04')
    const antesMayo = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-05')

    expect(antesMarzo.patrimonio).toBe('40000.00')
    expect(antesAbril.patrimonio).toBe('45000.00')
    expect(antesMayo.patrimonio).toBe('47000.00')

    // Estando en junio (mes actual = 2026-06), se corrige el gasto de marzo a 6,000 (ahora se gastó 4,000 menos)
    const mesActual = '2026-06'
    const esRetroactivo = esPeriodoCerrado('2026-03', mesActual)
    expect(esRetroactivo).toBe(true)

    const aviso = detectarAfectacionHistorica('2026-03', mesActual)
    expect(aviso.historiaModificada).toBe(true)
    expect(aviso.aviso).toBe(MENSAJE_HISTORIA_MODIFICADA)

    await editarMovimiento(base.db, usuario_id, gastoMarzoId, {
      cuenta_id,
      monto: '-6000.00',
      fecha: '2026-03-10',
      descripcion: 'Gasto marzo corregido',
    })

    // THEN: el patrimonio de marzo y de los periodos posteriores se recalcula
    const despuesMarzo = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
    const despuesAbril = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-04')
    const despuesMayo = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-05')

    expect(despuesMarzo.patrimonio).toBe('44000.00')
    expect(despuesAbril.patrimonio).toBe('49000.00')
    expect(despuesMayo.patrimonio).toBe('51000.00')
  })

  it('R3: aviso de historia modificada ante operaciones en periodos cerrados', async () => {
    // WHEN una operación altera periodos ya cerrados
    // THEN el sistema informa que la historia del patrimonio cambió
    const mesActual = '2026-06'
    const operacionMarzo = detectarAfectacionHistorica('2026-03-15', mesActual)
    expect(operacionMarzo.historiaModificada).toBe(true)
    expect(operacionMarzo.aviso).toBe('La historia del patrimonio cambió.')

    // Operación en el mes en curso no altera historia cerrada
    const operacionJunio = detectarAfectacionHistorica('2026-06-01', mesActual)
    expect(operacionJunio.historiaModificada).toBe(false)
    expect(operacionJunio.aviso).toBeUndefined()
  })

  it('R3: la historia no queda congelada en el historial tras una eliminación retroactiva', async () => {
    // WHEN el usuario consulta el historial después de una corrección retroactiva
    // THEN los valores mostrados coinciden con los que resulta de los datos actuales
    const m1 = await crearMovimiento(base.db, {
      cuenta_id,
      monto: '10000.00',
      fecha: '2026-01-15',
      tipo: 'ingreso',
    })
    const m2 = await crearMovimiento(base.db, {
      cuenta_id,
      monto: '5000.00',
      fecha: '2026-02-15',
      tipo: 'ingreso',
    })

    let historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
    expect(historial.periodos[0]?.patrimonio).toBe('10000.00')
    expect(historial.periodos[1]?.patrimonio).toBe('15000.00')

    // Se elimina retroactivamente el movimiento de enero
    await eliminarMovimiento(base.db, usuario_id, m1)

    // Al consultar nuevamente el historial, los valores reflejan los datos actuales sin valores congelados
    historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
    // Enero ahora tiene saldo 0.00, por lo que si no hay movimientos vivos ni saldo no figura o figura en 0
    // En febrero queda únicamente m2 (+5000)
    const feb = historial.periodos.find((p) => p.periodo === '2026-02')
    expect(feb?.patrimonio).toBe('5000.00')
  })
})
