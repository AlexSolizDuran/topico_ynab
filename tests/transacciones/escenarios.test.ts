import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * Trazabilidad de `transacciones`: cada escenario del spec, con la prueba que lo cubre.
 *
 * A diferencia de `grupos`, aca no hay `DIFERIDOS` y no puede haberlos: la capacidad se
 * implemento completa, asi que los 33 escenarios tienen que estar cubiertos o la prueba de
 * abajo falla. Un diferimiento aca seria una decision silenciosa, y lo que se busca es
 * exactamente lo contrario.
 *
 * Las referencias llevan la **ruta completa** porque los nombres de prueba ya no son unicos:
 * `alta.test.ts` y `validacion.test.ts` repiten frases parecidas entre archivos, y una
 * referencia por nombre de archivo apuntaria al equivoco en silencio.
 */

const ESCENARIOS = [
  'Registrar un gasto',
  'Registrar un ingreso',
  'Registrar un gasto con comercio',
  'Registrar un movimiento con importe cero',
  'Gasto registrado sin sobre',
  'Movimiento pendiente en la lista',
  'El dinero pendiente no desaparece',
  'Asignar sobre a un movimiento pendiente',
  'El saldo de la cuenta no cambia',
  'Asignar un sobre de otra cartera',
  'Quitar el sobre de un movimiento',
  'Devolucion de una compra',
  'Devolucion a un sobre archivado',
  'Una devolucion no crea dinero',
  'Corregir el importe de un gasto',
  'Corregir la cuenta de un movimiento',
  'Corregir la fecha al periodo anterior',
  'Borrado logico de un gasto',
  'Restaurar un movimiento eliminado',
  'Borrar un traspaso completo',
  'Movimiento registrado tarde',
  'Movimiento de fin de mes',
  'Alta retroactiva',
  'Edicion retroactiva',
  'Aviso de recalculo',
  'Buscar por texto',
  'Filtrar por cuenta',
  'Filtrar por sobre',
  'Filtros combinados',
  'Limpiar filtros',
  'Aislamiento entre usuarios',
  'Editar un movimiento ajeno',
  'Determinacion de la cartera de un movimiento',
]

