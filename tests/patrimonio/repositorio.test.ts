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
  consultarHistorialPatrimonio,
  consultarPatrimonioAlCierre,
  CarteraNoExiste,
} from '../../src/repos/patrimonio'

describe('100: repositorio de patrimonio', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let grupo_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Principal', moneda: 'MXN' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco Principal', saldo_inicial: '0.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Gastos Fijos' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Renta' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R1: calcula patrimonio al cierre con 22,000 en sobres y 8,000 sin asignar (total 30,000)', async () => {
    // Cuenta con 30,000 en 2026-03
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '30000.00',
      fecha: '2026-03-01',
      descripcion: 'Ingreso inicial',
      tipo: 'ingreso',
    })
    // 22,000 asignados a sobre en 2026-03
    await crearAsignacion(base.db, {
      sobre_id,
      periodo: '2026-03',
      monto: '22000.00',
    })

    const estado = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
    expect(estado.patrimonio).toBe('30000.00')
    expect(estado.disponible_sobres).toBe('22000.00')
    expect(estado.dinero_suelto).toBe('8000.00')
    expect(estado.moneda).toBe('MXN')
    expect(estado.tiene_datos).toBe(true)
  })

  it('R1: no incluye en el historial periodos sin datos', async () => {
    // Actividad �nicamente en 2026-01 y 2026-03
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '1000.00',
      fecha: '2026-01-10',
      tipo: 'ingreso',
    })
    // En 2026-01 se gasta todo para que la cuenta quede en 0
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '-1000.00',
      fecha: '2026-01-20',
      tipo: 'gasto',
    })

    // En 2026-03 entra nuevo dinero
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '5000.00',
      fecha: '2026-03-05',
      tipo: 'ingreso',
    })

    const historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
    const periodos = historial.periodos.map((p) => p.periodo)
    expect(periodos).toContain('2026-01')
    expect(periodos).toContain('2026-03')
    // 2026-02 no tuvo movimientos, ni asignaciones, y el saldo acumulado de cuentas era 0.00
    expect(periodos).not.toContain('2026-02')
  })

  it('R1 y R3: recalcula el patrimonio hist�rico autom�ticamente al registrar un movimiento pasado', async () => {
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '20000.00',
      fecha: '2026-03-01',
      tipo: 'ingreso',
    })

    const antes = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
    expect(antes.patrimonio).toBe('20000.00')

    // Registro posterior de un gasto en el periodo ya cerrado (marzo)
    await crearMovimiento(base.db, {
      cuenta_id,
      monto: '-3500.00',
      fecha: '2026-03-15',
      tipo: 'gasto',
    })

    const despues = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
    expect(despues.patrimonio).toBe('16500.00')
  })

  it('R2: presenta la serie de periodos en orden cronol�gico y calcula variaciones', async () => {
    // 4 periodos con datos
    // 2026-01: saldo 10,000
    await crearMovimiento(base.db, { cuenta_id, monto: '10000.00', fecha: '2026-01-05', tipo: 'ingreso' })
    // 2026-02: suma 5,000 -> saldo 15,000
    await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-02-10', tipo: 'ingreso' })
    // 2026-03: suma 13,000 -> saldo 28,000
    await crearMovimiento(base.db, { cuenta_id, monto: '13000.00', fecha: '2026-03-12', tipo: 'ingreso' })
    // 2026-04: suma 2,000 -> saldo 30,000
    await crearMovimiento(base.db, { cuenta_id, monto: '2000.00', fecha: '2026-04-02', tipo: 'ingreso' })

    const historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
    expect(historial.periodos).toHaveLength(4)

    // Cronol�gico estricto
    expect(historial.periodos[0]?.periodo).toBe('2026-01')
    expect(historial.periodos[1]?.periodo).toBe('2026-02')
    expect(historial.periodos[2]?.periodo).toBe('2026-03')
    expect(historial.periodos[3]?.periodo).toBe('2026-04')

    // Primer periodo sin comparaci�n previa
    expect(historial.periodos[0]?.diferencia_absoluta).toBeNull()
    expect(historial.periodos[0]?.variacion_porcentual).toBeNull()

    // Variaci�n de 28,000 a 30,000 en 2026-04 (+2,000 y +7.14%)
    const p4 = historial.periodos[3]!
    expect(p4.patrimonio).toBe('30000.00')
    expect(p4.diferencia_absoluta).toBe('2000.00')
    expect(p4.variacion_porcentual).toBe(7.14)
    expect(p4.porcentaje_texto).toBe('+7.14%')
  })

  it('R2: permite filtrar por rango de periodos (desde / hasta)', async () => {
    await crearMovimiento(base.db, { cuenta_id, monto: '1000.00', fecha: '2026-01-05', tipo: 'ingreso' })
    await crearMovimiento(base.db, { cuenta_id, monto: '1000.00', fecha: '2026-02-05', tipo: 'ingreso' })
    await crearMovimiento(base.db, { cuenta_id, monto: '1000.00', fecha: '2026-03-05', tipo: 'ingreso' })
    await crearMovimiento(base.db, { cuenta_id, monto: '1000.00', fecha: '2026-04-05', tipo: 'ingreso' })

    const filtrado = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id, {
      desde: '2026-02',
      hasta: '2026-03',
    })

    expect(filtrado.periodos).toHaveLength(2)
    expect(filtrado.periodos[0]?.periodo).toBe('2026-02')
    expect(filtrado.periodos[1]?.periodo).toBe('2026-03')
  })

  it('R4: historial corresponde a una sola cartera y a�sla monedas y datos de otras carteras', async () => {
    // Cartera en MXN
    await crearMovimiento(base.db, { cuenta_id, monto: '50000.00', fecha: '2026-03-01', tipo: 'ingreso' })

    // Segunda cartera en USD
    const carteraUSD = await crearCartera(base.db, usuario_id, { nombre: 'Cartera USA', moneda: 'USD' })
    const cuentaUSD = await crearCuenta(base.db, carteraUSD, { nombre: 'Chase Bank', saldo_inicial: '2000.00' })
    await crearMovimiento(base.db, { cuenta_id: cuentaUSD, monto: '500.00', fecha: '2026-03-10', tipo: 'ingreso' })

    const histMXN = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
    expect(histMXN.moneda).toBe('MXN')
    expect(histMXN.periodos[0]?.patrimonio).toBe('50000.00')

    const histUSD = await consultarHistorialPatrimonio(base.db, usuario_id, carteraUSD)
    expect(histUSD.moneda).toBe('USD')
    expect(histUSD.periodos[0]?.patrimonio).toBe('2500.00')
  })

  it('R4: rechaza consultar cartera ajena o inexistente con CarteraNoExiste', async () => {
    const otroUsuario = await crearUsuario(base.db)
    await expect(consultarHistorialPatrimonio(base.db, otroUsuario, cartera_id)).rejects.toThrow(CarteraNoExiste)
    await expect(consultarPatrimonioAlCierre(base.db, otroUsuario, cartera_id, '2026-03')).rejects.toThrow(CarteraNoExiste)
    await expect(consultarHistorialPatrimonio(base.db, usuario_id, 99999)).rejects.toThrow(CarteraNoExiste)
  })
})
