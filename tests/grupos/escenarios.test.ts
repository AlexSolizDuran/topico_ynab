import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Trazabilidad de `grupos`: cada escenario del spec, con la prueba que lo cubre.
 *
 * Este archivo nacio con un problema que ya no existe. Siete de los diez escenarios de
 * `grupos` hablan de sobres, y cuando se escribio la tabla `sobres` todavia no existia:
 * no habia donde meter un sobre, ni un disponible que sumar, ni algo que plegar. Esos
 * siete quedaron en `DIFERIDOS`, un registro explicito con el change que los cubria.
 *
 * `050-sobres` los implemento, asi que los siete pasaron de `DIFERIDOS` a `MAPA` con su
 * prueba. `DIFERIDOS` quedo vacio a proposito, y la segunda prueba lo exige: si un
 * escenario vuelve a quedar sin cubrir y nadie lo anota, esta prueba falla. Si se anota
 * sin motivo, tambien. Ese era el acuerdo del primer version, y se sigue cumpliendo.
 *
 * Las referencias llevan la **ruta completa** porque los nombres de prueba ya no son
 * unicos: `sobres.test.ts` y `grupos.test.ts` se llaman igual en varios casos, y una
 * referencia por nombre de archivo apuntaria al archivo equivocado en silencio.
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

/** Cubiertos, con la prueba que los cubre. */
const MAPA: Record<string, string[]> = {
  'Crear un sobre dentro de un grupo': [
    'tests/sobres/sobres.test.ts:crea un sobre con disponible en cero y lo deja en la lista de su grupo',
  ],
  'Crear un sobre sin grupo': [
    'tests/sobres/sobres.test.ts:rechaza crear un sobre sin grupo, y pide uno',
    'tests/sobres/sobres.test.ts:rechaza mover un sobre a ningun grupo',
  ],
  'Mover un sobre a otro grupo': [
    'tests/sobres/sobres.test.ts:mueve un sobre a otro grupo sin tocar su disponible',
    'tests/sobres/sobres.test.ts:reubica un sobre con movimientos y conserva historial y asignaciones',
  ],
  'Total de un grupo': [
    'tests/sobres/sobres.test.ts:es la suma de los disponibles de sus sobres',
    'tests/sobres/sobres.test.ts:deja fuera los sobres archivados del grupo',
    'tests/sobres/sobres.test.ts:no cuenta un sobre de otro grupo ni de otra cartera',
  ],
  'Grupo plegado': [
    'tests/grupos/plegado.test.ts:deja el total fuera del details, y los sobres adentro',
    'tests/grupos/plegado.test.ts:los sobres del grupo quedan dentro del details, que es lo que se pliega',
  ],
  'Reordenar grupos': [
    'tests/grupos/grupos.test.ts:reordenar mueve el grupo y no toca su nombre',
    'tests/grupos/grupos.test.ts:rechaza un orden negativo o no entero, en vez de guardarlo',
    'tests/grupos/validacion.test.ts:acepta el orden cero y rechaza negativo, decimal y no numerico',
  ],
  'Total recalculado': [
    'tests/sobres/sobres.test.ts:se recalcula con los movimientos, porque no esta guardado',
  ],
  'Intento de anidar grupos': [
    'tests/grupos/validacion.test.ts:rechaza un intento de anidar y explica que los grupos no se anidan',
    'tests/grupos/validacion.test.ts:un grupo sin padre es valido: lo normal es que no haya padre',
    'tests/grupos/validacion.test.ts:el anidamiento se rechaza aunque el nombre este bien, y primero el error del padre',
    'tests/grupos/validacion.test.ts:no tiene grupo_padre, porque los grupos no se anidan',
  ],
  'Archivar un grupo con sobres': [
    'tests/grupos/grupos.test.ts:archiva un grupo y lo saca de la lista activa sin borrarlo',
    'tests/grupos/validacion.test.ts:no tiene columna de eliminacion, porque un grupo se archiva, no se borra',
  ],
  'Efecto de archivar un grupo': [
    'tests/sobres/sobres.test.ts:los sobres en negativo se siguen viendo con el grupo archivado',
  ],
}

/**
 * Diferidos, con quien los cubre y por que.
 *
 * Vacio, y tiene que seguir vacio. El tipo no se afloja a `never`: si manana una tabla
 * que `grupos` necesita todavia no existe, el escenario vuelve a entrar aca con su
 * `change` y su `motivo`, y la segunda prueba avisa porque deberia quedar vacio.
 */
const DIFERIDOS: Record<string, { change: string; motivo: string }> = {}

/**
 * Donde se buscan las pruebas que el mapa referencia.
 *
 * `tests/transacciones` entra porque los totales de un grupo dependen de los movimientos que
 * caen en sus sobres, asi que una prueba de `transacciones` puede cubrir un escenario de
 * `grupos` sin que el archivo parezca de otra capacidad. Sin esta carpeta, una referencia
 * asi resolveria a "no existe el archivo" y el error apuntaria al archivo equivocado.
 *
 * Se lista la carpeta y no se la adivina: el mapa decide que referencia y el escaner decide
 * donde puede mirar.
 */
const CARPETAS = ['tests/grupos', 'tests/sobres', 'tests/transacciones']

describe('trazabilidad de grupos', () => {
  it('cubiertos y diferidos cubren los 10 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await readFile('openspec/specs/grupos/spec.md', 'utf8')
    const delSpec = [...spec.matchAll(/^#### Scenario: (.+)$/gm)].map((c) => c[1]?.trim() ?? '')

    expect(delSpec.sort()).toEqual([...ESCENARIOS].sort())
    expect([...Object.keys(MAPA), ...Object.keys(DIFERIDOS)].sort()).toEqual(
      [...ESCENARIOS].sort(),
    )
  })

  it('no queda ningun escenario diferido, porque 050-sobres los implemento', () => {
    // La unica forma de que un escenario no tenga prueba es que alguien lo escriba en
    // `DIFERIDOS`. Por eso se exige que este vacio: un diferimiento es una decision, y
    // una decision que nadie reviso se ve en esta prueba.
    expect(Object.keys(DIFERIDOS)).toEqual([])
  })

  it('cada referencia del mapa apunta a una prueba que existe', async () => {
    const nombres = new Map<string, Set<string>>()

    for (const carpeta of CARPETAS) {
      const archivos = (await readdir(carpeta)).filter(
        (a) => a.endsWith('.test.ts') || a.endsWith('.test.tsx'),
      )
      for (const archivo of archivos) {
        // La clave lleva la carpeta y la ruta con barra, tal como se escribe en el mapa:
        // dos archivos de pruebas distintas pueden llamarse igual.
        const clave = `${carpeta}/${archivo}`
        const fuente = await readFile(clave, 'utf8')
        nombres.set(
          clave,
          new Set([...fuente.matchAll(/it\('([^']+)'/g)].map((c) => c[1] ?? '')),
        )
      }
    }

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
