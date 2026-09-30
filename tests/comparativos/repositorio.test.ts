import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearSobre,
  crearUsuario,
  crearMovimiento,
  crearTransferencia,
} from '../helpers/fabricas'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  consultarComparativo,
  calcularVariacionComparativo,
  superaUmbral,
  CarteraNoExiste,
  type ConfiguracionUmbral,
} from '../../src/repos/comparativos'

describe('120: repositorio analítico de comparativos', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let cuentaDestino_id: number
  let grupo_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Principal', moneda: 'MXN' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco MXN', saldo_inicial: '50000.00' })
    cuentaDestino_id = await crearCuenta(base.db, cartera_id, { nombre: 'Efectivo', saldo_inicial: '1000.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Gastos Fijos' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Alimentos' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  describe('Cálculos analíticos de variaciones y umbrales', () => {
    it('calcula aumento, importe absoluto y porcentaje relativo a la base', () => {
      const umbral: ConfiguracionUmbral = { porcentaje: 20, importe_absoluto: '500.00' }
      // Base: 1200.00, Comparado: 3000.00 -> Aumento de 1800.00 (+150.00%)
      const v = calcularVariacionComparativo('2026-02', '3000.00', '1200.00', umbral)
      expect(v.direccion).toBe('aumento')
      expect(v.diferencia).toBe('1800.00')
      expect(v.diferencia_absoluta).toBe('1800.00')
      expect(v.porcentaje).toBe('+150.00%')
      expect(v.destacada).toBe(true)
    })

    it('calcula disminución de gasto con signo negativo', () => {
      const umbral: ConfiguracionUmbral = { porcentaje: 20, importe_absoluto: '500.00' }
      // Base: 2000.00, Comparado: 1000.00 -> Disminución de 1000.00 (-50.00%)
      const v = calcularVariacionComparativo('2026-02', '1000.00', '2000.00', umbral)
      expect(v.direccion).toBe('disminucion')
      expect(v.diferencia).toBe('-1000.00')
      expect(v.diferencia_absoluta).toBe('1000.00')
      expect(v.porcentaje).toBe('-50.00%')
      expect(v.destacada).toBe(true)
    })

    it('maneja caso sin cambio', () => {
      const umbral: ConfiguracionUmbral = { porcentaje: 20, importe_absoluto: '500.00' }
      const v = calcularVariacionComparativo('2026-02', '1000.00', '1000.00', umbral)
      expect(v.direccion).toBe('sin_cambio')
      expect(v.diferencia).toBe('0.00')
      expect(v.diferencia_absoluta).toBe('0.00')
      expect(v.porcentaje).toBe('0.00%')
      expect(v.destacada).toBe(false)
    })

    it('ajusta dinámicamente si se supera o no el umbral', () => {
      // Diferencia: 1800.00, +150%
      const diffCent = 180000n
      const pct = 150

      // Umbral permisivo: debe ser destacada
      expect(superaUmbral(diffCent, pct, { porcentaje: 20, importe_absoluto: '500.00' })).toBe(true)

      // Umbral restrictivo que exige monto >= 2000 y pct >= 200%: no debe ser destacada
      expect(superaUmbral(diffCent, pct, { porcentaje: 200, importe_absoluto: '2000.00' })).toBe(false)
    })
  })

  describe('Consultas en base de datos (consultarComparativo)', () => {
    it('R1: compara tres periodos desglosando por sobre y por grupo, excluyendo traspasos', async () => {
      // Enero: gasto 1000.00
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1000.00', fecha: '2026-01-15', tipo: 'gasto' })
      // Febrero: gasto 1500.00
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1500.00', fecha: '2026-02-10', tipo: 'gasto' })
      // Marzo: gasto 2000.00
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-2000.00', fecha: '2026-03-05', tipo: 'gasto' })

      // Traspaso en febrero de 5000 (no debe contar como gasto)
      await crearTransferencia(base.db, {
        origen_cuenta_id: cuenta_id,
        destino_cuenta_id: cuentaDestino_id,
        monto: '5000.00',
        fecha: '2026-02-12',
      })

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02', '2026-03'],
        '2026-03',
      )

      expect(datos.periodos).toEqual(['2026-01', '2026-02', '2026-03'])
      expect(datos.periodo_referencia).toBe('2026-03')

      const sobre = datos.grupos[0]?.sobres.find((s) => s.id === sobre_id)
      expect(sobre?.importes_por_periodo['2026-01']).toBe('1000.00')
      expect(sobre?.importes_por_periodo['2026-02']).toBe('1500.00')
      expect(sobre?.importes_por_periodo['2026-03']).toBe('2000.00')

      // Diferencias respecto a marzo (referencia: 2000.00)
      // Enero vs Marzo: 1000 - 2000 = -1000.00 (disminución)
      expect(sobre?.variaciones['2026-01']?.diferencia).toBe('-1000.00')
      expect(sobre?.variaciones['2026-01']?.direccion).toBe('disminucion')

      // Febrero vs Marzo: 1500 - 2000 = -500.00 (disminución)
      expect(sobre?.variaciones['2026-02']?.diferencia).toBe('-500.00')
      expect(sobre?.variaciones['2026-02']?.direccion).toBe('disminucion')

      // Totales del grupo coinciden
      const g = datos.grupos[0]
      expect(g?.totales_por_periodo['2026-01']).toBe('1000.00')
      expect(g?.totales_por_periodo['2026-02']).toBe('1500.00')
      expect(g?.totales_por_periodo['2026-03']).toBe('2000.00')

      // Traspaso no sumó gasto a febrero
      expect(datos.total_general_por_periodo['2026-02']).toBe('1500.00')
    })

    it('R1: permite cambiar el periodo de referencia y recalcula las diferencias', async () => {
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1000.00', fecha: '2026-01-15', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-2000.00', fecha: '2026-02-15', tipo: 'gasto' })

      // Con referencia en enero (1000.00)
      const datosRefEnero = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )
      const sobreEnero = datosRefEnero.grupos[0]?.sobres[0]
      // Febrero vs Enero: 2000 - 1000 = +1000.00
      expect(sobreEnero?.variaciones['2026-02']?.diferencia).toBe('1000.00')
      expect(sobreEnero?.variaciones['2026-02']?.direccion).toBe('aumento')

      // Cambiar referencia a febrero (2000.00)
      const datosRefFebrero = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-02',
      )
      const sobreFebrero = datosRefFebrero.grupos[0]?.sobres[0]
      // Enero vs Febrero: 1000 - 2000 = -1000.00
      expect(sobreFebrero?.variaciones['2026-01']?.diferencia).toBe('-1000.00')
      expect(sobreFebrero?.variaciones['2026-01']?.direccion).toBe('disminucion')
    })

    it('R2: destaca variaciones relevantes según umbral y avisa cuando no hay', async () => {
      // Referencia 1200, Comparado 3000 -> Aumento 1800
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1200.00', fecha: '2026-01-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-3000.00', fecha: '2026-02-10', tipo: 'gasto' })

      // Con umbral por defecto (20% o 500.00): se destaca
      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )
      expect(datos.hay_variaciones_destacadas).toBe(true)
      expect(datos.elementos_destacados).toHaveLength(2) // 1 sobre y 1 grupo

      // Con umbral estricto (5000.00 y 300%): no hay variaciones relevantes
      const datosEstrictos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
        { importe_absoluto: '5000.00', porcentaje: 300 },
      )
      expect(datosEstrictos.hay_variaciones_destacadas).toBe(false)
      expect(datosEstrictos.elementos_destacados).toHaveLength(0)
    })

    it('R3: refleja correcciones retroactivas de forma inmediata', async () => {
      const movId = await crearMovimiento(base.db, {
        cuenta_id,
        sobre_id,
        monto: '-1000.00',
        fecha: '2026-01-15',
        tipo: 'gasto',
      })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-2000.00', fecha: '2026-02-15', tipo: 'gasto' })

      let datos = await consultarComparativo(base.db, usuario_id, cartera_id, ['2026-01', '2026-02'], '2026-01')
      expect(datos.grupos[0]?.sobres[0]?.importes_por_periodo['2026-01']).toBe('1000.00')

      // Corrección retroactiva del gasto de enero a 1800.00
      const { movimientos } = await import('../../src/db/schema')
      const { eq } = await import('drizzle-orm')
      await base.db.update(movimientos).set({ monto: '-1800.00' }).where(eq(movimientos.id, movId))

      datos = await consultarComparativo(base.db, usuario_id, cartera_id, ['2026-01', '2026-02'], '2026-01')
      expect(datos.grupos[0]?.sobres[0]?.importes_por_periodo['2026-01']).toBe('1800.00')
      // Variación recalculada: 2000 - 1800 = 200.00
      expect(datos.grupos[0]?.sobres[0]?.variaciones['2026-02']?.diferencia).toBe('200.00')
    })

    it('R4: aísla carteras y rechaza carteras inexistentes o de otro usuario', async () => {
      const otroUsuario = await crearUsuario(base.db)
      const otraCartera = await crearCartera(base.db, otroUsuario, { nombre: 'Ajena', moneda: 'USD' })

      await expect(
        consultarComparativo(base.db, usuario_id, otraCartera, ['2026-01', '2026-02'], '2026-01'),
      ).rejects.toThrow(CarteraNoExiste)

      await expect(
        consultarComparativo(base.db, usuario_id, 999999, ['2026-01', '2026-02'], '2026-01'),
      ).rejects.toThrow(CarteraNoExiste)
    })
  })
})
