import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

/**
 * La vista de traspasos, probada sola.
 *
 * Sin base de datos y sin pagina: se renderizan los componentes con las props que les pasaria
 * el servidor. Lo que se verifica aca es **que dibuja la vista**, y hay una regla de la vista
 * que no vive en ningun repositorio y que por lo tanto no se puede probar en ningun otro
 * lugar:
 *
 * > La UI **avisa antes de guardar** que corregir una pata reescribe la opuesta (D5).
 *
 * Esa regla se prueba sobre el HTML, no sobre una llamada a la accion. Importa porque el aviso
 * tiene que existir **antes** del envio: si estuviera atado al click o al `onSubmit` ya estaria
 * tarde, y si viviera en el `catch` de la accion seria un aviso de que algo paso, no de que va
 * a pasar. Por eso el texto esta en el JSX del formulario y no se arma en ningun resultado.
 *
 * Las Server Actions van mockeadas porque el render estatico **nunca** las invoca. Lo que las
 * acciones hacen esta cubierto en `acciones.test.ts`.
 */
vi.mock('@/traspasos/acciones', () => ({
  accionRegistrarTraspaso: async () => ({ ok: true }),
  accionEditarTraspaso: async () => ({ ok: true }),
}))

const { FilaEditarTraspaso, FormularioNuevoTraspaso, RecorridoDeTraspaso } = await import(
  '@/components/traspasos'
)
type MovimientoEnVista = import('@/components/transacciones').MovimientoEnVista

const CUENTAS = [
  { id: 1, nombre: 'Corriente' },
  { id: 2, nombre: 'Ahorro' },
]

/** El mes que se esta mirando. */
const PERIODO = '2026-09'

function html(elemento: ReactElement): string {
  return renderToStaticMarkup(elemento)
}

/** Una pata de traspaso. Cada prueba cambia lo que necesita. */
function pata(extra: Partial<MovimientoEnVista> = {}): MovimientoEnVista {
  return {
    id: 500,
    cuenta_id: 1,
    cuenta_nombre: 'Corriente',
    sobre_id: null,
    sobre_nombre: null,
    tipo: 'traspaso',
    monto: '-2500.00',
    fecha: '2026-09-15',
    descripcion: 'Ahorro de septiembre',
    comercio: null,
    pendiente: false,
    pata: true,
    contraparte_cuenta_id: 2,
    contraparte_cuenta_nombre: 'Ahorro',
    ...extra,
  }
}

describe('070: el aviso de edicion en espejo esta en el HTML, antes de guardar', () => {
  it('sale siempre que el formulario esta abierto', () => {
    const marcado = html(
      <FilaEditarTraspaso cartera_id={7} movimiento={pata()} cuentas={CUENTAS} periodo={PERIODO} />,
    )

    // Sin ningun submit, sin ningun `onClick`: solo abrir el formulario ya dice esto.
    expect(marcado).toContain('Esto mueve las dos patas')
    // Y nombra la contraparte concreta, para que el efecto errno con algo que el usuario puede
    // verificar en la pantalla.
    expect(marcado).toContain('Ahorro')
    expect(marcado).toContain('importe opuesto')
  })

  it('sin contraparte el aviso habla del grupo, no de una pata opuesta que no existe', () => {
    const marcado = html(
      <FilaEditarTraspaso
        cartera_id={7}
        movimiento={pata({ contraparte_cuenta_id: null, contraparte_cuenta_nombre: null })}
        cuentas={CUENTAS}
        periodo={PERIODO}
      />,
    )

    expect(marcado).toContain('Esto mueve las dos patas')
    expect(marcado).toContain('una sola pata')
    // "Ahorro" aca es el nombre de la opcion del desplegable, no el de una contraparte.
    expect(marcado).not.toContain('importe opuesto')
  })

  it('el boton dice que se guarda el traspaso, no el movimiento', () => {
    const marcado = html(
      <FilaEditarTraspaso cartera_id={7} movimiento={pata()} cuentas={CUENTAS} periodo={PERIODO} />,
    )

    expect(marcado).toContain('Guardar el traspaso')
  })
})

