import { describe, expect, it } from 'vitest'
import { esCero, esNegativo, formatear, paraCampo, signoDe } from '@/dinero'
import type { Dinero } from '@/dinero'

describe('formatear', () => {
  it('conserva los centavos en magnitudes donde un float los pierde', () => {
    // El caso medido del proyecto: Number('1234567890123456.78') -> ...56.75
    expect(formatear('1234567890123456.78', 'MXN')).toBe('$1,234,567,890,123,456.78')
  })

  it('no deforma el importe por pasar el string a Intl', () => {
    expect(formatear('9999999999999999.99', 'MXN')).toBe('$9,999,999,999,999,999.99')
  })

  it('coincide con Intl en el rango donde el double es exacto', () => {
    const importe: Dinero = '1234.56'
    const esperado = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(1234.56)
    expect(formatear(importe, 'MXN')).toBe(esperado)
  })

  it('antepone el signo menos fuera del simbolo', () => {
    expect(formatear('-450.00', 'MXN')).toBe('-$450.00')
  })

  it('preserva el signo de un importe negativo grande', () => {
    // en es-MX el codigo de moneda va con espacio duro (U+00A0) delante.
    expect(formatear('-9999999999999999.99', 'USD')).toBe('-USD\u00a09,999,999,999,999,999.99')
  })

  it('completa a dos decimales un importe que viene con uno solo', () => {
    expect(formatear('100.5', 'MXN')).toContain('100.50')
  })

  it('usa la moneda pedida', () => {
    expect(formatear('1000.00', 'USD')).toBe(formatear('1000.00', 'USD'))
    expect(formatear('1000.00', 'USD')).not.toBe(formatear('1000.00', 'MXN'))
  })
})

describe('paraCampo', () => {
  it('devuelve el importe sin simbolo ni separador de miles', () => {
    expect(paraCampo('1234567.80')).toBe('1234567.80')
  })

  it('conserva el signo', () => {
    expect(paraCampo('-0.01')).toBe('-0.01')
  })
})

describe('signos y cero', () => {
  it('reconoce un importe negativo', () => {
    expect(esNegativo('-400.00')).toBe(true)
    expect(esNegativo('400.00')).toBe(false)
  })

  it('reconoce el cero con signo o sin signo', () => {
    expect(esCero('0.00')).toBe(true)
    expect(esCero('0')).toBe(true)
    expect(esCero('0.01')).toBe(false)
  })

  it('antepone mas solo a los importes positivos distintos de cero', () => {
    expect(signoDe('5000.00')).toBe('+')
    expect(signoDe('-5000.00')).toBe('-')
    expect(signoDe('0.00')).toBe('')
  })
})
