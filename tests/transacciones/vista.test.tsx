import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

/**
 * La vista de movimientos, probada sola.
 *
 * Sin base de datos y sin pagina: se renderizan los componentes con las props que les pasaria
 * el servidor. Esto no reemplaza a `pagina.test.ts`, que es donde se comprueba que la pagina
 * recorta por cartera y arma bien la URL; es la otra mitad. Aqui se verifica **que dibuja la
 * vista**, y en particular las tres reglas que son de la vista y no de ningun repositorio:
 *
 * 1. El aviso retroactivo aparece en el HTML cuando la fecha es de un mes anterior, y **no**
 *    aparece cuando no corresponde. Un aviso que sale siempre termina siendo ruido, y el ruido
 *    es la forma mas comun de que un aviso deje de leerse.
 * 2. Lo pendiente se marca como "sin asignar" y ofrece la accion de asignarle un sobre.
 * 3. Una pata de traspaso se corrige con el formulario de traspasos —no con el de un
 *    movimiento suelto— y no ofrece asignar sobre. El aviso de que la correccion mueve las dos
 *    patas vive en `tests/traspasos/vista.test.tsx`; aca solo se comprueba que el formulario
 *    que se abre es el correcto.
 *
 * Las Server Actions van mockeadas porque el render estatico **nunca** las invoca: lo que se
 * esta probando es el HTML de salida, no la escritura. Lo que las acciones hacen esta cubierto
 * en `acciones.test.ts`.
 */
vi.mock('@/transacciones/acciones', () => ({
  accionRegistrarMovimiento: async () => ({ ok: true }),
  accionEditarMovimiento: async () => ({ ok: true }),
  accionEliminarMovimiento: async () => ({ ok: true }),
  accionRestaurarMovimiento: async () => ({ ok: true }),
  accionAsignarSobre: async () => ({ ok: true }),
}))

const {
  FilaMovimiento,
  FilaMovimientoEliminada,
  FormularioNuevoMovimiento,
  ListaMovimientos,
  ListaMovimientosEliminados,
} = await import('@/components/transacciones')
const { AvisoRetroactivo } = await import('@/components/sesion')
type MovimientoEnVista = import('@/components/transacciones').MovimientoEnVista

const { formatear } = await import('@/dinero')

const CUENTAS = [
  { id: 1, nombre: 'Banco' },
  { id: 2, nombre: 'Efectivo' },
]
const SOBRES = [
  { id: 10, nombre: 'Comida' },
  { id: 11, nombre: 'Transporte' },
]

/** El mes que se esta mirando. */
const PERIODO = '2026-09'

/** Una fila con sobre y todo asignado. Es el caso base; cada prueba cambia lo que necesita. */
function fila(extra: Partial<MovimientoEnVista> = {}): MovimientoEnVista {
  return {
    id: 100,
    cuenta_id: 1,
    cuenta_nombre: 'Banco',
    sobre_id: 10,
    sobre_nombre: 'Comida',
    tipo: 'gasto',
    monto: '-100.00',
    fecha: '2026-09-15',
    descripcion: 'Compra',
    comercio: null,
    pendiente: false,
    pata: false,
    contraparte_cuenta_id: null,
    contraparte_cuenta_nombre: null,
    ...extra,
  }
}

function render(element: ReactElement): string {
  return renderToStaticMarkup(element)
}

