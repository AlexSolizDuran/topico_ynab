import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Trazabilidad de `cuentas`: los 19 escenarios del spec contra las pruebas que los
 * cubren. Mismo mecanismo que en `carteras` y `autenticacion`.
 *
 * Un escenario sin prueba es un comportamiento que seifikia existir; una referencia
 * rota es una cobertura que se pierde en silencio. Las dos cosas rompen aqui.
 */

const ESCENARIOS = [
  'Crear una cuenta corriente',
  'Crear una cuenta de credito',
  'Nombre duplicado en la misma cartera',
  'Mismo nombre en carteras distintas',
  'Saldo a partir del inicial y los movimientos',
  'El saldo no es un dato almacenado',
  'Correccion del saldo inicial',
  'Deuda en la tarjeta',
  'Saldo a favor en una tarjeta',
  'Cuenta corriente sin deuda',
  'Editar el nombre de una cuenta',
  'Reordenar cuentas',
  'Cambiar el tipo de una cuenta con movimientos',
  'Archivar una cuenta en cero',
  'Archivar una cuenta con saldo',
  'Transpaso a una cuenta archivada',
  'Aislamiento entre usuarios',
  'Operar sobre una cuenta ajena',
  'Ajuste de saldo en una cuenta propia',
]

const MAPA: Record<string, string[]> = {
  'Crear una cuenta corriente': [
    'cuentas.test.ts:registra una cuenta corriente con su saldo inicial',
  ],
  'Crear una cuenta de credito': ['cuentas.test.ts:acepta los cuatro tipos, y el de credito es deuda'],
  'Nombre duplicado en la misma cartera': [
    'cuentas.test.ts:rechaza un nombre duplicado en la misma cartera, y dice que ya esta en uso',
  ],
  'Mismo nombre en carteras distintas': [
    'cuentas.test.ts:admite el mismo nombre en carteras distintas, porque cada cartera es independiente',
  ],
  'Saldo a partir del inicial y los movimientos': [
    'cuentas.test.ts:resta un gasto del saldo inicial: 5000 menos 450 son 4550',
    'cuentas.test.ts:suma un ingreso, y el signo va en el monto',
    'cuentas.test.ts:el saldo llega como string, porque numeric es exacto y un float no',
  ],
  'El saldo no es un dato almacenado': [
    'cuentas.test.ts:no es una columna: borrar un movimiento lo recalcula sin tocar la cuenta',
    'cuentas.test.ts:ignora los movimientos ya eliminados, tambien al contarlos',
  ],
  'Correccion del saldo inicial': [
    'cuentas.test.ts:corregir el saldo inicial mueve el saldo de inmediato, con los movimientos que ya habia',
  ],
  'Deuda en la tarjeta': [
    'cuentas.test.ts:un gasto en una tarjeta deja el saldo en menos seiscientos',
  ],
  'Saldo a favor en una tarjeta': [
    'cuentas.test.ts:un reembolso mayor que la deuda deja la tarjeta a favor',
  ],
  'Cuenta corriente sin deuda': [
    'cuentas.test.ts:una cuenta corriente en negativo se muestra igual que una tarjeta',
  ],
  'Editar el nombre de una cuenta': [
    'cuentas.test.ts:renombrar conserva el saldo y el historial',
  ],
  'Reordenar cuentas': ['cuentas.test.ts:reordenar no altera los saldos'],
  'Cambiar el tipo de una cuenta con movimientos': [
    'cuentas.test.ts:rechaza cambiar el tipo de una cuenta con movimientos, y explica por que',
    'cuentas.test.ts:cambia el tipo de una cuenta sin movimientos',
  ],
  'Archivar una cuenta en cero': [
    'cuentas.test.ts:archiva una cuenta en cero y la saca de la lista activa',
    'cuentas.test.ts:restaurar devuelve la cuenta con su historial',
  ],
  'Archivar una cuenta con saldo': [
    'cuentas.test.ts:rechaza archivar una cuenta con saldo y dice que la deje en cero',
    'cuentas.test.ts:no archiva una cuenta que llego a cero por movimientos, no solo por inicial',
  ],
  'Transpaso a una cuenta archivada': [
    'cuentas.test.ts:un movimiento en una cuenta archivada la reactiva sola',
  ],
  'Aislamiento entre usuarios': [
    'cuentas.test.ts:la lista de cuentas sale de la sesion del usuario, no de un parametro libre',
    'pagina.test.ts:da notFound en una cartera ajena, sin decir cual de las dos cosas fallo',
    'pagina.test.ts:da notFound en una cartera que no existe, igual que en una ajena',
  ],
  'Operar sobre una cuenta ajena': [
    'cuentas.test.ts:no deja registrar un movimiento en una cuenta de otra cartera',
    'cuentas.test.ts:el saldo de una cuenta ajena no se puede leer, ni aunque se conozca el id',
    'pagina.test.ts:da notFound cuando el identificador no es un entero',
  ],
  'Ajuste de saldo en una cuenta propia': [
    'cuentas.test.ts:ajustar el saldo inicial de una cuenta propia recalcula el derivado',
  ],
}

describe('trazabilidad de cuentas', () => {
  it('el mapa cubre los 19 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await readFile('openspec/specs/cuentas/spec.md', 'utf8')
    const delSpec = [...spec.matchAll(/^#### Scenario: (.+)$/gm)].map((c) => c[1]?.trim() ?? '')

    expect(delSpec.sort()).toEqual([...ESCENARIOS].sort())
    expect(Object.keys(MAPA).sort()).toEqual([...ESCENARIOS].sort())
  })

  it('cada referencia del mapa apunta a una prueba que existe', async () => {
    const archivos = (await readdir('tests/cuentas')).filter((a) => a.endsWith('.test.ts'))
    const nombres = new Map<string, Set<string>>()

    for (const archivo of archivos) {
      const fuente = await readFile(`tests/cuentas/${archivo}`, 'utf8')
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

  it('la tabla no tiene columna de saldo, porque el saldo se deriva', async () => {
    const { readFile } = await import('node:fs/promises')
    // Los finales de linea se normalizan: el archivo llega con `\r\n` en Windows, y un
    // `\n` a secas en el ancla dejaria el recorte vacio —la prueba pasaria sin comprobar
    // nada en vez de avisar que el archivo cambio de forma.
    const fuente = (await readFile('src/db/tablas/cuentas.ts', 'utf8')).replace(/\r\n/g, '\n')
    const definicion = fuente.slice(
      fuente.indexOf("pgTable(\n  'cuentas'"),
      fuente.indexOf('export const tipoDeMovimiento'),
    )

    expect(definicion).toContain('saldo_inicial')
    // Un `saldo:` en la definicion de la tabla seria un saldo almacenado, que es
    // exactamente lo que el requerimiento prohibe.
    expect(definicion).not.toMatch(/^\s*saldo:/m)
  })
})
