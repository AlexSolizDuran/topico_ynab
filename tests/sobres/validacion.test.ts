import { describe, expect, it } from 'vitest'
import {
  MAXIMO_IMPORTE,
  NOMBRE_SOBRE_MAXIMO,
  ErroresDeSobre,
  importeEnCampo,
  validarAsignacion,
  validarCambioDeGrupo,
  validarCorreccion,
  validarMover,
  validarNuevoSobre,
  validarOperacion,
  validarOrden,
  validarRenombre,
  validarTapar,
} from '@/sobres/validacion'

/**
 * Validacion de entrada de `sobres`.
 *
 * El foco es que los importes sigan siendo TEXTO de punta a punta, y que el tope de
 * `numeric(16,2)` se compruebe sin convertir. Estas pruebas fallarian si alguien
 * cambiara el esquema por `z.coerce.number()`: el numero entra convertido, y para un
 * importe de 14 digitos los centavos ya se perdieron antes de que la validacion viera el
 * valor. La prueba del tope lo muestra comparando contra `Number` a proposito, porque
 * esa comparacion es justamente el error que se quiere cazar.
 *
 * El recorte de espacios tambien tiene una regla: se limpian, no se rechazan. Un
 * espacio pegado a un importe es un tecleo, y `" 1500 "` es un importe valido; rechazarlo
 * seria ensenarle al usuario que el sistema no perdona.
 */

const alta = (extra: Record<string, string> = {}) => ({ nombre: 'Comida', grupo_id: '3', ...extra })

