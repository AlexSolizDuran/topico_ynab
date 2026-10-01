import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Portada from '@/app/page'
import { formatear } from '@/dinero'

/**
 * La portada es la primera pantalla que ve alguien que todavia no tiene cuenta.
 *
 * Lo que se prueba aca no es el estilo, sino lo tres cosas de las que depende que la
 * landing sirva: que los dos botones existan y apunten a las pantallas reales del
 * sistema, que el texto no prometaFeatures que el dominio no tiene, y que los
 * importes de ejemplo salgan formateados con la regla del dinero y no como float.
 *
 * La ultima es la que mas importa: la portada es el unico lugar del codigo donde
 * hay cifras escritas a mano, asi que es el unico donde un `Number(...)` pasaria
 * desapercibido hasta que `tests/regla-del-dinero.test.ts` lo viera.
 */

const html = renderToStaticMarkup(React.createElement(Portada))

/** Texto visible, sin el marcado: para poder afirmar sobre lo que se lee. */
const texto = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('la portada', () => {
  it('ofrece las dos entradas al sistema: crear cuenta y entrar', () => {
    expect(html).toContain('href="/registro"')
    expect(html).toContain('href="/entrar"')

    // Los dos textos tienen que estar en la pantalla, no solo los enlaces: un boton
    // sin etiqueta visible no es un boton para quien navega con lector de pantalla.
    expect(texto).toMatch(/Crear mi cuenta/)
    expect(texto).toMatch(/Ya tengo cuenta, entrar/)
  })

  it('explica el dominio con el vocabulario real del sistema', () => {
    expect(texto).toMatch(/sobre/i)
    expect(texto).toMatch(/patrimonio/i)
    expect(texto).toMatch(/dinero suelto/i)
    expect(texto).toMatch(/disponible/i)
  })

  it('dice que cada usuario ve solo sus datos', () => {
    // Es la unica promesa de seguridad de la landing, y la que `autenticacion` R7
    // garantiza. Si desaparece de la pantalla, la landing esta prometiendo menos de
    // lo que el sistema cumple.
    expect(texto).toMatch(/únicamente sus propios datos/)
  })

  it('no ofrece presupuesto porcentual ni conversion de moneda', () => {
    // Las dos estan FUERA de alcance por decision de dominio (`AGENTS.md`,
    // `PREGUNTAS.md`). Anunciarlas en la portada seria vender algo que no existe.
    expect(texto).not.toMatch(/porcentual/i)
    expect(texto).not.toMatch(/conver(t|s|ti)[oó]n de moneda/i)
    expect(texto).not.toMatch(/tipo de cambio/i)
  })

  it('no dice que los meses se reinicien, porque no se reinician', () => {
    expect(texto).not.toMatch(/cada mes (empieza|reinicia|comienza) (de cero|en cero)/i)
  })

  it('muestra los importes de ejemplo con la regla del dinero', () => {
    // Se compares contra `formatear` y no contra literales: asi la prueba sigue
    // valiendo si cambia el separador de miles o el simbolo de la moneda.
    expect(html).toContain(formatear('48250.00', 'MXN'))
    expect(html).toContain(formatear('38900.00', 'MXN'))
    expect(html).toContain(formatear('9350.00', 'MXN'))

    // Las cifras tabular son obligatorias en todo importe (`globals.css`): sin
    // `cifra` las columnas bailan al cambiar de valor.
    expect(html).toContain('cifra')
  })

  it('esta toda en español, sin palabras de otro idioma coladas', () => {
    // La redaccion de la landing se escribio a mano y es el texto mas largo del
    // proyecto. Estas palabras se colaron una vez ("difficult", "Highlights",
    // "worry"), asi que la prueba las fija: la landing es la unica pagina que un
    // usuario lee antes de crear su cuenta, y es la que menos se revisa.
    const ingles = [
      'difficult',
      'Highlights',
      'worry',
      'Features',
      'Learn more',
      'Get started',
      'Sign up',
      'Log in',
      'Dashboard',
      'over budget',
    ]

    for (const palabra of ingles) {
      expect(texto, `se coló "${palabra}"`).not.toContain(palabra)
    }
  })

  it('marca el panel de muestra como ejemplo, para que no se lea como un saldo real', () => {
    expect(texto).toMatch(/Ejemplo/)
  })
})
