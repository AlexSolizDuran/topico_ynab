import { describe, expect, it } from 'vitest'
import { aCentimos, deCentimos, calcularVariacion } from '@/patrimonio/calculos'
import {
  detectarAfectacionHistorica,
  esPeriodoCerrado,
  normalizarPeriodo,
  MENSAJE_HISTORIA_MODIFICADA,
} from '@/patrimonio/retroactividad'

describe('100: cálculos puros de patrimonio y regla del dinero', () => {
  describe('aCentimos y deCentimos (aritmética exacta con BigInt)', () => {
    it('convierte montos positivos y negativos sin float', () => {
      expect(aCentimos('0.00')).toBe(0n)
      expect(aCentimos('100.50')).toBe(10050n)
      expect(aCentimos('-50.25')).toBe(-5025n)
      expect(aCentimos('22000.00')).toBe(2200000n)
    })

    it('soporta números muy grandes sin pérdida de precisión', () => {
      const granMonto = '1234567890123456.78'
      expect(deCentimos(aCentimos(granMonto))).toBe(granMonto)
    })

    it('formatea de centimos a Dinero con 2 decimales y signo exacto', () => {
      expect(deCentimos(0n)).toBe('0.00')
      expect(deCentimos(5n)).toBe('0.05')
      expect(deCentimos(200000n)).toBe('2000.00')
      expect(deCentimos(-300000n)).toBe('-3000.00')
    })
  })

  describe('calcularVariacion (R2: evolución mes a mes)', () => {
    it('R2: el primer periodo sin comparación previa entrega valores nulos', () => {
      const resultado = calcularVariacion('28000.00', null)
      expect(resultado.diferencia_absoluta).toBeNull()
      expect(resultado.variacion_porcentual).toBeNull()
      expect(resultado.porcentaje_texto).toBeNull()
    })

    it('R2: calcula variación positiva entre periodos (de 28,000 a 30,000 -> +2,000 y +7.14%)', () => {
      // WHEN el patrimonio pasó de 28,000 a 30,000
      // THEN el sistema informa un aumento de 2,000 y su porcentaje respecto al periodo anterior
      const resultado = calcularVariacion('30000.00', '28000.00')
      expect(resultado.diferencia_absoluta).toBe('2000.00')
      expect(resultado.variacion_porcentual).toBe(7.14)
      expect(resultado.porcentaje_texto).toBe('+7.14%')
    })

    it('R2: calcula variación negativa entre periodos (de 30,000 a 27,000 -> -3,000 y -10.00%)', () => {
      const resultado = calcularVariacion('27000.00', '30000.00')
      expect(resultado.diferencia_absoluta).toBe('-3000.00')
      expect(resultado.variacion_porcentual).toBe(-10)
      expect(resultado.porcentaje_texto).toBe('-10.00%')
    })

    it('R2: calcula variación 0 cuando no hay cambio', () => {
      const resultado = calcularVariacion('15000.00', '15000.00')
      expect(resultado.diferencia_absoluta).toBe('0.00')
      expect(resultado.variacion_porcentual).toBe(0)
      expect(resultado.porcentaje_texto).toBe('0.00%')
    })

    it('maneja caso especial donde el periodo anterior tenía patrimonio 0.00', () => {
      const resultado = calcularVariacion('5000.00', '0.00')
      expect(resultado.diferencia_absoluta).toBe('5000.00')
      expect(resultado.variacion_porcentual).toBeNull()
      expect(resultado.porcentaje_texto).toBeNull()
    })
  })

  describe('retroactividad (R3)', () => {
    it('normaliza fechas y periodos a formato YYYY-MM', () => {
      expect(normalizarPeriodo('2026-03-15')).toBe('2026-03')
      expect(normalizarPeriodo('2026-06')).toBe('2026-06')
    })

    it('identifica correctamente si una fecha/periodo pertenece a un periodo cerrado', () => {
      const mesActual = '2026-06'
      expect(esPeriodoCerrado('2026-03-15', mesActual)).toBe(true)
      expect(esPeriodoCerrado('2026-05', mesActual)).toBe(true)
      expect(esPeriodoCerrado('2026-06-01', mesActual)).toBe(false)
      expect(esPeriodoCerrado('2026-07', mesActual)).toBe(false)
    })

    it('emite el aviso normativo cuando una operación altera un periodo cerrado', () => {
      const mesActual = '2026-06'
      const deteccionPasado = detectarAfectacionHistorica('2026-03-20', mesActual)
      expect(deteccionPasado.historiaModificada).toBe(true)
      expect(deteccionPasado.aviso).toBe(MENSAJE_HISTORIA_MODIFICADA)

      const deteccionActual = detectarAfectacionHistorica('2026-06-10', mesActual)
      expect(deteccionActual.historiaModificada).toBe(false)
      expect(deteccionActual.aviso).toBeUndefined()
    })
  })
})
