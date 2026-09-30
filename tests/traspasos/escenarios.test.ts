import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Trazabilidad de `traspasos`: cada escenario del spec, con la prueba que lo cubre.
 *
 * No hay `DIFERIDOS` y no puede haberlos: la capacidad se implemento completa, asi que los 15
 * escenarios tienen que estar cubiertos o la prueba de abajo falla. Un diferimiento aca seria
 * una decision silenciosa, y lo que se busca es exactamente lo contrario.
 *
 * Las referencias llevan la **ruta completa** porque los nombres de prueba ya no son unicos:
 * `alta.test.ts` y `edicion.test.ts` repiten frases parecidas entre archivos, y una referencia
 * por nombre de archivo apuntaria al equivoco en silencio.
 *
 * `CARPETAS` tiene dos entradas y no una. Casi todo el codigo de `traspasos` esta en
 * `tests/traspasos`, pero dos escenarios se demuestran en el archivo de `transacciones`: el
 * historial se dibuja en `ListaMovimientos`, que es de esa capacidad, y asignar un sobre es
 * una operacion de `060`. Escribir las pruebas de traspasos ahi para no tocar el mapa habria
 * sido peor: el escenario `Traspaso distinguible en el historial` es de traspasos, y lo que se
 * copia es el archivo que ya dibujaba esa fila.
 */
const ESCENARIOS = [
  'Traspaso entre dos cuentas',
  'Traspaso con una sola pata',
  'Traspaso entre cuentas de carteras distintas',
  'Traspaso a una cuenta archivada',
  'Un traspaso no toca los sobres',
  'No se puede asignar un sobre a un traspaso',
  'Traspaso distinguible en el historial',
  'Contabilidad del gasto original',
  'El dinero suelto no cambia',
  'El patrimonio no cambia',
  'Una pata sola si mueve el dinero suelto',
  'Transferir dinero de una cuenta a un sobre',
  'Pago de tarjeta sin sobre',
  'Usuario que paga con tarjeta',
  'Pago parcial de tarjeta',
]

