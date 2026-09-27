import { describe, expect, it } from 'vitest'
import { EnteroInvalido, aEntero, exigirEntero } from '@/enteros'

/**
 * `src/enteros.ts` es el unico modulo exento de la prohibicion de `Number`, asi que
 * sus bordes tienen que estar cubiertos: es la unica conversion de texto a entero de
 * todo el codigo de la aplicacion.
 */

describe('enteros', () => {
  it('convierte lo que es un entero y devuelve null para lo que no', () => {
    expect(aEntero('7')).toBe(7)
    expect(aEntero('0')).toBe(0)
    expect(aEntero(' 42 ')).toBe(42)
    expect(aEntero('999999999999999')).toBe(999999999999999)

    for (const crudo of ['', ' ', 'abc', '7.5', '7px', '1e3', '0x10', '7; drop', '+7', '--1', '١٢٣']) {
      expect(aEntero(crudo), `deberia rechazar ${JSON.stringify(crudo)}`).toBeNull()
    }
    expect(aEntero(null)).toBeNull()
    expect(aEntero(undefined)).toBeNull()
  })

  it('rechaza un entero mas largo que el entero seguro, en vez de perder precision', () => {
    // 16 digitos caben en el entero seguro; el patron corta en 15 por margen.
    expect(aEntero('1000000000000000')).toBeNull()
    expect(aEntero('99999999999999999999999')).toBeNull()
  })

  it('un id de url no puede ser un importe disfrazado', () => {
    // `1e400` es Infinity y `NaN` es NaN como numero: por eso el corte es de forma
    // antes de convertir, y no "es un numero" despues.
    expect(aEntero('Infinity')).toBeNull()
    expect(aEntero('NaN')).toBeNull()
    expect(aEntero('-1')).toBe(-1)
  })

  it('exigirEntero lanza con el nombre del campo, y eso lo puede pintar el formulario', () => {
    expect(exigirEntero('3', 'orden')).toBe(3)
    try {
      exigirEntero('tres', 'orden')
      expect.unreachable('deberia lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(EnteroInvalido)
      expect((error as EnteroInvalido).message).toContain('orden')
    }
  })
})
