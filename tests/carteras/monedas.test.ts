import { describe, expect, it } from 'vitest'
import {
  MONEDAS_CONOCIDAS,
  MonedaDistinta,
  MonedaInmutable,
  esCodigoMoneda,
  exigirMismaMoneda,
} from '../../src/carteras/monedas'
import {
  CarterasDistintas,
  carteraDeCuenta,
  exigirMismaCartera,
} from '../../src/carteras/propiedad'

describe('codigos de moneda', () => {
  it('acepta cualquier ISO 4217 de tres letras, sin lista cerrada', () => {
    expect(esCodigoMoneda('MXN')).toBe(true)
    expect(esCodigoMoneda('BOB')).toBe(true)
  })

  it('rechaza minusculas, espacios y longitudes distintas', () => {
    expect(esCodigoMoneda('mxn')).toBe(false)
    expect(esCodigoMoneda('MX')).toBe(false)
    expect(esCodigoMoneda('MXNX')).toBe(false)
    expect(esCodigoMoneda('M X')).toBe(false)
  })

  it('ofrece monedas en el selector sin que la lista sea la puerta de entrada', () => {
    expect(MONEDAS_CONOCIDAS).toContain('MXN')
    expect(new Set(MONEDAS_CONOCIDAS).size).toBe(MONEDAS_CONOCIDAS.length)
    expect(MONEDAS_CONOCIDAS.every(esCodigoMoneda)).toBe(true)
  })
})

describe('la moneda de una cartera no se cambia', () => {
  it('el error explica que solo se define al crear', () => {
    const error = new MonedaInmutable()

    expect(error.message).toMatch(/solo puede definirse al crear/i)
  })
})

describe('comparar monedas', () => {
  it('deja pasar dos carteras de la misma moneda', () => {
    expect(() =>
      exigirMismaMoneda({ moneda: 'MXN' }, { moneda: 'MXN' }),
    ).not.toThrow()
  })

  it('rechaza dos carteras de distinta moneda y nombra las dos', () => {
    const error = (() => {
      try {
        exigirMismaMoneda({ moneda: 'MXN' }, { moneda: 'USD' })
        return undefined
      } catch (e) {
        return e as MonedaDistinta
      }
    })()

    expect(error).toBeInstanceOf(MonedaDistinta)
    expect(error?.moneda_origen).toBe('MXN')
    expect(error?.moneda_destino).toBe('USD')
    expect(error?.message).toContain('MXN')
    expect(error?.message).toContain('USD')
  })

  it('explica que el motivo es la falta de conversion, no una falta de permiso', () => {
    const error = new MonedaDistinta('MXN', 'USD')

    expect(error.message).toMatch(/no hace conversion/i)
  })
})

describe('la cartera de un movimiento viene de su cuenta', () => {
  it('se deduce, sin que el movimiento la declare', () => {
    expect(carteraDeCuenta({ cartera_id: 7 })).toBe(7)
  })

  it('no acepta una cartera propia, porque no se declara en ningun lado', () => {
    const movimiento = { cuenta_id: 3, importe: '10.00' } as Record<string, unknown>

    expect(movimiento).not.toHaveProperty('cartera_id')
  })
})

describe('no se mezclan carteras', () => {
  it('deja pasar una cuenta y un sobre de la misma cartera', () => {
    expect(() => exigirMismaCartera({ cartera_id: 1 }, { cartera_id: 1 })).not.toThrow()
  })

  it('rechaza una cuenta de una cartera con un sobre de otra, y nombra las dos', () => {
    const error = (() => {
      try {
        exigirMismaCartera({ cartera_id: 1 }, { cartera_id: 2 })
        return undefined
      } catch (e) {
        return e as CarterasDistintas
      }
    })()

    expect(error).toBeInstanceOf(CarterasDistintas)
    expect(error?.cartera_una).toBe(1)
    expect(error?.cartera_otra).toBe(2)
  })

  it('compara la cartera deducida, no una que se le pasa por separado', () => {
    const cuenta = { cartera_id: 4 }

    expect(() =>
      exigirMismaCartera(cuenta, { cartera_id: carteraDeCuenta(cuenta) }),
    ).not.toThrow()
  })
})
