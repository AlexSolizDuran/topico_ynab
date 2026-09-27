import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Trazabilidad de `carteras`: los 14 escenarios del spec contra las pruebas que los
 * cubren.
 *
 * El mapa obliga a dos cosas. Primera, que ningun escenario se quede sin prueba sin
 * que alguien lo note. Segunda, que ninguna prueba referenciada haya cambiado de
 * nombre: si el mapa dice `carteras.test.ts:archivar una cartera vacia` y esa prueba
 * se renombra, esta suite falla y obliga a revisar el mapa, en vez de dejar una
 * referencia rota que sigue comp seeming.
 *
 * Los escenarios que aun no tienen comportamiento propio —los de `traspasos`, que
 * pertenece a `070-traspasos—` apuntan a la regla que ya existe y que los hara
 * cumplir. No es una prueba del traspaso: es la prueba de la regla que lo hara
 * imposible, en el lugar donde esa regla debe vivir.
 */

const ESCENARIOS = [
  'Registro de un usuario nuevo',
  'Acceso a una cartera ajena',
  'Todos los datos de la cartera comparten su moneda',
  'Carteras con monedas distintas',
  'Cambio de moneda de una cartera',
  'Un movimiento pertenece a la cartera de su cuenta',
  'Intento de mezclar carteras',
  'Traspaso entre carteras con distinta moneda',
  'Traspaso dentro de la misma cartera',
  'Creacion de una cartera',
  'Archivar una cartera vacia',
  'Archivar una cartera con saldo',
  'Editar el nombre de una cartera',
  'Operar sobre una cartera archivada',
]

const MAPA: Record<string, string[]> = {
  'Registro de un usuario nuevo': [
    'carteras.test.ts:crea la cartera vacia y activa, con la moneda pedida',
  ],
  'Acceso a una cartera ajena': [
    'carteras.test.ts:niega el acceso a una cartera ajena con el mismo mensaje que una inexistente',
    'carteras.test.ts:niega tambien una escritura, no solo una lectura',
  ],
  'Todos los datos de la cartera comparten su moneda': [
    'monedas.test.ts:deja pasar dos carteras de la misma moneda',
  ],
  'Carteras con monedas distintas': [
    'carteras.test.ts:admite el mismo nombre en usuarios distintos, porque las carteras son de cada uno',
    'monedas.test.ts:rechaza dos carteras de distinta moneda y nombra las dos',
  ],
  'Cambio de moneda de una cartera': [
    'carteras.test.ts:rechaza el cambio y explica que solo se define al crear',
    'carteras.test.ts:no existe ningun metodo que escriba la moneda despues de crear',
    'carteras.test.ts:acepta el renombrado que reenvia la misma moneda',
    'carteras.test.ts:no toma el renombrado por un cambio si el formulario no manda moneda',
  ],
  'Un movimiento pertenece a la cartera de su cuenta': [
    'monedas.test.ts:se deduce, sin que el movimiento la declare',
    'monedas.test.ts:no acepta una cartera propia, porque no se declara en ningun lado',
  ],
  'Intento de mezclar carteras': [
    'monedas.test.ts:rechaza una cuenta de una cartera con un sobre de otra, y nombra las dos',
  ],
  'Traspaso entre carteras con distinta moneda': [
    'monedas.test.ts:explica que el motivo es la falta de conversion, no una falta de permiso',
  ],
  'Traspaso dentro de la misma cartera': [
    'monedas.test.ts:deja pasar dos carteras de la misma moneda',
  ],
  'Creacion de una cartera': [
    'carteras.test.ts:rechaza un nombre repetido del mismo usuario, porque la lista seria ambigua',
    'carteras.test.ts:deja la cartera nueva al final de la lista, no en la primera posicion',
  ],
  'Archivar una cartera vacia': [
    'carteras.test.ts:archiva una cartera vacia y la saca de la lista de activas',
  ],
  'Archivar una cartera con saldo': [
    'carteras.test.ts:no archiva una cartera con saldo y dice que hay que vaciar primero',
    'carteras.test.ts:no archiva una cartera con asignaciones sin gastar',
  ],
  'Editar el nombre de una cartera': [
    'carteras.test.ts:cambia el nombre y conserva la moneda y los datos',
  ],
  'Operar sobre una cartera archivada': [
    'carteras.test.ts:rechaza cualquier escritura mientras la cartera siga archivada',
    'carteras.test.ts:deja volver a operar despues de restaurarla',
  ],
}

describe('trazabilidad de carteras', () => {
  it('el mapa cubre los 14 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await readFile('openspec/specs/carteras/spec.md', 'utf8')
    const delSpec = [...spec.matchAll(/^#### Scenario: (.+)$/gm)].map((c) => c[1]?.trim() ?? '')

    expect(delSpec.sort()).toEqual([...ESCENARIOS].sort())
    expect(Object.keys(MAPA).sort()).toEqual([...ESCENARIOS].sort())
  })

  it('cada referencia del mapa apunta a una prueba que existe', async () => {
    const archivos = (await readdir('tests/carteras')).filter((a) => a.endsWith('.test.ts'))
    const nombres = new Map<string, Set<string>>()

    for (const archivo of archivos) {
      const fuente = await readFile(`tests/carteras/${archivo}`, 'utf8')
      nombres.set(
        archivo,
        new Set([...fuente.matchAll(/it\('([^']+)'/g)].map((c) => c[1] ?? '')),
      )
    }

    const referencias = Object.values(MAPA).flat()
    expect(referencias.length).toBeGreaterThanOrEqual(ESCENARIOS.length)

    for (const referencia of referencias) {
      // Se parte en la PRIMERA aparicion: un nombre de prueba puede contener dos
      // puntos, como "5000 menos 450 son 4550", y partirlo todo romperia la
      // referencia sin que el nombre de la prueba cambiara.
      const corte = referencia.indexOf(':')
      const archivo = referencia.slice(0, corte)
      const prueba = referencia.slice(corte + 1)
      const existentes = nombres.get(archivo ?? '')
      expect(existentes, `no existe el archivo ${archivo}`).toBeDefined()
      expect(existentes?.has(prueba ?? ''), `no existe la prueba ${referencia}`).toBe(true)
    }
  })

  it('la precondicion de archivar consulta las cuatro tablas del modelo, no menos', async () => {
    // `carteras` R5 depende de `cuentas`, `sobres`, `movimientos` y `asignaciones`,
    // que crean `030-cuentas` y `050-sobres`. La consulta ya esta escrita y probada
    // contra esas columnas; lo unico que falta es que las tablas existan. Este
    // archivo falla si alguien reduce el chequeo y archiva carteras con saldo.
    const fuente = await readFile('src/carteras/saldos.ts', 'utf8')

    for (const tabla of ['cuentas', 'sobres', 'movimientos', 'asignaciones']) {
      expect(fuente).toContain(tabla)
    }
    expect(fuente).toContain('saldo_inicial')
  })
})
