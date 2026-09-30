/**
 * 060-transacciones, grupo 2: la validacion de entrada.
 *
 * Estas pruebas no tocan la base: son la frontera que decide si lo que escribio la persona
 * llega al repositorio. Hay tres cosas que importan mas que el resto y por eso tienen
 * pruebas propias:
 *
 * - **El importe se valida como texto.** El fallo que se evita es un `BigInt('abc')` que
 *   lanza `SyntaxError` en vez de devolver un error que el formulario sepa pintar.
 * - **El cero se rechaza** (R1), y `"0"`, `"0.00"` y `"-0.00"` son el mismo error.
 * - **La fecha es un dia que existe.** El regex de la forma acepta el 31 de febrero.
 */
import { describe, expect, it } from 'vitest'
import {
  ErroresDeMovimiento,
  validarAlta,
  validarAsignacionSobre,
  validarEdicion,
  validarFiltro,
} from '@/transacciones/validacion'

/** Una alta valida, con lo minimo que hay que mandar. */
function alta(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cuenta_id: '1',
    sobre_id: '',
    monto: '450',
    fecha: '2026-03-15',
    descripcion: 'Uber a casa',
    comercio: '',
    ...cambios,
  }
}

/** El primer mensaje de un campo, o `undefined` si el parseo paso. */
function mensajeDe(campo: string, datos: unknown): string | undefined {
  try {
    validarAlta(datos)
    return undefined
  } catch (error) {
    if (error instanceof ErroresDeMovimiento) return error.campos[campo]
    throw error
  }
}

describe('060: el importe se valida como texto', () => {
  it('acepta un importe con signo y hasta dos decimales', () => {
    expect(validarAlta(alta({ monto: '1500.50' })).monto).toBe('1500.50')
    expect(validarAlta(alta({ monto: '-450' })).monto).toBe('-450')
    expect(validarAlta(alta({ monto: '-0.01' })).monto).toBe('-0.01')
  })

  it('rechaza un texto que no es numero, sin lanzar SyntaxError', () => {
    // El fallo que este chequeo evita: si la forma y el rango estuvieran en dos
    // validaciones separadas, `abc` pasaria al rango y llegaria a `BigInt('abc')`, que
    // lanza. Aca vuelve un error de validacion, que es lo que el formulario sabe pintar.
    expect(() => validarAlta(alta({ monto: 'abc' }))).toThrow(ErroresDeMovimiento)
    expect(mensajeDe('monto', alta({ monto: 'abc' }))).toBe(
      'El importe es un numero, por ejemplo 1500 o 1500.50.',
    )
  })

  it('rechaza el separador de miles: 1.234 no es un importe', () => {
    // `1.234` tiene tres decimales, asi que la forma lo rechaza antes que el rango: es el
    // texto que un usuario escribe al copiar un importe de miles con su separador local.
    expect(() => validarAlta(alta({ monto: '1.234' }))).toThrow(ErroresDeMovimiento)
  })

  it('rechaza un numero con mas de 14 digitos enteros', () => {
    // 14 digitos es el tope de `numeric(16,2)` con dos decimales. El 15 digito entero
    // pasaria a un `number` sin quejarse, y por ahi se pierde el dato.
    expect(() => validarAlta(alta({ monto: '123456789012345' }))).toThrow(ErroresDeMovimiento)
    expect(mensajeDe('monto', alta({ monto: '123456789012345' }))).toContain(
      '99999999999999.99',
    )
    // Y el de 14 digitos entra.
    expect(validarAlta(alta({ monto: '99999999999999.99' })).monto).toBe('99999999999999.99')
  })

  it('rechaza tres decimales y los signos raros', () => {
    for (const monto of ['450.123', '+450', '450-', '1e3', '450 000', '']) {
      expect(() => validarAlta(alta({ monto }))).toThrow(ErroresDeMovimiento)
    }
  })

  it('recorta los espacios antes de mirar el importe', () => {
    expect(validarAlta(alta({ monto: '  450.00  ' })).monto).toBe('450.00')
  })

  it('el signo lo acepta siempre: decidir que significa es del repositorio', () => {
    // Un negativo es un gasto o la correccion de un ingreso. Que sea negativo es
    // informacion, y solo el repositorio sabe de que operacion se trata. Ver D9.
    expect(validarAlta(alta({ monto: '-450' })).monto).toBe('-450')
    expect(validarAlta(alta({ monto: '450' })).monto).toBe('450')
  })
})

