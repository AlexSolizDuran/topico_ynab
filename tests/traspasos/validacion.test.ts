import { describe, expect, it } from 'vitest'
import {
  ErroresDeTraspaso,
  destinoComoId,
  validarAlta,
  validarEdicion,
} from '@/traspasos/validacion'

/**
 * `070` tareas 6.1 y 6.2: la validacion del formulario.
 *
 * El motivo de que estas pruebas vivan aparte del repositorio es que el fallo que胜过 es
 * **invisible desde afuera**. Si `abc` llegara al `BigInt` de `enCentimos`, el usuario veria
 * un error 500 y no un campo marcado. Por eso lo que se prueba aca es que un texto que no es
 * numero **no revienta**, y encima llega al campo correcto.
 */

const BASE = {
  origen_cuenta_id: '1',
  destino_cuenta_id: '2',
  monto: '500.00',
  fecha: '2026-03-10',
  descripcion: 'Ahorro de marzo',
  comercio: '',
}

function camposDe(datos: unknown): Record<string, string> {
  try {
    validarAlta(datos)
  } catch (error) {
    if (error instanceof ErroresDeTraspaso) return error.campos
    throw error
  }
  throw new Error('se esperaba un ErroresDeTraspaso')
}

describe('070: el importe se valida como texto', () => {
  it('acepta un importe normal, con y sin decimales y con signo', () => {
    for (const monto of ['500', '500.5', '500.50', '-500.00', '0.01', '1234567.89']) {
      expect(validarAlta({ ...BASE, monto }).monto).toBe(monto)
    }
  })

  it('rechaza `abc` como error de validacion, sin lanzar', () => {
    // Lo importante es que devuelva un error y no una `SyntaxError` de `BigInt('abc')`. Un
    // throw inesperado seria un 500.
    expect(camposDe({ ...BASE, monto: 'abc' }).monto).toBe(
      'El importe es un numero, por ejemplo 1500 o 1500.50.',
    )
  })

  it('rechaza `1.234`, que parece un numero pero no lo es en este formato', () => {
    // El punto es separador de miles para quien escribe, no decimal. Aceptarlo seria guardar
    // 1234 cuando el usuario quiso 1.234, y el usuario no veria el error nunca.
    expect(camposDe({ ...BASE, monto: '1.234' }).monto).toBeDefined()
  })

  it('rechaza tres decimales', () => {
    expect(camposDe({ ...BASE, monto: '500.001' }).monto).toBeDefined()
  })

  it('rechaza un numero con mas de 14 digitos enteros, por el tope de numeric(16,2)', () => {
    expect(camposDe({ ...BASE, monto: '100000000000000.00' }).monto).toBe(
      'El importe no puede pasar de 99999999999999.99.',
    )
  })

  it('rechaza el cero, y da el mensaje del cero y no el del formato', () => {
    for (const monto of ['0', '0.00', '-0.00', '0.0']) {
      expect(camposDe({ ...BASE, monto }).monto).toBe('El importe debe ser distinto de cero.')
    }
  })

  it('acepta exactamente el tope, sin rechazarlo por un decimal de mas', () => {
    expect(validarAlta({ ...BASE, monto: '99999999999999.99' }).monto).toBe('99999999999999.99')
  })
})

describe('070: la fecha', () => {
  it('acepta un dia que existe y rechaza uno que no', () => {
    expect(validarAlta({ ...BASE, fecha: '2026-03-31' }).fecha).toBe('2026-03-31')
    expect(camposDe({ ...BASE, fecha: '2026-02-31' }).fecha).toBe(
      'La fecha es un dia, por ejemplo 2026-03-31.',
    )
    expect(camposDe({ ...BASE, fecha: '10/03/2026' }).fecha).toBeDefined()
  })
})

describe('070: origen y destino tienen que ser distintas', () => {
  it('rechaza el mismo id en las dos cuentas', () => {
    // Un traspaso a si mismo no empareja nada: las dos patas caerian en la misma cuenta y se
    // anularian entre si. El error cuelga de la cuenta de origen, que es donde el usuario
    // tiene que corregir.
    expect(camposDe({ ...BASE, origen_cuenta_id: '7', destino_cuenta_id: '7' })).toMatchObject({
      origen_cuenta_id: 'Elige dos cuentas distintas: un traspaso a si mismo no mueve nada.',
    })
  })

  it('no se confunde con el mismo nombre: lo que importa es el id', () => {
    expect(validarAlta({ ...BASE, origen_cuenta_id: '7', destino_cuenta_id: '8' })).toMatchObject(
      { origen_cuenta_id: '7', destino_cuenta_id: '8' },
    )
  })

  it('acepta destino vacio, que es el traspaso de una sola pata', () => {
    // R1 lo permite con aviso. Si el esquema lo rechazara, esa operacion no tendria forma de
    // escribirse y el aviso de D6 no tendria de que hablar.
    expect(validarAlta({ ...BASE, destino_cuenta_id: '' }).destino_cuenta_id).toBe('')
  })

  it('rechaza un destino que no es un id', () => {
    expect(camposDe({ ...BASE, destino_cuenta_id: 'abc' }).destino_cuenta_id).toBe(
      'Esa cuenta de destino no existe en esta cartera.',
    )
  })

  it('la edicion aplica la misma regla', () => {
    const datos = { ...BASE, origen_cuenta_id: '3', destino_cuenta_id: '3' }
    expect(() => validarEdicion(datos)).toThrow(ErroresDeTraspaso)
  })
})

describe('070: campos que no son del traspaso', () => {
  it('exige origen, importe, fecha y descripcion', () => {
    for (const campo of ['origen_cuenta_id', 'monto', 'fecha', 'descripcion'] as const) {
      const datos: Record<string, unknown> = { ...BASE }
      delete datos[campo]
      expect(camposDe(datos)).toHaveProperty(campo)
    }
  })

  it('rechaza una descripcion vacia', () => {
    expect(camposDe({ ...BASE, descripcion: '   ' }).descripcion).toBe(
      'La descripcion no puede estar vacia.',
    )
  })

  it('acepta comercio ausente y lo deja en cadena vacia para el repositorio', () => {
    expect(validarAlta({ ...BASE, comercio: '  ' }).comercio).toBe('')
  })
})

describe('070: la traduccion del destino', () => {
  it('vacio se vuelve `null`, y un id se vuelve numero', () => {
    expect(destinoComoId('')).toBeNull()
    expect(destinoComoId('42')).toBe(42)
  })
})
