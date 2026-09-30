import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import {
  AvisoHistoriaModificada,
  EvolucionPatrimonio,
  TarjetaPatrimonio,
} from '@/components/patrimonio'
import type { HistorialPatrimonio } from '@/repos/patrimonio'

function html(elemento: ReactElement): string {
  return renderToStaticMarkup(elemento)
}

describe('100: componentes de interfaz de patrimonio', () => {
  describe('TarjetaPatrimonio', () => {
    it('muestra el patrimonio destacado y la fórmula de desglose de la invariante', () => {
      const res = html(
        <TarjetaPatrimonio
          patrimonio="30000.00"
          enSobres="22000.00"
          dineroSuelto="8000.00"
          moneda="MXN"
          periodo="2026-03"
        />,
      )

      expect(res).toContain('Patrimonio (2026-03)')
      expect(res).toContain('30,000.00')
      expect(res).toContain('22,000.00 en sobres')
      expect(res).toContain('8,000.00 sin asignar')
    })
  })

  describe('EvolucionPatrimonio', () => {
    it('muestra estado vacío cuando no existen registros históricos', () => {
      const vacio: HistorialPatrimonio = {
        cartera_id: 1,
        nombre_cartera: 'Mi Cartera',
        moneda: 'MXN',
        periodos: [],
      }

      const res = html(<EvolucionPatrimonio historial={vacio} />)
      expect(res).toContain('No hay registros históricos de patrimonio en esta cartera.')
    })

    it('presenta la serie cronológica, desgloses y variaciones', () => {
      const historial: HistorialPatrimonio = {
        cartera_id: 1,
        nombre_cartera: 'Cartera Principal',
        moneda: 'MXN',
        periodos: [
          {
            periodo: '2026-01',
            patrimonio: '10000.00',
            disponible_sobres: '8000.00',
            dinero_suelto: '2000.00',
            diferencia_absoluta: null,
            variacion_porcentual: null,
            porcentaje_texto: null,
          },
          {
            periodo: '2026-02',
            patrimonio: '15000.00',
            disponible_sobres: '12000.00',
            dinero_suelto: '3000.00',
            diferencia_absoluta: '5000.00',
            variacion_porcentual: 50,
            porcentaje_texto: '+50.00%',
          },
          {
            periodo: '2026-03',
            patrimonio: '30000.00',
            disponible_sobres: '22000.00',
            dinero_suelto: '8000.00',
            diferencia_absoluta: '15000.00',
            variacion_porcentual: 100,
            porcentaje_texto: '+100.00%',
          },
        ],
      }

      const res = html(<EvolucionPatrimonio historial={historial} />)

      expect(res).toContain('Evolución del Patrimonio')
      expect(res).toContain('Cartera Principal (MXN)')
      expect(res).toContain('2026-01')
      expect(res).toContain('2026-02')
      expect(res).toContain('2026-03')
      expect(res).toContain('Primer periodo')
      expect(res).toContain('+50.00%')
      expect(res).toContain('+100.00%')
    })

    it('incluye banner de aviso cuando la historia ha sido modificada', () => {
      const historial: HistorialPatrimonio = {
        cartera_id: 1,
        nombre_cartera: 'Cartera Principal',
        moneda: 'MXN',
        periodos: [
          {
            periodo: '2026-03',
            patrimonio: '30000.00',
            disponible_sobres: '22000.00',
            dinero_suelto: '8000.00',
            diferencia_absoluta: null,
            variacion_porcentual: null,
            porcentaje_texto: null,
          },
        ],
      }

      const res = html(<EvolucionPatrimonio historial={historial} avisoRetroactivo={true} />)
      expect(res).toContain('La historia del patrimonio cambió.')
    })
  })

  describe('AvisoHistoriaModificada', () => {
    it('renderiza con rol alert y mensaje normativo', () => {
      const res = html(<AvisoHistoriaModificada />)
      expect(res).toContain('role="alert"')
      expect(res).toContain('La historia del patrimonio cambió.')
    })
  })
})