describe('validacion de sobres', () => {
  it('el importe sigue siendo string, y no pierde ni un centimo', () => {
    const monto = validarAsignacion({ periodo: '2026-01', monto: '12345678901234.56' }).monto
    expect(typeof monto).toBe('string')
    expect(monto).toBe('12345678901234.56')
  })

  it('el tope de numeric(16,2) se comprueba sin convertir, porque el float ya perdio un centimo', () => {
    // El mismo string pasa por la validacion intacto, y por `Number` no: el float mas
    // cercano al tope es 99999999999999.98. Comparar el limite despues de convertir
    // admitiria un centimo que Postgres va a rechazar.
    const exacta = validarAsignacion({ periodo: '2026-01', monto: MAXIMO_IMPORTE }).monto
    expect(exacta).toBe('99999999999999.99')
    expect(Number(exacta).toFixed(2)).toBe('99999999999999.98')
    expect(BigInt(exacta.replace('.', ''))).toBe(9999999999999999n)
  })

  it('acepta el tope y rechaza un centimo y un digito mas', () => {
    expect(validarAsignacion({ periodo: '2026-01', monto: MAXIMO_IMPORTE }).monto).toBe(
      MAXIMO_IMPORTE,
    )
    for (const monto of ['100000000000000.00', '123456789012345.67', '999999999999999.99']) {
      expect(
        esperaCampos(() => validarAsignacion({ periodo: '2026-01', monto }), 'monto'),
        `deberia rechazar ${monto}`,
      ).toMatch(/no puede pasar de/)
    }
    // El signo no cambia el rango: el negativo es del mismo `numeric(16,2)`.
    expect(validarCorreccion({ monto: `-${MAXIMO_IMPORTE}` }).monto).toBe(`-${MAXIMO_IMPORTE}`)
  })

  it('rechaza un importe mal formado y lo dice como importe, sin reventar', () => {
    // `abc` es el caso que obliga al `superRefine`: con un `.regex().refine()` en Zod 4
    // el `refine` se corre igual y `BigInt('abc')` lanza una `SyntaxError` en vez de
    // devolver un error que el formulario sabe pintar.
    for (const monto of ['', '   ', 'abc', '1.234', '1000.555', '1000.', '1e5', '$10', '1,5']) {
      expect(
        esperaCampos(() => validarAsignacion({ periodo: '2026-01', monto }), 'monto'),
        `deberia rechazar ${JSON.stringify(monto)}`,
      ).toMatch(/importe/i)
    }
  })

  it('acepta un importe negativo, porque el signo es regla del dominio y no de forma', () => {
    // El formulario lo acepta y lo repone el repositorio, que es quien sabe si la
    // operacion admite negativo: corregir o tapar no, asignar si.
    expect(validarCorreccion({ monto: '-400.50' }).monto).toBe('-400.50')
    expect(validarTapar({ periodo: '2026-01', monto: '-1' }).monto).toBe('-1')
  })

  it('acepta un importe sin decimales y con uno solo', () => {
    expect(validarAsignacion({ periodo: '2026-01', monto: '1500' }).monto).toBe('1500')
    expect(validarAsignacion({ periodo: '2026-01', monto: '1500.5' }).monto).toBe('1500.5')
  })

  it('saca los espacios del nombre, del periodo y del importe, en vez de rechazarlos', () => {
    const sobre = validarNuevoSobre({ nombre: '  Comida  ', grupo_id: ' 3 ' })
    expect(sobre.nombre).toBe('Comida')
    expect(sobre.grupo_id).toBe('3')

    const asignacion = validarAsignacion({ periodo: ' 2026-01 ', monto: ' 1500.50 ' })
    expect(asignacion.periodo).toBe('2026-01')
    expect(asignacion.monto).toBe('1500.50')
  })

  it('rechaza un nombre vacio o demasiado largo', () => {
    expect(esperaCampos(() => validarNuevoSobre(alta({ nombre: '   ' })), 'nombre')).toMatch(
      /vacio/i,
    )
    expect(
      esperaCampos(() => validarNuevoSobre(alta({ nombre: 'a'.repeat(61) })), 'nombre'),
    ).toMatch(new RegExp(String(NOMBRE_SOBRE_MAXIMO)))
    expect(validarNuevoSobre(alta({ nombre: 'a'.repeat(60) })).nombre).toHaveLength(60)
  })

  it('deja pasar el grupo vacio, porque el mensaje que lo rechaza es del dominio', () => {
    // `SinGrupo` dice "elige un grupo". Si el esquema exigiera un id, el formulario
    // responderia "no se pudo identificar el sobre", que es un error de forma: el
    // usuario no mando una forma mala, se dejo un campo sin llenar.
    expect(validarNuevoSobre({ nombre: 'Comida', grupo_id: '' }).grupo_id).toBe('')
    expect(validarNuevoSobre({ nombre: 'Comida', grupo_id: '   ' }).grupo_id).toBe('')
    expect(validarCambioDeGrupo({ grupo_id: '' }).grupo_id).toBe('')
  })

  it('rechaza un grupo_id que no es un id, y lo dice como grupo', () => {
    // Tampoco hay un "nombre prohibido" que comparar: lo que no existe es un grupo con
    // esa forma. La clave es que el mensaje sea del dominio y no "no se pudo
    // identificar el sobre", que es lo que responderia un id obligatorio.
    for (const grupo_id of ['0', '-1', 'abc', '3.5', '1 2']) {
      expect(
        esperaCampos(() => validarNuevoSobre(alta({ grupo_id })), 'grupo_id'),
        `deberia rechazar ${grupo_id}`,
      ).toMatch(/grupo/i)
    }
  })

  it('rechaza un periodo que no es un mes, porque se compara contra una columna de texto', () => {
    // `a.periodo <= '2026-1'` no es "el mes equivocado": es un texto distinto que ordena
    // distinto. El formato se exige aca, con cuatro digitos de anio y dos de mes.
    for (const periodo of ['2026-1', '2026-13', '2026-00', '2026-01-15', '26-01', 'enero', '']) {
      expect(
        esperaCampos(() => validarOperacion({ periodo }), 'periodo'),
        `deberia rechazar ${JSON.stringify(periodo)}`,
      ).toMatch(/periodo/i)
    }
    expect(validarOperacion({ periodo: '2026-12' }).periodo).toBe('2026-12')
  })

  it('el orden acepta el cero y rechaza negativo, decimal y no numerico', () => {
    expect(validarOrden({ orden: '0' }).orden).toBe('0')
    expect(validarOrden({ orden: ' 7 ' }).orden).toBe('7')
    expect(validarOrden({ orden: '100000' }).orden).toBe('100000')

    for (const orden of ['-1', '1.5', 'abc', '1e3', '100001', '']) {
      expect(
        esperaCampos(() => validarOrden({ orden }), 'orden'),
        `deberia rechazar ${JSON.stringify(orden)}`,
      ).toBeTruthy()
    }
  })

  it('el destino del movimiento tiene que ser un sobre, y no cualquiera', () => {
    const mover = (destino_id: string) => validarMover({ periodo: '2026-01', monto: '100', destino_id })

    expect(mover('7').destino_id).toBe('7')
    for (const destino_id of ['0', '-1', 'abc', '', '1.5']) {
      expect(esperaCampos(() => mover(destino_id), 'destino_id')).toBeTruthy()
    }
  })

  it('el renombre y el cambio de grupo validan lo suyo y nada mas', () => {
    expect(validarRenombre({ nombre: ' Alimentacion ' })).toEqual({ nombre: 'Alimentacion' })
    expect(esperaCampos(() => validarRenombre({ nombre: '' }), 'nombre')).toBeTruthy()
    expect(validarCambioDeGrupo({ grupo_id: ' 4 ' })).toEqual({ grupo_id: '4' })
  })

  it('el mover exige los tres campos: periodo, monto y destino', () => {
    const mensaje = esperaCampos(() => validarMover({ periodo: '2026-1', monto: 'x' }), 'periodo')
    expect(mensaje).toBeTruthy()
    expect(esperaCampos(() => validarMover({}), 'monto')).toBeTruthy()
    expect(esperaCampos(() => validarMover({}), 'destino_id')).toBeTruthy()
  })

  it('los errores traen un mensaje por campo, para pintar el formulario', () => {
    try {
      validarNuevoSobre({ nombre: '', grupo_id: 'abc' })
      expect.unreachable('deberia lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(ErroresDeSobre)
      expect((error as ErroresDeSobre).message).toBe('Los datos enviados no son validos.')
      expect(Object.keys((error as ErroresDeSobre).campos).sort()).toEqual(['grupo_id', 'nombre'])
    }
  })

  it('el campo del formulario ve el importe sin simbolo ni separador de miles', () => {
    expect(importeEnCampo('1500.50')).toBe('1500.50')
    expect(importeEnCampo('-600.00')).toBe('-600.00')
    expect(importeEnCampo('1500')).not.toContain(',')
  })
})

function esperaCampos(correr: () => unknown, campo: string): string {
  try {
    correr()
  } catch (error) {
    if (error instanceof ErroresDeSobre) return error.campos[campo] ?? ''
    throw error
  }
  return ''
}