describe('070: el importe del formulario va en positivo y exacto', () => {
  it('quita el signo de la pata sin pasar por un float', () => {
    // El `-2500.00` de la pata es el signo de la otra cuenta. El campo pide la cantidad que
    // viaja, que es `2500.00`.
    const marcado = html(
      <FilaEditarTraspaso cartera_id={7} movimiento={pata()} cuentas={CUENTAS} periodo={PERIODO} />,
    )

    expect(marcado).toContain('value="2500.00"')
    expect(marcado).not.toContain('value="-2500.00"')
  })

  it('un importe de magnitud grande no pierde centavos al sacarle el signo', () => {
    // La razon de que esto sea una prueba y no una linea de codigo: `Math.abs(Number(x))` a
    // esta magnitud devuelve `...56.8`, y el centimo perdido se veria como diferencia de saldo
    // en la fila de al lado.
    const marcado = html(
      <FilaEditarTraspaso
        cartera_id={7}
        movimiento={pata({ monto: '-1234567890123456.78' })}
        cuentas={CUENTAS}
        periodo={PERIODO}
      />,
    )

    expect(marcado).toContain('value="1234567890123456.78"')
  })
})

describe('070: el formulario de alta', () => {
  it('ofrece el destino vacio con un texto que explica que es una pata sola', () => {
    const marcado = html(
      <FormularioNuevoTraspaso cartera_id={7} cuentas={CUENTAS} periodo={PERIODO} />,
    )

    // "Vacio" sin explicar parece un forgot. La opcion dice lo que va a pasar.
    expect(marcado).toContain('Sin contraparte (una pata sola)')
    // Y el destino es opcional de verdad: sin `required` el navegador no bloquea el envio.
    expect(marcado).toMatch(/<select name="destino_cuenta_id"(?![^>]*required)/)
  })

  it('no tiene selector de sobre, porque un traspaso no gasta', () => {
    const marcado = html(
      <FormularioNuevoTraspaso cartera_id={7} cuentas={CUENTAS} periodo={PERIODO} />,
    )

    // Un selector de sobre aca seria una promesa que `editarMovimiento` no puede cumplir:
    // R2 dice que a una pata no se le asigna sobre.
    expect(marcado).not.toContain('name="sobre_id"')
  })

  it('dice que no toca ningun sobre y separa los dos desplegables', () => {
    const marcado = html(
      <FormularioNuevoTraspaso cartera_id={7} cuentas={CUENTAS} periodo={PERIODO} />,
    )

    // El texto explica la consecuencia antes de que el usuario elija, no despues del error.
    expect(marcado).toContain('no toca ningun sobre')
    // Y son dos desplegables con nombres distintos: es el par de R1, no un campo "cuenta".
    expect(marcado).toContain('name="origen_cuenta_id"')
    expect(marcado).toContain('name="destino_cuenta_id"')
  })
})

describe('070: el recorrido de un traspaso en el historial', () => {
  it('con contraparte muestra el par de cuentas', () => {
    const marcado = html(<RecorridoDeTraspaso movimiento={pata()} />)

    expect(marcado).toContain('De Corriente a Ahorro')
  })

  it('sin contraparte lo dice, en vez de mostrar un hueco', () => {
    const marcado = html(
      <RecorridoDeTraspaso
        movimiento={pata({ contraparte_cuenta_id: null, contraparte_cuenta_nombre: null })}
      />,
    )

    expect(marcado).toContain('De Corriente, sin contraparte')
  })

  it('un gasto o un ingreso no dibuja recorrido', () => {
    // Devolver `null` y no un string vacio: el que lo compone lo mete junto al nombre de la
    // cuenta, y un `<span>` vacio ocuparia lugar en la maqueta sin decir nada.
    expect(html(<RecorridoDeTraspaso movimiento={pata({ tipo: 'gasto', pata: false })} />)).toBe('')
  })
})