/** Cubiertos, con la prueba o las pruebas que los cubren. */
const MAPA: Record<string, string[]> = {
  'Registrar un gasto': [
    'tests/transacciones/alta.test.ts:lo registra con importe negativo y mueve saldo y disponible',
    'tests/transacciones/validacion.test.ts:acepta un importe con signo y hasta dos decimales',
  ],
  'Registrar un ingreso': [
    'tests/transacciones/alta.test.ts:el importe se guarda con el signo que manda el tipo',
    'tests/transacciones/alta.test.ts:sin tipo, el signo decide: negativo es gasto y positivo es ingreso',
  ],
  'Registrar un gasto con comercio': [
    'tests/transacciones/alta.test.ts:guarda el comercio cuando viene',
    'tests/transacciones/alta.test.ts:un comercio de solo espacios es ausencia, no una cadena vacia',
  ],
  'Registrar un movimiento con importe cero': [
    'tests/transacciones/alta.test.ts:un importe cero no se registra',
    'tests/transacciones/validacion.test.ts:rechaza el cero y lo dice con el mensaje de R1',
    'tests/transacciones/acciones.test.ts:el cero lo frena la validacion, con el mensaje en el campo',
  ],
  'Gasto registrado sin sobre': [
    'tests/transacciones/alta.test.ts:se acepta y el disponible de ningun sobre se mueve',
    'tests/transacciones/alta.test.ts:se guarda en null, no en cadena vacia',
  ],
  'Movimiento pendiente en la lista': [
    'tests/transacciones/vista.test.tsx:una pendiente se marca "sin asignar" y ofrece darle un sobre',
    'tests/transacciones/pagina.test.ts:marca el pendiente como "sin asignar" y ofrece darle un sobre',
    'tests/transacciones/alta.test.ts:aparece marcado como pendiente, y ofrece asignarle un sobre',
  ],
  'El dinero pendiente no desaparece': [
    'tests/transacciones/alta.test.ts:el dinero suelto baja por el importe',
    'tests/transacciones/asignar.test.ts:baja el disponible del sobre y sube el dinero suelto por lo mismo',
    'tests/transacciones/periodo.test.ts:un gasto con sobre no mueve el dinero suelto de los periodos que lo ven',
  ],
  'Asignar sobre a un movimiento pendiente': [
    'tests/transacciones/asignar.test.ts:baja el disponible del sobre y sube el dinero suelto por lo mismo',
    'tests/transacciones/asignar.test.ts:asignar, quitar y volver a asignar vuelve al mismo estado',
    'tests/transacciones/acciones.test.ts:asignar sobre lo mueve, y vacio lo quita',
  ],
  'El saldo de la cuenta no cambia': [
    'tests/transacciones/asignar.test.ts:no toca el saldo de la cuenta',
  ],
  'Asignar un sobre de otra cartera': [
    'tests/transacciones/asignar.test.ts:rechaza un sobre de otra cartera con un error propio',
    'tests/transacciones/alta.test.ts:rechaza un sobre de otra cartera del mismo usuario',
  ],
  'Quitar el sobre de un movimiento': [
    'tests/transacciones/asignar.test.ts:devuelve el importe al dinero suelto y sube el disponible',
    'tests/transacciones/asignar.test.ts:quitar un sobre que no tenia no cambia nada',
  ],
  'Devolucion de una compra': [
    'tests/transacciones/devoluciones.test.ts:la devolucion sube el disponible del sobre',
    'tests/transacciones/devoluciones.test.ts:el par compra mas devolucion suma cero contra el estado previo a la compra',
  ],
  'Devolucion a un sobre archivado': [
    'tests/transacciones/devoluciones.test.ts:una devolucion a un sobre archivado se acumula y el sobre reaparece',
  ],
  'Una devolucion no crea dinero': [
    'tests/transacciones/devoluciones.test.ts:una devolucion no crea dinero: el dinero suelto no se mueve',
    'tests/transacciones/devoluciones.test.ts:la devolucion no rompe la invariante del patrimonio',
  ],
  'Corregir el importe de un gasto': [
    'tests/transacciones/editar.test.ts:ajusta el saldo de la cuenta y el disponible del sobre',
    'tests/transacciones/editar.test.ts:corregir un ingreso lo deja positivo',
  ],
  'Corregir la cuenta de un movimiento': [
    'tests/transacciones/editar.test.ts:rechaza una cuenta de otra cartera del mismo usuario',
    'tests/transacciones/editar.test.ts:rechaza una cuenta de otro usuario',
  ],
  'Corregir la fecha al periodo anterior': [
    'tests/transacciones/editar.test.ts:recalcula el disponible de los dos periodos que la fecha atraviesa',
    'tests/transacciones/editar.test.ts:mover un gasto al mes anterior no toca el disponible del mes de origen',
  ],
  'Borrado logico de un gasto': [
    'tests/transacciones/borrar.test.ts:la fila sigue en la tabla: el borrado es logico',
    'tests/transacciones/borrar.test.ts:deja de contar en las sumas sin borrar la fila',
  ],
  'Restaurar un movimiento eliminado': [
    'tests/transacciones/borrar.test.ts:lo devuelve a todas las sumas',
    'tests/transacciones/borrar.test.ts:la misma fila antes y despues de restaurar',
  ],
  'Borrar un traspaso completo': [
    'tests/transacciones/borrar.test.ts:borra las dos patas de una con un solo update',
    'tests/transacciones/borrar.test.ts:restaura las dos patas juntas',
    'tests/transacciones/pagina.test.ts:el boton de una pata dice que se restauran las dos',
  ],
  'Movimiento registrado tarde': [
    'tests/transacciones/periodo.test.ts:un movimiento registrado tarde pertenece a su fecha y no al mes de registro',
    'tests/transacciones/periodo.test.ts:la fecha guarda el dia local, sin hora',
  ],
  'Movimiento de fin de mes': [
    'tests/transacciones/periodo.test.ts:los tres limites del mes caen en su mes',
  ],
  'Alta retroactiva': [
    'tests/transacciones/periodo.test.ts:un alta retroactiva cambia el disponible del periodo y no se rechaza',
  ],
  'Edicion retroactiva': [
    'tests/transacciones/periodo.test.ts:la edicion retroactiva mueve los derivados de mayo y de los posteriores',
    'tests/transacciones/periodo.test.ts:mover la fecha de mayo a junio deja mayo como estaba',
  ],
  'Aviso de recalculo': [
    'tests/transacciones/vista.test.tsx:Aviso de recalculo: el disponible del mes anterior cambia: y el aviso lo dice',
    'tests/transacciones/acciones.test.ts:el periodo viaja para que la vista pueda avisar si fue retroactivo',
    'tests/transacciones/vista.test.tsx:el aviso sale dentro del formulario de alta, con el resultado que lo emitio',
  ],
  'Buscar por texto': [
    'tests/transacciones/alta.test.ts:busca el texto en la descripcion y en el comercio',
    'tests/transacciones/alta.test.ts:buscar "100%" no trae todos los movimientos',
    'tests/transacciones/pagina.test.ts:el texto de la URL filtra por descripcion y por comercio',
  ],
  'Filtrar por cuenta': [
    'tests/transacciones/alta.test.ts:filtra por cuenta',
    'tests/transacciones/pagina.test.ts:filtra por cuenta',
  ],
  'Filtrar por sobre': [
    'tests/transacciones/alta.test.ts:filtra por sobre',
  ],
  'Filtros combinados': [
    'tests/transacciones/alta.test.ts:combina los filtros, y una combinacion sin coincidencias devuelve lista vacia',
    'tests/transacciones/alta.test.ts:el filtro de texto no se come a los otros filtros',
    'tests/transacciones/pagina.test.ts:los filtros se combinan, y todos a la vez',
  ],
  'Limpiar filtros': [
    'tests/transacciones/pagina.test.ts:un filtro mal escrito no desarma la pagina: avisa y deja limpiar',
    'tests/transacciones/vista.test.tsx:el filtro vuelve escrito en los campos: por eso sobrevive a la recarga',
    'tests/transacciones/vista.test.tsx:un filtro invalido tambien avisa y deja limpiar',
  ],
  'Aislamiento entre usuarios': [
    'tests/transacciones/alta.test.ts:los movimientos de otro usuario no aparecen ni al filtrar por su cuenta',
    'tests/transacciones/pagina.test.ts:no trae los movimientos de otro usuario',
    'tests/transacciones/pagina.test.ts:no trae los movimientos de otra cartera del mismo usuario',
    'tests/transacciones/borrar.test.ts:no mezcla los eliminados de otro usuario',
  ],
  'Editar un movimiento ajeno': [
    'tests/transacciones/editar.test.ts:no edita un movimiento de otro usuario',
    'tests/transacciones/borrar.test.ts:no borra un movimiento de otro usuario',
    'tests/transacciones/asignar.test.ts:no asigna ni quita sobre un movimiento de otro usuario',
  ],
  'Determinacion de la cartera de un movimiento': [
    'tests/transacciones/esquema.test.ts:no tiene cartera_id: la cartera de un traspaso es la de cada pata',
    'tests/transacciones/alta.test.ts:no acepta una cartera declarada: la firma no la tiene',
    'tests/transacciones/esquema.test.ts:la tabla en la base tampoco las tiene',
  ],
}

/** Donde se buscan las pruebas que el mapa referencia. */
const CARPETAS = ['tests/transacciones']

/**
 * Los nombres de prueba de cada archivo, con la ruta como clave.
 *
 * Se leen con una expresion, no ejecutando los archivos: cargar 200 pruebas con PGlite para
 * descubrir sus nombres seria lento y no aportaria nada. El `.tsx` va junto al `.ts` porque
 * las pruebas de vista se escriben en JSX.
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

describe('trazabilidad de transacciones', () => {
  it('el mapa cubre los 33 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await readFile('openspec/specs/transacciones/spec.md', 'utf8')
    const delSpec = [...spec.matchAll(/^#### Scenario: (.+)$/gm)].map((c) => c[1]?.trim() ?? '')

    // La cuenta va explicita, y no solo la igualdad: si un escenario se perdiera **de los
    // dos lados** —del spec y de la lista— la igualdad seguiria cumpliendose.
    expect(delSpec).toHaveLength(33)
    expect(ESCENARIOS).toHaveLength(33)
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
