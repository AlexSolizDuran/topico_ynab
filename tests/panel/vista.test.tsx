import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { PanelResumen } from '@/components/panel'
import type { DatosPanel } from '@/repos/panel'

function html(elemento: ReactElement): string {
  return renderToStaticMarkup(elemento)
}

describe('110: componentes de interfaz del panel', () => {
  const datosMock: DatosPanel = {
    cartera: {
      id: 1,
      nombre: 'Cartera Principal',
      moneda: 'MXN',
    },
    periodo: '2026-03',
    patrimonio: {
      total: '30000.00',
      en_sobres: '22000.00',
      dinero_suelto: '8000.00',
    },
    dinero_suelto: {
      monto: '8000.00',
      es_negativo: false,
      sobreasignado: false,
    },
    cuentas: {
      activas: [
        {
          id: 1,
          nombre: 'Banco BBVA',
          tipo: 'corriente',
          saldo: '30600.00',
          archivada: false,
        },
        {
          id: 2,
          nombre: 'Tarjeta Crédito',
          tipo: 'credito',
          saldo: '-600.00',
          archivada: false,
        },
      ],
      archivadas: [
        {
          id: 3,
          nombre: 'Cuenta Antigua',
          tipo: 'ahorro',
          saldo: '0.00',
          archivada: true,
        },
      ],
      total_activas: '30000.00',
    },
    grupos: [
      {
        id: 1,
        nombre: 'Gastos Mensuales',
        orden: 1,
        total_disponible: '22000.00',
        sobres: [
          {
            id: 10,
            nombre: 'Supermercado',
            grupo_id: 1,
            disponible: '22000.00',
            archivado: false,
            es_negativo: false,
          },
        ],
      },
    ],
    sobres_archivados_con_saldo: [],
    sobres_desbordados: [],
    desbordes_acciones: [],
    totales_periodo: {
      gastado: '5000.00',
      ingresado: '15000.00',
    },
    pendientes_asignacion: {
      cantidad: 2,
      movimientos: [
        {
          id: 101,
          fecha: '2026-03-02',
          monto: '-150.00',
          descripcion: 'Cafetería',
          cuenta_nombre: 'Banco BBVA',
        },
      ],
    },
    metas_activas: [
      {
        id: 1,
        sobre_id: 10,
        nombre_sobre: 'Supermercado',
        monto_objetivo: '30000.00',
        disponible: '22000.00',
        restante: '8000.00',
        porcentaje: 73,
        estado_visual: 'en_camino',
        retrasada: false,
        falta_para_ritmo: null,
      },
    ],
  }

  it('R1: renderiza el patrimonio neto destacado y su desglose explicativo', () => {
    const res = html(<PanelResumen datos={datosMock} />)

    expect(res).toContain('Patrimonio Neto')
    expect(res).toContain('30,000.00')
    expect(res).toContain('22,000.00')
    expect(res).toContain('en sobres')
    expect(res).toContain('8,000.00')
    expect(res).toContain('sin asignar')
  })

  it('R2: presenta cuentas con crédito en rojo y separa las archivadas', () => {
    const res = html(<PanelResumen datos={datosMock} />)

    expect(res).toContain('Banco BBVA')
    expect(res).toContain('Tarjeta Crédito')
    expect(res).toContain('600.00')
    /*
     * El rojo es `estilos.riesgo` y no una utilidad de Tailwind. La clase del modulo se
     * cumple en cualquier tema —claro u oscuro— mientras que `text-rose-600` fija un tono del
     * tema claro y ademas es el unico valor del color que no tendria que quedar escrito en un
     * componente. El hash se matchea sin fijarlo: Vitest lo agrega al nombre de clase.
     */
    expect(res).toMatch(/_riesgo_/) // Cuenta de crédito en rojo
    expect(res).toContain('Total cuentas activas')
    expect(res).toContain('Cuentas archivadas (1)')
  })

  it('R4: muestra alerta cuando el dinero suelto es negativo (sobreasignado)', () => {
    const datosNegativo: DatosPanel = {
      ...datosMock,
      dinero_suelto: {
        monto: '-5000.00',
        es_negativo: true,
        sobreasignado: true,
        aviso_sobreasignado: 'Asignaste más dinero del que tienes',
      },
    }

    const res = html(<PanelResumen datos={datosNegativo} />)
    expect(res).toContain('5,000.00')
    expect(res).toContain('Asignaste más dinero del que tienes')
  })

  it('R5 y R6: destaca desbordes y ofrece acción para tapar cuando hay cobertura', () => {
    const datosDesborde: DatosPanel = {
      ...datosMock,
      desbordes_acciones: [
        {
          sobre_id: 10,
          nombre_sobre: 'Supermercado',
          desborde: '400.00',
          disponible_negativo: '-400.00',
          puede_tapar: true,
        },
      ],
    }

    const res = html(<PanelResumen datos={datosDesborde} />)
    expect(res).toContain('Desbordes detectados')
    expect(res).toContain('Supermercado')
    expect(res).toContain('400.00')
    expect(res).toContain('Tapar desborde con dinero suelto')
  })

  it('R7 y R8: muestra totales del mes (ingresos/gastos) y contador de movimientos sin asignar', () => {
    const res = html(<PanelResumen datos={datosMock} />)

    expect(res).toContain('Mes: 2026-03')
    expect(res).toContain('15,000.00')
    expect(res).toContain('5,000.00')
    expect(res).toContain('2 movimientos pendiente')
  })

  it('R9: muestra progreso de metas activas destacando retrasadas si aplica', () => {
    const datosMetaRetrasada: DatosPanel = {
      ...datosMock,
      metas_activas: [
        {
          id: 1,
          sobre_id: 10,
          nombre_sobre: 'Supermercado',
          monto_objetivo: '30000.00',
          disponible: '5000.00',
          restante: '25000.00',
          porcentaje: 17,
          estado_visual: 'retrasada',
          retrasada: true,
          falta_para_ritmo: '3000.00',
        },
      ],
    }

    const res = html(<PanelResumen datos={datosMetaRetrasada} />)
    expect(res).toContain('Progreso de metas activas')
    expect(res).toContain('Retrasada')
    expect(res).toContain('Faltan')
    expect(res).toContain('3,000.00')
    expect(res).toContain('para alcanzar el ritmo necesario este mes.')
  })

  it('R10 y R11: permite cambiar de cartera y no ofrece total consolidado entre monedas distintas', () => {
    const carterasOpciones = [
      { id: 1, nombre: 'Cartera Principal', moneda: 'MXN' },
      { id: 2, nombre: 'Cartera USA', moneda: 'USD' },
    ]

    const res = html(<PanelResumen datos={datosMock} carterasDisponibles={carterasOpciones} />)
    expect(res).toContain('Cartera activa')
    expect(res).toContain('Cartera Principal')
    expect(res).toContain('Cartera USA (USD)')
    // No hay ninguna suma global combinada
    expect(res).not.toContain('Total global')
    expect(res).not.toContain('Total combinado')
  })

  it('R12: el panel es de solo lectura (no contiene inputs para capturar o editar datos)', () => {
    const res = html(<PanelResumen datos={datosMock} />)
    // No contiene elementos de formulario para capturar datos
    expect(res).not.toContain('<input')
    expect(res).not.toContain('<textarea')
  })

  it('R13: muestra banner de aviso cuando los datos han sido recalculados', () => {
    const res = html(<PanelResumen datos={datosMock} avisoRecalculo={true} />)
    expect(res).toContain('Los valores mostrados han sido recalculados tras registrar o modificar operaciones de periodos anteriores.')
  })
})