/** Cubiertos, con la prueba o las pruebas que los cubren. */
const MAPA: Record<string, string[]> = {
  'Traspaso entre dos cuentas': [
    'tests/traspasos/alta.test.ts:registra las dos patas emparejadas, con signo opuesto y el mismo grupo',
    'tests/traspasos/alta.test.ts:el signo lo decide el lado, no el signo del importe',
    'tests/traspasos/alta.test.ts:el grupo y sus patas comparten descripcion y fecha',
    'tests/traspasos/acciones.test.ts:crea las dos patas y devuelve el periodo',
  ],
  'Traspaso con una sola pata': [
    'tests/traspasos/validacion.test.ts:acepta destino vacio, que es el traspaso de una sola pata',
    'tests/traspasos/avisos.test.ts:R1 avisa que no hay contraparte y nombra el importe, sin bloquear la operacion',
    'tests/traspasos/acciones.test.ts:acepta el destino vacio y devuelve el aviso de pata unica',
    'tests/traspasos/vista.test.tsx:ofrece el destino vacio con un texto que explica que es una pata sola',
  ],
  'Traspaso entre cuentas de carteras distintas': [
    'tests/traspasos/carteras.test.ts:rechaza dos cuentas de carteras distintas del mismo usuario',
    'tests/traspasos/carteras.test.ts:tambien lo rechaza cuando las dos carteras tienen la misma moneda',
    'tests/traspasos/carteras.test.ts:el mensaje de carteras distintas es propio y no el de cuenta ajena',
    'tests/traspasos/acciones.test.ts:una cuenta de otra cartera se rechaza con su mensaje y no cambia nada',
  ],
  'Traspaso a una cuenta archivada': [
    'tests/traspasos/carteras.test.ts:reactiva una cuenta archivada que recibe el traspaso',
    'tests/traspasos/carteras.test.ts:no toca una cuenta que no estaba archivada',
    'tests/traspasos/carteras.test.ts:un traspaso rechazado no reactiva una cuenta archivada',
    'tests/traspasos/alta.test.ts:no acepta una cuenta eliminada',
  ],
  'Un traspaso no toca los sobres': [
    'tests/traspasos/derivados.test.ts:R2 el disponible de todos los sobres queda igual antes y despues de un traspaso de 5,000',
    'tests/traspasos/derivados.test.ts:R2 el disponible tampoco se mueve con una pata sola, porque sigue sin tener sobre',
    'tests/traspasos/vista.test.tsx:no tiene selector de sobre, porque un traspaso no gasta',
  ],
  'No se puede asignar un sobre a un traspaso': [
    'tests/traspasos/derivados.test.ts:R2 no se puede asignar un sobre a una pata de traspaso que ya existe',
    'tests/traspasos/derivados.test.ts:R2 el camino de alta simple de 060 no acepta un traspaso',
    'tests/traspasos/edicion.test.ts:R2 asignarle un sobre a una pata se rechaza, y el grupo no cambia',
    'tests/traspasos/edicion.test.ts:R2 mandar `sobre_id: null` a una pata es inocuo, no un error',
  ],
  'Traspaso distinguible en el historial': [
    'tests/traspasos/vista.test.tsx:con contraparte muestra el par de cuentas',
    'tests/traspasos/vista.test.tsx:sin contraparte lo dice, en vez de mostrar un hueco',
    'tests/traspasos/vista.test.tsx:un gasto o un ingreso no dibuja recorrido',
    'tests/transacciones/vista.test.tsx:una pata con contraparte se lee de donde a donde',
  ],
  'Contabilidad del gasto original': [
    'tests/traspasos/derivados.test.ts:R4 un gasto con tarjeta sigue siendo un gasto contra el sobre, y el pago posterior no lo toca',
    'tests/traspasos/derivados.test.ts:R4 pagar 600 a una tarjeta que debia 600 la salda, avisa, y no pide ningun sobre',
    'tests/traspasos/alta.test.ts:una pata con tipo traspaso y sin grupo no se cuela por el alta simple',
  ],
  'El dinero suelto no cambia': [
    'tests/traspasos/derivados.test.ts:R3 el dinero suelto y el patrimonio quedan identicos, y la invariante sigue valiendo',
    'tests/traspasos/derivados.test.ts:R3 el patrimonio no cambia con ningun importe, tampoco con uno mayor que el saldo',
  ],
  'El patrimonio no cambia': [
    'tests/traspasos/derivados.test.ts:R3 el dinero suelto y el patrimonio quedan identicos, y la invariante sigue valiendo',
    'tests/traspasos/derivados.test.ts:R3 el patrimonio no cambia con ningun importe, tampoco con uno mayor que el saldo',
  ],
  'Una pata sola si mueve el dinero suelto': [
    'tests/traspasos/derivados.test.ts:R1 y R3 una pata sola de 500 mueve ambos por el importe completo, y la invariante sigue valiendo',
    'tests/traspasos/avisos.test.ts:R1 el importe del aviso sale de la pata, no de medir el dinero suelto',
    'tests/traspasos/avisos.test.ts:R1 el aviso depende de la forma del grupo, no de que el destino este a cero',
  ],
  'Transferir dinero de una cuenta a un sobre': [
    'tests/transacciones/asignar.test.ts:baja el disponible del sobre y sube el dinero suelto por lo mismo',
    'tests/transacciones/asignar.test.ts:asignar, quitar y volver a asignar vuelve al mismo estado',
    'tests/traspasos/vista.test.tsx:no tiene selector de sobre, porque un traspaso no gasta',
  ],
  'Pago de tarjeta sin sobre': [
    'tests/traspasos/derivados.test.ts:R4 pagar 600 a una tarjeta que debia 600 la salda, avisa, y no pide ningun sobre',
    'tests/traspasos/avisos.test.ts:R4 nombra cuanto se saldo de la deuda',
    'tests/traspasos/avisos.test.ts:R4 no avisa si la tarjeta no debe nada, porque no hay deuda que reducir',
  ],
  'Usuario que paga con tarjeta': [
    'tests/traspasos/derivados.test.ts:R4 un gasto con tarjeta sigue siendo un gasto contra el sobre, y el pago posterior no lo toca',
  ],
  'Pago parcial de tarjeta': [
    'tests/traspasos/derivados.test.ts:R4 el pago parcial baja la deuda a 300 y no mueve el dinero suelto',
    'tests/traspasos/avisos.test.ts:R4 el pago parcial nombra lo que salio, no el total de la deuda',
  ],
}