describe('060: el aviso retroactivo en el HTML', () => {
  // Los nombres de estas pruebas pueden llevar dos puntos, y las referencias del mapa de
  // trazabilidad los escriben como `archivo:nombre`. Por eso el corte es en la **primera**
  // aparicion del `:` y no en la ultima, y por eso hay al menos un nombre con dos: el
  // `escenarios.test.ts` de esta capacidad verifica que el corte aguanta.
  it('Aviso de recalculo: el disponible del mes anterior cambia: y el aviso lo dice', () => {
    // R7: el movimiento entró en un mes anterior, y el usuario tiene que saber cual. El
    // periodo va escrito en el aviso, no solo "en el mes pasado": al cuarto mes de uso la
    // memoria ya no alcanza y el aviso sin fecha no se puede actionar.
    const marcado = render(<AvisoRetroactivo periodoAfectado="2026-08" periodoActual={PERIODO} />)

    expect(marcado).toContain('2026-08')
    expect(marcado).toContain('disponible')
  })

  it('no dice nada cuando el periodo afectado es el que se esta mirando', () => {
    // El caso negativo importa tanto como el positivo.
    expect(
      render(<AvisoRetroactivo periodoAfectado={PERIODO} periodoActual={PERIODO} />),
    ).toBe('')
  })

  it('no dice nada cuando no hay periodo afectado', () => {
    // Una operacion del periodo actual no trae `periodo_afectado`: es el caso normal y no
    // puede avisar de una retrospectividad que no hubo.
    expect(render(<AvisoRetroactivo periodoActual={PERIODO} />)).toBe('')
  })

  it('el aviso sale dentro del formulario de alta, con el resultado que lo emitio', () => {
    // El aviso no es un componente suelto: tiene que aparecer en el HTML del formulario que
    // emitio la accion. `estadoInicial` es la costura para poder comprobarlo sin base de datos.
    const marcado = render(
      <FormularioNuevoMovimiento
        cartera_id={1}
        cuentas={CUENTAS}
        sobres={SOBRES}
        periodo={PERIODO}
        estadoInicial={{ ok: true, aviso: 'Movimiento registrado.', periodo_afectado: '2026-08' }}
      />,
    )

    expect(marcado).toContain('Movimiento registrado.')
    expect(marcado).toContain('2026-08')
  })

  it('un error no trae aviso retroactivo', () => {
    // `periodo_afectado` no viaja con los errores, asi que no hay aviso que mostrar: solo el
    // mensaje. Sin esto, un error de validacion pondria "entro en el mes pasado" al lado.
    const marcado = render(
      <FormularioNuevoMovimiento
        cartera_id={1}
        cuentas={CUENTAS}
        sobres={SOBRES}
        periodo={PERIODO}
        estadoInicial={{ ok: false, error: 'El importe no es valido.' }}
      />,
    )

    expect(marcado).toContain('El importe no es valido.')
    expect(marcado).not.toContain('El movimiento entró en')
  })
})

