import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VistaResumen } from '../../src/components/resumen'
import type { DatosResumenGlobal } from '../../src/repos/resumen-global'

const datos: DatosResumenGlobal = {
  periodo: '2026-03',
  meses: 12,
  grupos: [
    {
      moneda: 'MXN',
      capital: { patrimonio: '14500.00', en_sobres: '2000.00', dinero_suelto: '12500.00' },
      flujo: { ingresado: '30000.00', gastado: '15000.00', neto: '15000.00' },
      carteras: [
        {
          id: 1,
          nombre: 'Principal',
          moneda: 'MXN',
          archivada: false,
          patrimonio: '14500.00',
          en_sobres: '2000.00',
          dinero_suelto: '12500.00',
        },
      ],
      mensual: [{ clave: '2026-03', ingresado: '30000.00', gastado: '15000.00', neto: '15000.00' }],
      anual: [{ clave: '2026', ingresado: '30000.00', gastado: '15000.00', neto: '15000.00' }],
      diario: [
        { clave: '2026-03-05', ingresado: '0.00', gastado: '12000.00', neto: '-12000.00' },
        { clave: '2026-03-06', ingresado: '0.00', gastado: '3000.00', neto: '-3000.00' },
      ],
      top_comercios: [
        { comercio: 'Super', gastado: '12000.00', operaciones: 1 },
        { comercio: 'Cafe', gastado: '3000.00', operaciones: 1 },
      ],
    },
    {
      moneda: 'USD',
      capital: { patrimonio: '600.00', en_sobres: '0.00', dinero_suelto: '600.00' },
      flujo: { ingresado: '1000.00', gastado: '400.00', neto: '600.00' },
      carteras: [],
      mensual: [{ clave: '2026-03', ingresado: '1000.00', gastado: '400.00', neto: '600.00' }],
      anual: [{ clave: '2026', ingresado: '1000.00', gastado: '400.00', neto: '600.00' }],
      diario: [{ clave: '2026-03-08', ingresado: '0.00', gastado: '400.00', neto: '-400.00' }],
      top_comercios: [{ comercio: 'Amazon', gastado: '400.00', operaciones: 1 }],
    },
  ],
}

describe('130: vista de resumen global', () => {
  it('R1-R9: renderiza las cifras, las series, el gasto diario y los comercios de la moneda activa', () => {
    const html = renderToStaticMarkup(<VistaResumen datos={datos} />)

    expect(html).toContain('Patrimonio')
    expect(html).toContain('En sobres')
    expect(html).toContain('Sin asignar')
    expect(html).toContain('Ultimos 12 meses')
    expect(html).toContain('Gasto diario')
    expect(html).toContain('Top comercios')
    expect(html).toContain('Super')
    expect(html).toContain('2026-03')
  })

  it('R9: no ofrece controles de captura ni edicion', () => {
    const html = renderToStaticMarkup(<VistaResumen datos={datos} />)

    expect(html).not.toContain('<textarea')
    expect(html).toContain('action="/resumen"')
    expect(html).toContain('method="get"')
  })

  it('muestra un gasto negativo con un solo signo menos', () => {
    const html = renderToStaticMarkup(
      <VistaResumen
        datos={{
          ...datos,
          grupos: [{ ...datos.grupos[0]!, flujo: { ...datos.grupos[0]!.flujo, gastado: '-15000.00' } }],
        }}
      />
    )

    expect(html).not.toContain('--')
  })
})
