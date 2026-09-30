import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { Meta } from '@/db/schema'
import type { ProgresoMeta } from '@/repos/metas'

vi.mock('@/metas/acciones', () => ({
  accionCrearMeta: async () => ({ ok: true }),
  accionCompletarMeta: async () => ({ ok: true }),
  accionAbandonarMeta: async () => ({ ok: true }),
}))

const {
  TarjetaMeta,
  FormularioNuevaMeta,
  HistorialMetas,
} = await import('@/components/metas')

function html(elemento: ReactElement): string {
  return renderToStaticMarkup(elemento)
}

describe('090: componentes de interfaz de metas', () => {
  const metaMock: Meta = {
    id: 1,
    sobre_id: 10,
    monto_objetivo: '20000.00',
    fecha_limite: '2026-12-01',
    estado: 'activa',
    completada_en: null,
    abandonada_en: null,
    creado_en: new Date('2026-09-01'),
    actualizado_en: new Date('2026-09-01'),
  }

  it('renderiza TarjetaMeta con avance, disponible, porcentaje y ritmo mensual', () => {
    const progreso: ProgresoMeta = {
      monto_objetivo: '20000.00',
      disponible: '12400.00',
      restante: '7600.00',
      porcentaje: 62,
      fecha_limite: '2026-12-01',
      periodos_restantes: 4,
      ritmo_periodo: '1900.00',
      asignado_periodo: '1900.00',
      falta_para_ritmo: '0.00',
      estado_visual: 'en_camino',
      vencida: false,
    }

    const res = html(
      <TarjetaMeta
        meta={metaMock}
        progreso={progreso}
        moneda="MXN"
        cartera_id={1}
      />,
    )

    expect(res).toContain('Meta de ahorro')
    expect(res).toContain('20,000.00')
    expect(res).toContain('12,400.00')
    expect(res).toContain('7,600.00')
    expect(res).toContain('62%')
    expect(res).toContain('1,900.00')
    expect(res).toContain('En camino')
    expect(res).toContain('Abandonar meta')
    expect(res).toContain('Completar meta')
  })

  it('renderiza TarjetaMeta en estado cumplida cuando disponible alcanza el objetivo', () => {
    const progreso: ProgresoMeta = {
      monto_objetivo: '10000.00',
      disponible: '10500.00',
      restante: '0.00',
      porcentaje: 105,
      fecha_limite: '2026-12-01',
      periodos_restantes: 4,
      ritmo_periodo: null,
      asignado_periodo: '2500.00',
      falta_para_ritmo: null,
      estado_visual: 'cumplida',
      vencida: false,
    }

    const res = html(
      <TarjetaMeta
        meta={{ ...metaMock, monto_objetivo: '10000.00' }}
        progreso={progreso}
        moneda="MXN"
        cartera_id={1}
      />,
    )

    expect(res).toContain('Objetivo alcanzado')
    expect(res).toContain('Confirmar meta cumplida')
  })

  it('renderiza TarjetaMeta con badge de retrasada y aviso de faltante de ritmo', () => {
    const progreso: ProgresoMeta = {
      monto_objetivo: '20000.00',
      disponible: '500.00',
      restante: '19500.00',
      porcentaje: 2,
      fecha_limite: '2026-12-01',
      periodos_restantes: 4,
      ritmo_periodo: '4875.00',
      asignado_periodo: '500.00',
      falta_para_ritmo: '4375.00',
      estado_visual: 'retrasada',
      vencida: false,
    }

    const res = html(
      <TarjetaMeta
        meta={metaMock}
        progreso={progreso}
        moneda="MXN"
        cartera_id={1}
      />,
    )

    expect(res).toContain('Retrasada')
    expect(res).toContain('4,375.00')
  })

  it('renderiza FormularioNuevaMeta con boton de activacion', () => {
    const res = html(
      <FormularioNuevaMeta
        sobre_id={10}
        cartera_id={1}
      />,
    )

    expect(res).toContain('Definir meta de ahorro')
  })

  it('renderiza HistorialMetas con contador de metas anteriores', () => {
    const metasPrevias: Meta[] = [
      {
        id: 2,
        sobre_id: 10,
        monto_objetivo: '15000.00',
        fecha_limite: '2026-06-01',
        estado: 'completada',
        completada_en: new Date('2026-06-01'),
        abandonada_en: null,
        creado_en: new Date('2026-01-01'),
        actualizado_en: new Date('2026-06-01'),
      },
    ]

    const res = html(
      <HistorialMetas
        historial={metasPrevias}
        moneda="MXN"
      />,
    )

    expect(res).toContain('Ver historial (1 metas anteriores)')
  })
})