describe('060: la fila segun su estado', () => {
  function filaHTML(movimiento: MovimientoEnVista): string {
    return render(
      <ul>
        <FilaMovimiento
          cartera_id={1}
          movimiento={movimiento}
          cuentas={CUENTAS}
          sobres={SOBRES}
          moneda="ARS"
          periodo={PERIODO}
        />
      </ul>,
    )
  }

  it('una fila con sobre ofrece corregir, borrar y quitar', () => {
    const marcado = filaHTML(fila())

    expect(marcado).toContain('Compra')
    expect(marcado).toContain('Corregir')
    expect(marcado).toContain('Borrar')
    expect(marcado).toContain('Quitar sobre')
    expect(marcado).not.toContain('sin asignar')
  })

  it('una pendiente se marca "sin asignar" y ofrece darle un sobre', () => {
    // Escenario `Movimiento pendiente en la lista`: R2 dice que sin sobre es pendiente, y
    // la accion para resolverlo va **en la misma fila**, que es donde el usuario la busca.
    const marcado = filaHTML(
      fila({ sobre_id: null, sobre_nombre: null, pendiente: true, descripcion: 'Sin sobre' }),
    )

    expect(marcado).toContain('sin asignar')
    expect(marcado).toContain('Asignar sobre')
    // Y no ofrece quitar: no hay nada que quitar.
    expect(marcado).not.toContain('Quitar sobre')
  })

  it('una pata no se asigna, se corrige en espejo, y su boton dice que se van las dos', () => {
    // R6: borrar una pata borra las dos, y el boton lo dice.
    //
    // La edicion **si** existe, y cambio con `070` D5: antes `editarMovimiento` rechazaba una
    // pata con `PataDeTraspaso` y por eso la fila no offertaba "Corregir". Ahora la pata se
    // corrige escribiendo el grupo entero, asi que el `<details>` abre el formulario de
    // traspasos y no el de un movimiento suelto.
    //
    // Lo que sigue sin existir para una pata es la **asignacion** de sobre: el repositorio la
    // rechaza con `TraspasoNoAsignable`, asi que el boton no puede llevar a un error que el
    // formulario no podia prever.
    const marcado = filaHTML(
      fila({
        sobre_id: null,
        sobre_nombre: null,
        tipo: 'traspaso',
        pata: true,
        pendiente: false,
        descripcion: 'Pata',
      }),
    )

    expect(marcado).toContain('pata de un traspaso')
    expect(marcado).toContain('Borrar las dos patas')
    expect(marcado).toContain('Corregir el traspaso')
    expect(marcado).not.toContain('Asignar sobre')
    // Y tampoco queda como pendiente: el dinero de un traspaso no esta esperando destino.
    expect(marcado).not.toContain('sin asignar')
  })

  it('una pata con contraparte se lee de donde a donde', () => {
    // R4: el historial distingue el traspaso de un gasto o un ingreso cualquiera. Con dos
    // cuentas el recorrido muestra el par; con una sola pata, que falta la contraparte —y eso
    // es informacion, no un dato vacio.
    const conContraparte = filaHTML(
      fila({
        sobre_id: null,
        sobre_nombre: null,
        tipo: 'traspaso',
        pata: true,
        pendiente: false,
        cuenta_nombre: 'Banco',
        contraparte_cuenta_id: 2,
        contraparte_cuenta_nombre: 'Efectivo',
      }),
    )

    expect(conContraparte).toContain('De Banco a Efectivo')

    const sinContraparte = filaHTML(
      fila({
        sobre_id: null,
        sobre_nombre: null,
        tipo: 'traspaso',
        pata: true,
        pendiente: false,
        cuenta_nombre: 'Banco',
        contraparte_cuenta_id: null,
        contraparte_cuenta_nombre: null,
      }),
    )

    expect(sinContraparte).toContain('De Banco, sin contraparte')
  })

  it('el importe va formateado y el sobre en el pie', () => {
    const marcado = filaHTML(fila({ monto: '-1234.50' }))

    // Se compara contra `formatear` y no contra un literal: la forma exacta depende de los
    // separadores del locale del ICU que este corriendo, y una prueba que fija "-1.234,50"
    // falla por el entorno y no por el codigo.
    expect(marcado).toContain(formatear('-1234.50', 'ARS'))
    expect(marcado).toContain('Comida')
    expect(marcado).toContain('2026-09-15')
    // Y el string crudo de `numeric` aparece una sola vez: en el `defaultValue` del campo de
    // edicion, que es donde tiene que ir. En un input, formateado, el usuario no podria
    // devolver lo que escribio. No se puede afirmar que no aparezca en ningun lado.
    expect(marcado.split('-1234.50')).toHaveLength(2)
  })
})