describe('060: el importe cero se rechaza', () => {
  it('rechaza el cero y lo dice con el mensaje de R1', () => {
    expect(mensajeDe('monto', alta({ monto: '0' }))).toBe('El importe debe ser distinto de cero.')
  })

  it('"0", "0.00" y "-0.00" dan el mismo error', () => {
    // Los tres son un movimiento que no mueve nada. Que el mensaje sea el mismo es lo que
    // le dice al usuario que el problema es el valor y no como lo escribio.
    const mensajes = ['0', '0.00', '-0.00', '-0', '0.0', '  0.00  '].map((monto) =>
      mensajeDe('monto', alta({ monto })),
    )

    expect(new Set(mensajes).size).toBe(1)
    expect(mensajes[0]).toBe('El importe debe ser distinto de cero.')
  })

  it('un centimo de mas o de menos si se acepta', () => {
    expect(() => validarAlta(alta({ monto: '0.01' }))).not.toThrow()
    expect(() => validarAlta(alta({ monto: '-0.01' }))).not.toThrow()
  })

  it('el error del cero no tapa el de la forma', () => {
    expect(mensajeDe('monto', alta({ monto: 'abc' }))).not.toBe(
      'El importe debe ser distinto de cero.',
    )
  })
})

describe('060: la fecha es un dia que existe', () => {
  it('acepta AAAA-MM-DD con el dia real', () => {
    expect(validarAlta(alta({ fecha: '2026-03-31' })).fecha).toBe('2026-03-31')
    expect(validarAlta(alta({ fecha: '2026-02-28' })).fecha).toBe('2026-02-28')
  })

  it('rechaza el 31 de febrero, que la forma sola acepta', () => {
    // El regex de la forma no distingue: `2026-02-31` lo cumple. Lo que lo rechaza es que
    // al armarla con `Date.UTC` el dia se corra a marzo.
    expect(() => validarAlta(alta({ fecha: '2026-02-31' }))).toThrow(ErroresDeMovimiento)
    expect(mensajeDe('fecha', alta({ fecha: '2026-02-31' }))).toBe(
      'La fecha es un dia, por ejemplo 2026-03-31.',
    )
  })

  it('rechaza los dias que no existen en su mes', () => {
    for (const fecha of ['2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31']) {
      expect(() => validarAlta(alta({ fecha }))).toThrow(ErroresDeMovimiento)
    }
  })

  it('acepta el 29 de febrero en un ano bisiesto', () => {
    expect(() => validarAlta(alta({ fecha: '2028-02-29' }))).not.toThrow()
    // Y 2026 no lo es, asi que el mismo dia en este ano no existe.
    expect(() => validarAlta(alta({ fecha: '2026-02-29' }))).toThrow(ErroresDeMovimiento)
  })

  it('rechaza las formas que no son AAAA-MM-DD', () => {
    for (const fecha of ['15/03/2026', '2026-3-15', '2026-03', '20260315', '', 'ayer']) {
      expect(() => validarAlta(alta({ fecha }))).toThrow(ErroresDeMovimiento)
    }
  })

  it('rechaza un mes fuera de rango', () => {
    expect(() => validarAlta(alta({ fecha: '2026-13-01' }))).toThrow(ErroresDeMovimiento)
    expect(() => validarAlta(alta({ fecha: '2026-00-10' }))).toThrow(ErroresDeMovimiento)
  })

  it('la fecha no lleva hora: el dia local ya esta resuelto', () => {
    // Ver D8: guardar el `23:30` del 31 de marzo como `2026-03-31` es exactamente lo que
    // R7 pide. Una hora en el dato seria una segunda fuente de verdad para el periodo.
    expect(() => validarAlta(alta({ fecha: '2026-03-31T23:30:00' }))).toThrow(ErroresDeMovimiento)
  })

  it('recorta los espacios de la fecha', () => {
    expect(validarAlta(alta({ fecha: '  2026-03-15  ' })).fecha).toBe('2026-03-15')
  })
})

