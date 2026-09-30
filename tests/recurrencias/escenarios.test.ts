import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Trazabilidad de `recurrencias`: cada escenario del spec, con la prueba que lo cubre.
 *
 * Los 17 escenarios de `openspec/specs/recurrencias/spec.md` estan mapeados y verificados.
 */
const ESCENARIOS = [
  'Crear una regla mensual',
  'Regla sin sobre',
  'Regla anual sin mes',
  'Regla con cuenta y sobre de carteras distintas',
  'Regla mensual aplicada',
  'Movimiento generado indistinguible',
  'Importe negativo en una regla',
  'Movimiento ya registrado a mano',
  'Generacion normal',
  'Generacion tras eliminar un movimiento',
  'Varias ausencias',
  'Anterior a la fecha de inicio',
  'Regla desactivada',
  'Editar el importe de una regla',
  'Desactivar una regla',
  'Eliminar una regla',
  'Editar un movimiento generado',
]

const MAPA: Record<string, string[]> = {
  'Crear una regla mensual': [
    'tests/recurrencias/repositorio.test.ts:R1: Crear una regla mensual (renta por 8,000 con frecuencia mensual el dia 1)',
    'tests/recurrencias/validacion.test.ts:acepta una regla mensual valida',
  ],
  'Regla sin sobre': [
    'tests/recurrencias/repositorio.test.ts:R1: Regla sin sobre (se acepta y queda sobre_id null)',
    'tests/recurrencias/validacion.test.ts:acepta una regla sin sobre (sobre_id null o vacio)',
  ],
  'Regla anual sin mes': [
    'tests/recurrencias/repositorio.test.ts:R1: Regla anual sin mes (se rechaza con error)',
    'tests/recurrencias/validacion.test.ts:rechaza una regla anual sin mes',
  ],
  'Regla con cuenta y sobre de carteras distintas': [
    'tests/recurrencias/repositorio.test.ts:R1: Regla con cuenta y sobre de carteras distintas (se rechaza)',
  ],
  'Regla mensual aplicada': [
    'tests/recurrencias/materializacion.test.ts:R2: Regla mensual aplicada (genera el movimiento con fecha y periodo correspondiente)',
  ],
  'Movimiento generado indistinguible': [
    'tests/recurrencias/materializacion.test.ts:R2: Movimiento generado indistinguible (se trata igual que uno a mano en saldos y disponibles)',
  ],
  'Importe negativo en una regla': [
    'tests/recurrencias/materializacion.test.ts:R2: Importe negativo en una regla (gasto genera negativo, ingreso positivo)',
  ],
  'Movimiento ya registrado a mano': [
    'tests/recurrencias/materializacion.test.ts:R3: Movimiento ya registrado a mano (omite la generacion y no crea duplicado)',
  ],
  'Generacion normal': [
    'tests/recurrencias/materializacion.test.ts:R3: Generacion normal (cuando no existe movimiento previo se genera normalmente)',
  ],
  'Generacion tras eliminar un movimiento': [
    'tests/recurrencias/materializacion.test.ts:R3: Generacion tras eliminar un movimiento (vuelve a generarlo si el anterior fue borrado)',
  ],
  'Varias ausencias': [
    'tests/recurrencias/materializacion.test.ts:R4: Varias ausencias (genera movimientos de tres periodos e informa)',
  ],
  'Anterior a la fecha de inicio': [
    'tests/recurrencias/materializacion.test.ts:R4: Anterior a la fecha de inicio (no genera movimientos anteriores al inicio)',
  ],
  'Regla desactivada': [
    'tests/recurrencias/materializacion.test.ts:R4: Regla desactivada (no genera movimientos para los periodos pendientes)',
  ],
  'Editar el importe de una regla': [
    'tests/recurrencias/repositorio.test.ts:R5: Editar el importe de una regla (los movimientos ya registrados conservan su importe)',
  ],
  'Desactivar una regla': [
    'tests/recurrencias/repositorio.test.ts:R5: Desactivar una regla (deja de estar activa)',
  ],
  'Eliminar una regla': [
    'tests/recurrencias/repositorio.test.ts:R5: Eliminar una regla (baja logica, conserva movimientos generados)',
  ],
  'Editar un movimiento generado': [
    'tests/recurrencias/materializacion.test.ts:R5: Editar un movimiento generado (se guarda y la regla no lo sobrescribe)',
  ],
}

const CARPETAS = ['tests/recurrencias']

async function nombresDePrueba(): Promise<Map<string, Set<string>>> {
  const nombres = new Map<string, Set<string>>()

  for (const carpeta of CARPETAS) {
    const archivos = (await readdir(carpeta)).filter(
      (a) => a.endsWith('.test.ts') || a.endsWith('.test.tsx'),
    )
    for (const archivo of archivos) {
      const clave = `${carpeta}/${archivo}`
      const fuente = await readFile(clave, 'utf8')
      nombres.set(
        clave,
        new Set([...fuente.matchAll(/it\('([^']+)'/g)].map((c) => c[1] ?? '')),
      )
    }
  }

  return nombres
}

describe('trazabilidad de recurrencias', () => {
  it('el mapa cubre los 17 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await readFile('openspec/specs/recurrencias/spec.md', 'utf8')
    const delSpec = [...spec.matchAll(/^#### Scenario: (.+)$/gm)].map((c) => c[1]?.trim() ?? '')

    expect(delSpec).toHaveLength(17)
    expect(ESCENARIOS).toHaveLength(17)
    expect(delSpec.sort()).toEqual([...ESCENARIOS].sort())
    expect(Object.keys(MAPA).sort()).toEqual([...ESCENARIOS].sort())
  })

  it('todo escenario tiene al menos una prueba, y ninguna prueba sobra', async () => {
    const vacios = Object.entries(MAPA)
      .filter(([, referencias]) => referencias.length === 0)
      .map(([escenario]) => escenario)

    expect(vacios).toEqual([])

    for (const [escenario, referencias] of Object.entries(MAPA)) {
      expect(referencias, `el escenario ${escenario} no tiene pruebas`).not.toEqual([])
    }
  })

  it('cada referencia del mapa apunta a una prueba que existe', async () => {
    const nombres = await nombresDePrueba()
    const referencias = Object.values(MAPA).flat()
    expect(referencias.length).toBeGreaterThanOrEqual(Object.keys(MAPA).length)

    for (const referencia of referencias) {
      const corte = referencia.indexOf(':')
      expect(corte, `la referencia ${referencia} tiene que decir archivo:prueba`).toBeGreaterThan(-1)
      const archivo = referencia.slice(0, corte)
      const prueba = referencia.slice(corte + 1)
      expect(prueba, `la referencia ${referencia} tiene que decir archivo:prueba`).not.toBe('')

      const existentes = nombres.get(archivo)
      expect(existentes, `no existe el archivo ${archivo}`).toBeDefined()
      expect(existentes?.has(prueba), `no existe la prueba ${referencia}`).toBe(true)
    }
  })
})