describe('060: los eliminados', () => {
  it('solo ofrecen restaurar', () => {
    // Las otras tres acciones no existen sobre una fila eliminada: el repositorio las
    // rechaza, asi que un boton que solo puede terminar en error esotope la pantalla.
    const marcado = render(
      <ul>
        <FilaMovimientoEliminada
          cartera_id={1}
          movimiento={fila()}
          moneda="ARS"
          eliminada_en="2026-09-20T10:00:00.000Z"
        />
      </ul>,
    )

    expect(marcado).toContain('Restaurar')
    expect(marcado).toContain('elimin')
    expect(marcado).not.toContain('Asignar sobre')
    expect(marcado).not.toContain('Quitar sobre')
    expect(marcado).not.toContain('Corregir')
  })

  it('la pata restaurada dice que vuelven las dos', () => {
    const marcado = render(
      <ul>
        <FilaMovimientoEliminada
          cartera_id={1}
          movimiento={fila({ pata: true, tipo: 'traspaso', sobre_id: null, sobre_nombre: null })}
          moneda="ARS"
          eliminada_en="2026-09-20T10:00:00.000Z"
        />
      </ul>,
    )

    expect(marcado).toContain('Restaurar las dos patas')
  })

  it('sin eliminados no se dibuja la seccion', () => {
    // Una lista vacia de eliminados informa de que no hay errores, y eso no es informacion.
    expect(
      render(
        <ListaMovimientosEliminados
          cartera_id={1}
          movimientos={[]}
          moneda="ARS"
          eliminados_en={new Map()}
        />,
      ),
    ).toBe('')
  })

  it('la seccion lista los eliminados y explica que no cuentan', () => {
    const marcado = render(
      <ListaMovimientosEliminados
        cartera_id={1}
        movimientos={[fila({ id: 1, descripcion: 'Borrado' }), fila({ id: 2, descripcion: 'Otro' })]}
        moneda="ARS"
        eliminados_en={new Map([[1, '2026-09-20T10:00:00.000Z']])}
      />,
    )

    expect(marcado).toContain('Eliminados')
    expect(marcado).toContain('Borrado')
    expect(marcado).toContain('Otro')
    expect(marcado).toContain('No cuentan')
  })
})

describe('060: los filtros en la vista', () => {
  function listaHTML(props: Partial<Parameters<typeof ListaMovimientos>[0]> = {}): string {
    return render(
      <ListaMovimientos
        cartera_id={1}
        movimientos={[fila()]}
        cuentas={CUENTAS}
        sobres={SOBRES}
        moneda="ARS"
        periodo={PERIODO}
        filtro={{
          texto: '',
          cuenta_id: '',
          sobre_id: '',
          tipo: '',
          desde: '',
          hasta: '',
        }}
        hayFiltro={false}
        {...props}
      />,
    )
  }

  it('el filtro vuelve escrito en los campos: por eso sobrevive a la recarga', () => {
    const marcado = listaHTML({
      hayFiltro: true,
      filtro: {
        texto: 'Uber',
        cuenta_id: '2',
        sobre_id: '11',
        tipo: 'gasto',
        desde: '2026-09-01',
        hasta: '2026-09-30',
      },
    })

    expect(marcado).toContain('value="Uber"')
    expect(marcado).toContain('value="2026-09-01"')
    expect(marcado).toContain('value="2026-09-30"')
    expect(marcado).toContain('Limpiar')
  })

  it('un filtro que no matchea avisa, y no dice que la cartera esta vacia', () => {
    // La diferencia importa: "no hay movimientos" y "no hay movimientos con este filtro" son
    // dos hechos distintos, y confundirlos hace creer al usuario que perdio datos.
    const marcado = listaHTML({ movimientos: [], hayFiltro: true })

    expect(marcado).toContain('Ningún movimiento coincide con el filtro')
    expect(marcado).not.toContain('Todavía no hay movimientos')
  })

  it('una cartera vacia sin filtro lo dice distinto', () => {
    const marcado = listaHTML({ movimientos: [] })

    expect(marcado).toContain('Todavía no hay movimientos')
    expect(marcado).not.toContain('Limpiar')
  })

  it('un filtro invalido tambien avisa y deja limpiar', () => {
    // El filtro no se pudo aplicar. Mostrar la lista entera seria peor que no ver nada: el
    // usuario pensaria que el filtro y son sus datos los que no aparecen.
    const marcado = listaHTML({ hayFiltro: true, filtroInvalido: true })

    expect(marcado).toContain('Ningún movimiento coincide con el filtro')
    expect(marcado).toContain('Limpiar')
  })
})
