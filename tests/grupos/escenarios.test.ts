import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Trazabilidad de `grupos`, con una salvedad que no existe en las otras capacidades.
 *
 * Siete de los diez escenarios de `grupos` hablan de sobres: un sobre que se crea
 * dentro de un grupo, un total que se suma, sobres con disponible negativo. La tabla
 * `sobres` no existe todavia: es `050-sobres`, el change siguiente. Asi que esos siete
 * escenarios no se pueden cubrir aqui sin fabricar sobres de mentira.
 *
 * La salida NO es fingir cobertura. Es un registro explicito: `DIFERIDOS` dice que
 * escenario queda fuera y quien lo cubre. Y la primera prueba exige que la union de lo
 * cubierto y lo diferido sea exactamente el spec, de modo que un escenario no puede
 * desaparecer: si `050` olvida uno, esta prueba no compila contra el mapa. Cuando
 * `050-sobres` implemente cada uno, lo mueve de `DIFERIDOS` a `MAPA` con su prueba, y
 * si se olvida de moverlo, esta prueba falla.
 */

const ESCENARIOS = [
  'Crear un sobre dentro de un grupo',
  'Crear un sobre sin grupo',
  'Mover un sobre a otro grupo',
  'Total de un grupo',
  'Grupo plegado',
  'Reordenar grupos',
  'Total recalculado',
  'Intento de anidar grupos',
  'Archivar un grupo con sobres',
  'Efecto de archivar un grupo',
]

/** Cubiertos aqui, con la prueba que los cubre. */
const MAPA: Record<string, string[]> = {
  'Reordenar grupos': [
    'grupos.test.ts:reordenar mueve el grupo y no toca su nombre',
    'grupos.test.ts:rechaza un orden negativo o no entero, en vez de guardarlo',
    'validacion.test.ts:acepta el orden cero y rechaza negativo, decimal y no numerico',
  ],
  'Intento de anidar grupos': [
    'validacion.test.ts:rechaza un intento de anidar y explica que los grupos no se anidan',
    'validacion.test.ts:un grupo sin padre es valido: lo normal es que no haya padre',
    'validacion.test.ts:el anidamiento se rechaza aunque el nombre este bien, y primero el error del padre',
    'validacion.test.ts:no tiene grupo_padre, porque los grupos no se anidan',
  ],
  'Archivar un grupo con sobres': [
    'grupos.test.ts:archiva un grupo y lo saca de la lista activa sin borrarlo',
    'validacion.test.ts:no tiene columna de eliminacion, porque un grupo se archiva, no se borra',
  ],
}

/**
 * Diferidos, con quien los cubre y por que.
 *
 * El motivo importa tanto como el `change`: seis de los siete necesitan la tabla
 * `sobres` para siquiera enunciarse, y el séptimo necesita sobres que pliegar, porque
 * plegar un grupo vacio no oculta nada.
 */
const DIFERIDOS: Record<string, { change: string; motivo: string }> = {
  'Crear un sobre dentro de un grupo': {
    change: '050-sobres',
    motivo: 'no hay tabla de sobres donde meterlo',
  },
  'Crear un sobre sin grupo': {
    change: '050-sobres',
    motivo: 'no hay tabla de sobres que pueda quedar sin grupo',
  },
  'Mover un sobre a otro grupo': {
    change: '050-sobres',
    motivo: 'no hay sobres que mover',
  },
  'Total de un grupo': {
    change: '050-sobres',
    motivo: 'el total es la suma de los disponibles de sus sobres, y no hay sobres',
  },
  'Grupo plegado': {
    change: '050-sobres',
    motivo: 'plegar oculta los sobres del grupo, y un grupo vacio no oculta nada',
  },
  'Total recalculado': {
    change: '050-sobres',
    motivo: 'el total se recalcula con los movimientos de sus sobres',
  },
  'Efecto de archivar un grupo': {
    change: '050-sobres',
    motivo: 'el escenario habla de sobres con disponible negativo, que no existen todavia',
  },
}

describe('trazabilidad de grupos', () => {
  it('cubiertos y diferidos cubren los 10 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await readFile('openspec/specs/grupos/spec.md', 'utf8')
    const delSpec = [...spec.matchAll(/^#### Scenario: (.+)$/gm)].map((c) => c[1]?.trim() ?? '')

    expect(delSpec.sort()).toEqual([...ESCENARIOS].sort())
    expect([...Object.keys(MAPA), ...Object.keys(DIFERIDOS)].sort()).toEqual(
      [...ESCENARIOS].sort(),
    )
  })

  it('todo diferido dice quien lo cubre y por que', () => {
    // Un diferimiento sin motivo es un escenario olvidado con mejor vocabulario: por
    // eso el motivo es obligatorio y tiene que ser concreto.
    for (const [escenario, { change, motivo }] of Object.entries(DIFERIDOS)) {
      expect(change, `el diferimiento de "${escenario}" debe decir quien lo cubre`).toMatch(
        /^050-sobres$/,
      )
      expect(motivo.length, `el diferimiento de "${escenario}" necesita un motivo`).toBeGreaterThan(
        15,
      )
    }
  })

  it('cada referencia del mapa apunta a una prueba que existe', async () => {
    const archivos = (await readdir('tests/grupos')).filter((a) => a.endsWith('.test.ts'))
    const nombres = new Map<string, Set<string>>()

    for (const archivo of archivos) {
      const fuente = await readFile(`tests/grupos/${archivo}`, 'utf8')
      nombres.set(
        archivo,
        new Set([...fuente.matchAll(/it\('([^']+)'/g)].map((c) => c[1] ?? '')),
      )
    }

    const referencias = Object.values(MAPA).flat()
    expect(referencias.length).toBeGreaterThanOrEqual(Object.keys(MAPA).length)

    for (const referencia of referencias) {
      const corte = referencia.indexOf(':')
      const archivo = referencia.slice(0, corte)
      const prueba = referencia.slice(corte + 1)
      const existentes = nombres.get(archivo ?? '')
      expect(existentes, `no existe el archivo ${archivo}`).toBeDefined()
      expect(existentes?.has(prueba ?? ''), `no existe la prueba ${referencia}`).toBe(true)
    }
  })
})
