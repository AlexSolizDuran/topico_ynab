import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VistaComparativos } from '../../src/components/comparativos'
import type { DatosComparativo } from '../../src/repos/comparativos'

describe('120: vista de comparativos (VistaComparativos)', () => {
  const datosMock: DatosComparativo = {
    cartera: {
      id: 1,
      nombre: 'Cartera Test',
      moneda: 'MXN',
    },
    periodos: ['2026-01', '2026-02', '2026-03'],
    periodo_referencia: '2026-03',
    umbral: {
      porcentaje: 20,
      importe_absoluto: '500.00',
    },
    grupos: [
      {
        id: 10,
        nombre: 'Alimentación',
        orden: 1,
        totales_por_periodo: {
          '2026-01': '1200.00',
          '2026-02': '3000.00',
          '2026-03': '1200.00',
        },
        variaciones: {
          '2026-01': {
            periodo: '2026-01',
            importe: '1200.00',
            diferencia: '0.00',
            diferencia_absoluta: '0.00',
            direccion: 'sin_cambio',
            porcentaje: '0.00%',
            porcentaje_numero: 0,
            destacada: false,
          },
          '2026-02': {
            periodo: '2026-02',
            importe: '3000.00',
            diferencia: '1800.00',
            diferencia_absoluta: '1800.00',
            direccion: 'aumento',
            porcentaje: '+150.00%',
            porcentaje_numero: 150,
            destacada: true,
          },
        },
        tiene_variacion_destacada: true,
        sobres: [
          {
            id: 101,
            grupo_id: 10,
            nombre: 'Supermercado',
            archivado: false,
            orden: 1,
            importes_por_periodo: {
              '2026-01': '1200.00',
              '2026-02': '3000.00',
              '2026-03': '1200.00',
            },
            variaciones: {
              '2026-01': {
                periodo: '2026-01',
                importe: '1200.00',
                diferencia: '0.00',
                diferencia_absoluta: '0.00',
                direccion: 'sin_cambio',
                porcentaje: '0.00%',
                porcentaje_numero: 0,
                destacada: false,
              },
              '2026-02': {
                periodo: '2026-02',
                importe: '3000.00',
                diferencia: '1800.00',
                diferencia_absoluta: '1800.00',
                direccion: 'aumento',
                porcentaje: '+150.00%',
                porcentaje_numero: 150,
                destacada: true,
              },
            },
            tiene_variacion_destacada: true,
          },
        ],
      },
    ],
    total_general_por_periodo: {
      '2026-01': '1200.00',
      '2026-02': '3000.00',
      '2026-03': '1200.00',
    },
    variaciones_total_general: {
      '2026-02': {
        periodo: '2026-02',
        importe: '3000.00',
        diferencia: '1800.00',
        diferencia_absoluta: '1800.00',
        direccion: 'aumento',
        porcentaje: '+150.00%',
        porcentaje_numero: 150,
        destacada: true,
      },
    },
    hay_variaciones_destacadas: true,
    elementos_destacados: [
      {
        tipo: 'sobre',
        id: 101,
        nombre: 'Supermercado',
        periodo: '2026-02',
        diferencia: '1800.00',
        diferencia_absoluta: '1800.00',
        direccion: 'aumento',
        porcentaje: '+150.00%',
      },
    ],
  }

  it('R1: renderiza la tabla de categorías con sobres y grupos desglosados', () => {
    const html = renderToStaticMarkup(<VistaComparativos datos={datosMock} />)
    expect(html).toContain('Comparativo de periodos')
    expect(html).toContain('Alimentación')
    expect(html).toContain('Supermercado')
    expect(html).toContain('Total General')
  })

  it('R1: renderiza los selectores de periodos y periodo de referencia', () => {
    const html = renderToStaticMarkup(<VistaComparativos datos={datosMock} />)
    expect(html).toContain('Periodo de referencia')
    expect(html).toContain('2026-03 (Referencia actual)')
  })

  it('R2: destaca variaciones relevantes con su dirección, importe y porcentaje', () => {
    const html = renderToStaticMarkup(<VistaComparativos datos={datosMock} />)
    expect(html).toContain('Variaciones relevantes')
    expect(html).toContain('Aumento')
    expect(html).toContain('+150.00%')
  })

  it('R2: muestra mensaje "Sin variaciones relevantes" si no hay ninguna', () => {
    const datosSinVariaciones: DatosComparativo = {
      ...datosMock,
      hay_variaciones_destacadas: false,
      elementos_destacados: [],
      grupos: [
        {
          ...datosMock.grupos[0]!,
          tiene_variacion_destacada: false,
          sobres: [
            {
              ...datosMock.grupos[0]!.sobres[0]!,
              tiene_variacion_destacada: false,
              variaciones: {
                '2026-01': {
                  periodo: '2026-01',
                  importe: '1200.00',
                  diferencia: '0.00',
                  diferencia_absoluta: '0.00',
                  direccion: 'sin_cambio',
                  porcentaje: '0.00%',
                  porcentaje_numero: 0,
                  destacada: false,
                },
                '2026-02': {
                  periodo: '2026-02',
                  importe: '1200.00',
                  diferencia: '0.00',
                  diferencia_absoluta: '0.00',
                  direccion: 'sin_cambio',
                  porcentaje: '0.00%',
                  porcentaje_numero: 0,
                  destacada: false,
                },
              },
              importes_por_periodo: {
                '2026-01': '1200.00',
                '2026-02': '1200.00',
                '2026-03': '1200.00',
              },
            },
          ],
          totales_por_periodo: {
            '2026-01': '1200.00',
            '2026-02': '1200.00',
            '2026-03': '1200.00',
          },
        },
      ],
      total_general_por_periodo: {
        '2026-01': '1200.00',
        '2026-02': '1200.00',
        '2026-03': '1200.00',
      },
    }
    const html = renderToStaticMarkup(<VistaComparativos datos={datosSinVariaciones} />)
    expect(html).toContain('Sin variaciones relevantes')
  })

  it('R3: muestra aviso de recálculo retroactivo cuando avisoRecalculo es true', () => {
    const html = renderToStaticMarkup(<VistaComparativos datos={datosMock} avisoRecalculo={true} />)
    expect(html).toContain('Aviso de recálculo:')
    expect(html).toContain('Los resultados de la comparación cambiaron debido a correcciones')
  })

  it('R4: muestra selector de cartera para cambiar de cartera aislada', () => {
    const carteras = [
      { id: 1, nombre: 'Cartera Test', moneda: 'MXN' },
      { id: 2, nombre: 'Cartera USD', moneda: 'USD' },
    ]
    const html = renderToStaticMarkup(<VistaComparativos datos={datosMock} carterasDisponibles={carteras} />)
    expect(html).toContain('selector-cartera')
    expect(html).toContain('Cartera USD (USD)')
  })
})
