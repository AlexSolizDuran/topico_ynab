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
} from '../../src/repos/patrimonio'
import {
  detectarAfectacionHistorica,
  MENSAJE_HISTORIA_MODIFICADA,
} from '../../src/patrimonio/retroactividad'
import { editarMovimiento } from '../../src/repos/movimientos'

describe('100: matriz de trazabilidad - 12 escenarios de patrimonio', () => {
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
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco MXN', saldo_inicial: '0.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'General' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Gastos' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  describe('Requisito 1: El sistema calcula el patrimonio al cierre de cada periodo', () => {
    it('Scenario: Patrimonio al cierre de un periodo (22,000 en sobres y 8,000 sin asignar -> 30,000)', async () => {
      // WHEN una cartera cierra un periodo con 22,000 en sobres y 8,000 sin asignar
      await crearMovimiento(base.db, {
        cuenta_id,
        monto: '30000.00',
        fecha: '2026-03-01',
        tipo: 'ingreso',
      })
      await crearAsignacion(base.db, {
        sobre_id,
        periodo: '2026-03',
        monto: '22000.00',
      })

      // THEN el sistema registra un patrimonio de 30,000 para ese periodo
      const resultado = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
      expect(resultado.patrimonio).toBe('30000.00')
      expect(resultado.disponible_sobres).toBe('22000.00')
      expect(resultado.dinero_suelto).toBe('8000.00')
    })

    it('Scenario: Periodo sin datos (no se incluye en el historial)', async () => {
      // WHEN un periodo no tiene movimientos, asignaciones ni cuentas con saldo
      // Se crean movimientos en 2026-01 y se deja en cero para que 2026-02 no tenga saldo acumulado
      await crearMovimiento(base.db, { cuenta_id, monto: '1000.00', fecha: '2026-01-05', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, monto: '-1000.00', fecha: '2026-01-25', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-03-01', tipo: 'ingreso' })

      // THEN el sistema no lo incluye en el historial
      const historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
      const periodos = historial.periodos.map((p) => p.periodo)
      expect(periodos).toContain('2026-01')
      expect(periodos).toContain('2026-03')
      expect(periodos).not.toContain('2026-02')
    })

    it('Scenario: Recalculo del patrimonio historico al registrar movimiento en periodo cerrado', async () => {
      // WHEN el usuario registra un movimiento con fecha dentro de un periodo ya cerrado
      await crearMovimiento(base.db, { cuenta_id, monto: '20000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      const antes = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
      expect(antes.patrimonio).toBe('20000.00')

      // Registrar movimiento retroactivo
      await crearMovimiento(base.db, { cuenta_id, monto: '-4000.00', fecha: '2026-03-10', tipo: 'gasto' })

      // THEN el patrimonio de ese periodo se recalcula con el nuevo dato
      const despues = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
      expect(despues.patrimonio).toBe('16000.00')
    })
  })

  describe('Requisito 2: El sistema presenta la evolucion mes a mes', () => {
    it('Scenario: Serie de periodos en orden cronológico', async () => {
      // WHEN existen cuatro periodos con datos en la cartera
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-01-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-02-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-04-01', tipo: 'ingreso' })

      // THEN el sistema muestra los cuatro valores en orden cronologico
      const historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
      expect(historial.periodos.map((p) => p.periodo)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
      ])
    })

    it('Scenario: Variacion entre periodos (de 28,000 a 30,000 -> aumento de 2,000 y +7.14%)', async () => {
      // WHEN el patrimonio paso de 28,000 a 30,000
      await crearMovimiento(base.db, { cuenta_id, monto: '28000.00', fecha: '2026-01-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, monto: '2000.00', fecha: '2026-02-01', tipo: 'ingreso' })

      // THEN el sistema informa un aumento de 2,000 y su porcentaje respecto al periodo anterior
      const historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
      const p2 = historial.periodos[1]!
      expect(p2.patrimonio).toBe('30000.00')
      expect(p2.diferencia_absoluta).toBe('2000.00')
      expect(p2.variacion_porcentual).toBe(7.14)
      expect(p2.porcentaje_texto).toBe('+7.14%')
    })

    it('Scenario: Periodo sin comparacion previa', async () => {
      // WHEN el primer periodo con datos no tiene un periodo anterior con el que compararse
      await crearMovimiento(base.db, { cuenta_id, monto: '15000.00', fecha: '2026-01-01', tipo: 'ingreso' })

      // THEN el sistema lo presenta sin variacion respecto a un periodo previo
      const historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
      const p1 = historial.periodos[0]!
      expect(p1.diferencia_absoluta).toBeNull()
      expect(p1.variacion_porcentual).toBeNull()
      expect(p1.porcentaje_texto).toBeNull()
    })
  })

  describe('Requisito 3: El historial refleja las correcciones retroactivas', () => {
    it('Scenario: Correccion de un movimiento pasado (marzo estando en junio)', async () => {
      // WHEN el usuario corrige un gasto registrado en marzo estando en junio
      await crearMovimiento(base.db, { cuenta_id, monto: '50000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      const idGasto = await crearMovimiento(base.db, {
        cuenta_id,
        monto: '-10000.00',
        fecha: '2026-03-10',
        tipo: 'gasto',
      })
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-04-10', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, monto: '3000.00', fecha: '2026-05-10', tipo: 'ingreso' })

      // Corrección del gasto de marzo de -10,000 a -7,000
      await editarMovimiento(base.db, usuario_id, idGasto, {
        cuenta_id,
        monto: '-7000.00',
        fecha: '2026-03-10',
        descripcion: 'Gasto corregido',
      })

      // THEN el patrimonio de marzo y de los periodos posteriores se recalcula
      const mar = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-03')
      const abr = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-04')
      const may = await consultarPatrimonioAlCierre(base.db, usuario_id, cartera_id, '2026-05')

      expect(mar.patrimonio).toBe('43000.00') // 50000 - 7000
      expect(abr.patrimonio).toBe('48000.00') // 43000 + 5000
      expect(may.patrimonio).toBe('51000.00') // 48000 + 3000
    })

    it('Scenario: Aviso de historia modificada', async () => {
      // WHEN una operacion altera periodos ya cerrados
      const mesActual = '2026-06'
      const aviso = detectarAfectacionHistorica('2026-03-15', mesActual)

      // THEN el sistema informa que la historia del patrimonio cambio
      expect(aviso.historiaModificada).toBe(true)
      expect(aviso.aviso).toBe(MENSAJE_HISTORIA_MODIFICADA)
    })

    it('Scenario: La historia no queda congelada', async () => {
      // WHEN el usuario consulta el historial despues de una correccion retroactiva
      const m1 = await crearMovimiento(base.db, { cuenta_id, monto: '10000.00', fecha: '2026-01-10', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-02-10', tipo: 'ingreso' })

      await editarMovimiento(base.db, usuario_id, m1, {
        cuenta_id,
        monto: '12000.00',
        fecha: '2026-01-10',
        descripcion: 'Ingreso ajustado',
      })

      // THEN los valores mostrados coinciden con los que resulta de los datos actuales
      const historial = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
      expect(historial.periodos[0]?.patrimonio).toBe('12000.00')
      expect(historial.periodos[1]?.patrimonio).toBe('17000.00')
    })
  })

  describe('Requisito 4: El historial corresponde a una sola cartera', () => {
    it('Scenario: Historial de una cartera', async () => {
      // WHEN el usuario selecciona una cartera
      await crearMovimiento(base.db, { cuenta_id, monto: '15000.00', fecha: '2026-03-01', tipo: 'ingreso' })

      // THEN el sistema muestra exclusivamente la evolucion de esa cartera
      const hist = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
      expect(hist.cartera_id).toBe(cartera_id)
      expect(hist.periodos[0]?.patrimonio).toBe('15000.00')
    })

    it('Scenario: Cambio de cartera en el historial (serie en su propia moneda)', async () => {
      // WHEN el usuario cambia de cartera abierta
      const carteraUSD = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Dólares', moneda: 'USD' })
      const cuentaUSD = await crearCuenta(base.db, carteraUSD, { nombre: 'Banco USA', saldo_inicial: '0.00' })
      await crearMovimiento(base.db, { cuenta_id: cuentaUSD, monto: '3000.00', fecha: '2026-03-01', tipo: 'ingreso' })

      // THEN el sistema muestra la serie de la nueva cartera en su propia moneda
      const histUSD = await consultarHistorialPatrimonio(base.db, usuario_id, carteraUSD)
      expect(histUSD.moneda).toBe('USD')
      expect(histUSD.periodos[0]?.patrimonio).toBe('3000.00')
    })

    it('Scenario: Sin series combinadas (no ofrece historial que sume carteras en MXN y USD)', async () => {
      // WHEN el usuario tiene carteras en MXN y en USD
      await crearMovimiento(base.db, { cuenta_id, monto: '10000.00', fecha: '2026-03-01', tipo: 'ingreso' })

      const carteraUSD = await crearCartera(base.db, usuario_id, { nombre: 'Inversiones USD', moneda: 'USD' })
      const cuentaUSD = await crearCuenta(base.db, carteraUSD, { nombre: 'Broker USD', saldo_inicial: '0.00' })
      await crearMovimiento(base.db, { cuenta_id: cuentaUSD, monto: '500.00', fecha: '2026-03-01', tipo: 'ingreso' })

      // THEN el sistema no ofrece un historial que sume ambas series (cada consulta es aislada e independiente)
      const histMXN = await consultarHistorialPatrimonio(base.db, usuario_id, cartera_id)
      const histUSD = await consultarHistorialPatrimonio(base.db, usuario_id, carteraUSD)

      expect(histMXN.periodos[0]?.patrimonio).toBe('10000.00')
      expect(histMXN.moneda).toBe('MXN')

      expect(histUSD.periodos[0]?.patrimonio).toBe('500.00')
      expect(histUSD.moneda).toBe('USD')
    })
  })
})