/**
 * Donde se buscan las pruebas que el mapa referencia.
 *
 * `tests/transacciones` esta por los dos escenarios que se demuestran en el historial de
 * movimientos y en la asignacion de sobres. Ver el comentario de la cabecera.
 */
const CARPETAS = ['tests/traspasos', 'tests/transacciones']

/**
 * Los nombres de prueba de cada archivo, con la ruta como clave.
 *
 * Se leen con una expresion, no ejecutando los archivos: cargar 200 pruebas con PGlite para
 * descubrir sus nombres seria lento y no aportaria nada. El `.tsx` va junto al `.ts` porque
 * las pruebas de vista se escriben en JSX.
 *
 * La expresion solo ve `it('...'`. Los nombres de `it.each(...)` quedan fuera porque su texto
 * es un `$nombre` que se resuelve en tiempo de corrida. Es una limitacion conocida: por eso el
 * mapa referencia pruebas con `it` literal, y una referencia a un nombre de `it.each`
 * fallaria con "no existe la prueba" en vez de pasar en silencio.
 */
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

describe('trazabilidad de traspasos', () => {
  it('el mapa cubre los 15 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await readFile('openspec/specs/traspasos/spec.md', 'utf8')
    const delSpec = [...spec.matchAll(/^#### Scenario: (.+)$/gm)].map((c) => c[1]?.trim() ?? '')

    // La cuenta va explicita, y no solo la igualdad: si un escenario se perdiera **de los
    // dos lados** —del spec y de la lista— la igualdad seguiria cumpliendose.
    expect(delSpec).toHaveLength(15)
    expect(ESCENARIOS).toHaveLength(15)
    expect(delSpec.sort()).toEqual([...ESCENARIOS].sort())

    // Y el mapa, que es el que puede quedarse corto sin romper la cuenta.
    expect(Object.keys(MAPA).sort()).toEqual([...ESCENARIOS].sort())
  })

  it('todo escenario tiene al menos una prueba, y ninguna prueba sobra', async () => {
    const vacios = Object.entries(MAPA)
      .filter(([, referencias]) => referencias.length === 0)
      .map(([escenario]) => escenario)

    // Sin lista de vacios: un escenario con `[]` es un escenario sin cubrir que se lee igual
    // que uno cubierto.
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
      /**
       * El corte es en la **primera** aparicion del `:`.
       *
       * Un nombre de prueba puede llevar dos puntos —`un filtro mal escrito no desarma la
       * pagina: avisa y deja limpiar`— y partir por la ultima, o con `split(':')` y quedarse
       * con el segundo elemento, dejaria el resto del nombre pegado al archivo y la
       * referencia no resolveria. `indexOf` corta donde corresponde y el nombre se lleva
       * todo lo que queda, puntos incluidos.
       */
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

  it('el corte por la primera aparicion aguanta un nombre con dos puntos', async () => {
    // Si `indexOf` se cambiara por `lastIndexOf` o por un `split(':')[1]`, esta prueba
    // seguiria pasando salvo que un nombre con dos puntos este en el mapa. Por eso esta.
    const conDosPuntos = Object.values(MAPA)
      .flat()
      .filter((referencia) => referencia.slice(referencia.indexOf(':') + 1).includes(':'))
    expect(conDosPuntos.length).toBeGreaterThan(0)

    const nombres = await nombresDePrueba()
    for (const referencia of conDosPuntos) {
      const corte = referencia.indexOf(':')
      const prueba = referencia.slice(corte + 1)
      expect(prueba.includes(':')).toBe(true)
      expect(nombres.get(referencia.slice(0, corte))?.has(prueba)).toBe(true)
    }
  })
})
