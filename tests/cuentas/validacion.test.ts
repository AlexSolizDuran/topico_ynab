import { describe, expect, it } from 'vitest'
import {
  MAXIMO_IMPORTE,
  NOMBRE_CUENTA_MAXIMO,
  TIPOS_DE_CUENTA,
  ErroresDeCuenta,
  saldoEnCampo,
  validarCuenta,
  validarRenombre,
  validarSaldoInicial,
} from '@/cuentas/validacion'

/**
 * Validacion de entrada de cuentas.
 *
 * El foco es que `saldo_inicial` siga siendo un TEXTO de punta a punta. Estas pruebas
 * fallarian si alguien cambiara el esquema por `z.coerce.number()`, que es el error
 * clasico de la regla del dinero: el numero ya entra convertido y los centavos
 * grandes ya se perdieron antes de que la validacion pueda verlo.
 */

const alta = (extra: Record<string, string> = {}) => ({
  nombre: 'Corriente',
  tipo: 'corriente',
  saldo_inicial: '1500.50',
  ...extra,
})

describe('validacion de cuentas', () => {
  it('acepta los cuatro tipos de cuenta', () => {
    expect([...TIPOS_DE_CUENTA]).toEqual(['corriente', 'ahorro', 'efectivo', 'credito'])
    for (const tipo of TIPOS_DE_CUENTA) {
      expect(validarCuenta(alta({ tipo })).tipo).toBe(tipo)
    }
  })

  it('devuelve el saldo inicial como string, nunca como numero', () => {
    const saldo = validarCuenta(alta({ saldo_inicial: '12345678901234.56' })).saldo_inicial
    expect(typeof saldo).toBe('string')
    expect(saldo).toBe('12345678901234.56')
  })

  it('acepta un saldo negativo, porque una tarjeta debe poder deber', () => {
    expect(validarCuenta(alta({ saldo_inicial: '-600' })).saldo_inicial).toBe('-600')
  })

  it('acepta hasta el tope de numeric(16,2) y rechaza un centimo mas', () => {
    expect(validarCuenta(alta({ saldo_inicial: MAXIMO_IMPORTE })).saldo_inicial).toBe(
      MAXIMO_IMPORTE,
    )
    expect(esperaCampos(() => validarCuenta(alta({ saldo_inicial: '100000000000000.00' })), 'saldo_inicial')).toMatch(
      /no puede pasar de/,
    )
  })

  it('el tope se comprueba sin convertir, porque el float ya habria perdido un centimo', () => {
    // El mismo string pasa por la validacion intacto, y por `Number` no: el float mas
    // cercano al tope es 99999999999999.98. Comparar el limite despues de convertir
    // admitiria un centimo que Postgres va a rechazar.
    const exacta = validarCuenta(alta({ saldo_inicial: MAXIMO_IMPORTE })).saldo_inicial
    expect(exacta).toBe('99999999999999.99')
    expect(Number(exacta).toFixed(2)).toBe('99999999999999.98')
    expect(BigInt(exacta.replace('.', ''))).toBe(9999999999999999n)
  })

  it('rechaza un importe mal formado y lo dice como importe', () => {
    for (const saldo of ['', 'abc', '1.234', '1000.555', '1000.', '1e5', '$10', '1,5', ' ']) {
      const mensaje = esperaCampos(() => validarCuenta(alta({ saldo_inicial: saldo })), 'saldo_inicial')
      expect(mensaje, `deberia rechazar ${JSON.stringify(saldo)}`).toBeTruthy()
    }
    expect(esperaCampos(() => validarCuenta(alta({ saldo_inicial: '1.234' })), 'saldo_inicial')).toMatch(
      /importe/i,
    )
  })

  it('rechaza un nombre vacio o demasiado largo', () => {
    expect(esperaCampos(() => validarCuenta(alta({ nombre: '   ' })), 'nombre')).toMatch(/vacio/i)
    expect(esperaCampos(() => validarCuenta(alta({ nombre: 'a'.repeat(61) })), 'nombre')).toMatch(
      new RegExp(String(NOMBRE_CUENTA_MAXIMO)),
    )
    expect(validarCuenta(alta({ nombre: 'a'.repeat(60) })).nombre).toHaveLength(60)
  })

  it('saca los espacios del nombre y del importe, en vez de rechazarlos', () => {
    const cuenta = validarCuenta(alta({ nombre: '  Corriente  ', saldo_inicial: ' 1500.50 ' }))
    expect(cuenta.nombre).toBe('Corriente')
    expect(cuenta.saldo_inicial).toBe('1500.50')
  })

  it('rechaza un tipo que no existe', () => {
    expect(esperaCampos(() => validarCuenta(alta({ tipo: 'cripto' })), 'tipo')).toBeTruthy()
  })

  it('el ajuste de saldo valida el importe sin exigir nombre ni tipo', () => {
    expect(validarSaldoInicial({ saldo_inicial: '42.07' })).toEqual({ saldo_inicial: '42.07' })
    expect(esperaCampos(() => validarSaldoInicial({}), 'saldo_inicial')).toBeTruthy()
  })

  it('el renombre valida el nombre y nada mas', () => {
    expect(validarRenombre({ nombre: ' Ahorro ' })).toEqual({ nombre: 'Ahorro' })
    expect(esperaCampos(() => validarRenombre({ nombre: '' }), 'nombre')).toBeTruthy()
  })

  it('los errores traen un mensaje por campo, para pintar el formulario', () => {
    try {
      validarCuenta(alta({ nombre: '', tipo: 'cripto' }))
      expect.unreachable('deberia lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(ErroresDeCuenta)
      expect((error as ErroresDeCuenta).message).toBe('Los datos enviados no son validos.')
      expect(Object.keys((error as ErroresDeCuenta).campos).sort()).toEqual(['nombre', 'tipo'])
    }
  })

  it('el campo del formulario ve el importe sin simbolo ni separador de miles', () => {
    expect(saldoEnCampo('1500.50')).toBe('1500.50')
    expect(saldoEnCampo('-600.00')).toBe('-600.00')
  })
})

function esperaCampos(correr: () => unknown, campo: string): string {
  try {
    correr()
  } catch (error) {
    if (error instanceof ErroresDeCuenta) return error.campos[campo] ?? ''
    throw error
  }
  return ''
}