describe('060: los limites de descripcion y comercio', () => {
  it('la descripcion es obligatoria y no puede pasar de 255', () => {
    expect(() => validarAlta(alta({ descripcion: '   ' }))).toThrow(ErroresDeMovimiento)
    expect(() => validarAlta(alta({ descripcion: 'x'.repeat(255) }))).not.toThrow()
    expect(() => validarAlta(alta({ descripcion: 'x'.repeat(256) }))).toThrow(ErroresDeMovimiento)
  })

  it('el limite de 255 es el de la columna, no un numero inventado', async () => {
    // Si el esquema y la columna se desincronizan, el `insert` falla con un error de
    // Postgres que el usuario no puede entender. El limite vive en los dos lados.
    const { readFile } = await import('node:fs/promises')
    const fuente = await readFile('src/db/tablas/cuentas.ts', 'utf8')

    expect(fuente).toMatch(/descripcion: varchar\('descripcion', \{ length: 255 \}\)/)
    expect(fuente).toMatch(/comercio: varchar\('comercio', \{ length: 120 \}\)/)
  })

  it('el comercio es opcional y no puede pasar de 120', () => {
    expect(() => validarAlta(alta({ comercio: '' }))).not.toThrow()
    expect(() => validarAlta(alta({ comercio: 'x'.repeat(120) }))).not.toThrow()
    expect(() => validarAlta(alta({ comercio: 'x'.repeat(121) }))).toThrow(ErroresDeMovimiento)
  })

  it('recorta los espacios de la descripcion y del comercio', () => {
    const datos = validarAlta(alta({ descripcion: '  Uber a casa  ', comercio: '  Uber  ' }))
    expect(datos.descripcion).toBe('Uber a casa')
    expect(datos.comercio).toBe('Uber')
  })
})

describe('060: los cuatro esquemas', () => {
  it('el alta exige la cuenta, y el sobre y el comercio son opcionales', () => {
    // `cuenta_id` es obligatorio porque es lo que deduce la cartera. Ver R10 y D2.
    expect(() => validarAlta(alta({ cuenta_id: '' }))).toThrow(ErroresDeMovimiento)
    expect(validarAlta(alta({ cuenta_id: '7' })).cuenta_id).toBe('7')

    // Sin sobre es una peticion valida: es el movimiento pendiente de R2.
    expect(validarAlta(alta({ sobre_id: '' })).sobre_id).toBe('')
    expect(validarAlta(alta({ comercio: '' })).comercio).toBe('')
  })

  it('el alta acepta un sobre y un tipo', () => {
    const datos = validarAlta(alta({ sobre_id: '3', tipo: 'gasto', monto: '-450' }))
    expect(datos.sobre_id).toBe('3')
    expect(datos.tipo).toBe('gasto')
  })

  it('el alta rechaza un tipo que no existe', () => {
    expect(() => validarAlta(alta({ tipo: 'devolucion' }))).toThrow(ErroresDeMovimiento)
  })

  it('la edicion repite los campos del alta', () => {
    expect(() => validarEdicion(alta({ cuenta_id: '' }))).toThrow(ErroresDeMovimiento)
    expect(() => validarEdicion(alta({ monto: '0' }))).toThrow(ErroresDeMovimiento)
    expect(validarEdicion(alta({ cuenta_id: '2', monto: '-380' })).monto).toBe('-380')
  })

  it('asignar sobre es un solo campo, y vacio significa quitarlo', () => {
    expect(validarAsignacionSobre({ sobre_id: '3' }).sobre_id).toBe('3')
    expect(validarAsignacionSobre({ sobre_id: '' }).sobre_id).toBe('')
    expect(() => validarAsignacionSobre({ sobre_id: 'cero' })).toThrow(ErroresDeMovimiento)
  })

  it('el filtro acepta todo vacio, que es "sin filtros"', () => {
    const filtro = validarFiltro({})
    expect(filtro).toEqual({
      texto: '',
      cuenta_id: '',
      sobre_id: '',
      desde: '',
      hasta: '',
    })
  })

  it('el filtro combina texto, cuenta, sobre, tipo y rango de fechas', () => {
    const filtro = validarFiltro({
      texto: 'uber',
      cuenta_id: '2',
      sobre_id: '3',
      tipo: 'gasto',
      desde: '2026-05-01',
      hasta: '2026-05-31',
    })

    expect(filtro).toMatchObject({
      texto: 'uber',
      cuenta_id: '2',
      sobre_id: '3',
      tipo: 'gasto',
      desde: '2026-05-01',
      hasta: '2026-05-31',
    })
  })

  it('el filtro rechaza una fecha imposible tambien en los extremos del rango', () => {
    expect(() => validarFiltro({ desde: '2026-02-31' })).toThrow(ErroresDeMovimiento)
    expect(() => validarFiltro({ hasta: '2026-13-01' })).toThrow(ErroresDeMovimiento)
    // Un extremo vacio es "sin limite", que es distinto de "una fecha invalida".
    expect(() => validarFiltro({ desde: '', hasta: '' })).not.toThrow()
  })
})
