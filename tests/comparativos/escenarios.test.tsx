import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearSobre,
  crearUsuario,
  crearMovimiento,
  crearTransferencia,
} from '../helpers/fabricas'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import { consultarComparativo } from '../../src/repos/comparativos'
import { VistaComparativos } from '../../src/components/comparativos'

describe('120: matriz de trazabilidad - 13 escenarios de comparativos', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let cuentaDestino_id: number
  let grupo_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Principal', moneda: 'MXN' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco MXN', saldo_inicial: '50000.00' })
    cuentaDestino_id = await crearCuenta(base.db, cartera_id, { nombre: 'Efectivo MXN', saldo_inicial: '5000.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Necesidades' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Supermercado' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  describe('Requisito 1: El usuario compara categorias entre periodos', () => {
    it('Scenario: Comparacion de tres periodos', async () => {
      // Enero, Febrero, Marzo con referencia Marzo
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1000.00', fecha: '2026-01-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1500.00', fecha: '2026-02-15', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-2000.00', fecha: '2026-03-20', tipo: 'gasto' })

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02', '2026-03'],
        '2026-03',
      )

      expect(datos.periodos).toEqual(['2026-01', '2026-02', '2026-03'])
      expect(datos.periodo_referencia).toBe('2026-03')

      const s = datos.grupos[0]?.sobres.find((x) => x.id === sobre_id)
      expect(s?.importes_por_periodo['2026-01']).toBe('1000.00')
      expect(s?.importes_por_periodo['2026-02']).toBe('1500.00')
      expect(s?.importes_por_periodo['2026-03']).toBe('2000.00')

      // Diferencias respecto a marzo (2000.00)
      expect(s?.variaciones['2026-01']?.diferencia).toBe('-1000.00')
      expect(s?.variaciones['2026-02']?.diferencia).toBe('-500.00')
    })

    it('Scenario: Comparacion por grupo', async () => {
      const otroSobre = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Farmacia' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1200.00', fecha: '2026-01-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, otroSobre, monto: '-800.00', fecha: '2026-01-12', tipo: 'gasto' })

      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1500.00', fecha: '2026-02-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, otroSobre, monto: '-1000.00', fecha: '2026-02-12', tipo: 'gasto' })

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )

      const g = datos.grupos.find((x) => x.id === grupo_id)
      expect(g?.totales_por_periodo['2026-01']).toBe('2000.00')
      expect(g?.totales_por_periodo['2026-02']).toBe('2500.00')
      expect(g?.variaciones['2026-02']?.diferencia).toBe('500.00')
    })

    it('Scenario: Los traspasos no cuentan como gasto', async () => {
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-500.00', fecha: '2026-01-10', tipo: 'gasto' })

      // Traspaso de 10,000 entre cuentas
      await crearTransferencia(base.db, {
        origen_cuenta_id: cuenta_id,
        destino_cuenta_id: cuentaDestino_id,
        monto: '10000.00',
        fecha: '2026-01-12',
      })

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01'],
        '2026-01',
      )

      expect(datos.total_general_por_periodo['2026-01']).toBe('500.00')
      expect(datos.grupos[0]?.totales_por_periodo['2026-01']).toBe('500.00')
    })

    it('Scenario: Periodo de referencia elegible', async () => {
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1000.00', fecha: '2026-01-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1400.00', fecha: '2026-02-10', tipo: 'gasto' })

      // 1. Referencia: Enero (1000.00)
      let datos = await consultarComparativo(base.db, usuario_id, cartera_id, ['2026-01', '2026-02'], '2026-01')
      expect(datos.grupos[0]?.sobres[0]?.variaciones['2026-02']?.diferencia).toBe('400.00')
      expect(datos.grupos[0]?.sobres[0]?.variaciones['2026-02']?.direccion).toBe('aumento')

      // 2. Cambio de referencia: Febrero (1400.00)
      datos = await consultarComparativo(base.db, usuario_id, cartera_id, ['2026-01', '2026-02'], '2026-02')
      expect(datos.grupos[0]?.sobres[0]?.variaciones['2026-01']?.diferencia).toBe('-400.00')
      expect(datos.grupos[0]?.sobres[0]?.variaciones['2026-01']?.direccion).toBe('disminucion')
    })
  })

  describe('Requisito 2: El sistema destaca las variaciones relevantes', () => {
    it('Scenario: Variacion destacada', async () => {
      // WHEN un sobre gastó 1,200 en el periodo de referencia y 3,000 en el comparado
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1200.00', fecha: '2026-01-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-3000.00', fecha: '2026-02-10', tipo: 'gasto' })

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )

      // THEN el sistema lo destaca e informa un aumento de 1,800
      expect(datos.hay_variaciones_destacadas).toBe(true)
      const sobreDestacado = datos.elementos_destacados.find(
        (x) => x.tipo === 'sobre' && x.id === sobre_id && x.periodo === '2026-02',
      )
      expect(sobreDestacado).toBeDefined()
      expect(sobreDestacado?.direccion).toBe('aumento')
      expect(sobreDestacado?.diferencia).toBe('1800.00')
      expect(sobreDestacado?.diferencia_absoluta).toBe('1800.00')
      expect(sobreDestacado?.porcentaje).toBe('+150.00%')
    })

    it('Scenario: Umbral ajustable', async () => {
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1200.00', fecha: '2026-01-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-3000.00', fecha: '2026-02-10', tipo: 'gasto' })

      // Con umbral de 500 y 20%: se destaca (1800 de aumento)
      let datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
        { importe_absoluto: '500.00', porcentaje: 20 },
      )
      expect(datos.hay_variaciones_destacadas).toBe(true)

      // WHEN el usuario cambia el umbral de destaque a 2,500 y 200%
      datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
        { importe_absoluto: '2500.00', porcentaje: 200 },
      )
      // THEN el sistema vuelve a evaluar que elementos quedan destacados
      expect(datos.hay_variaciones_destacadas).toBe(false)
      expect(datos.elementos_destacados).toHaveLength(0)
    })

    it('Scenario: Sin variaciones relevantes', async () => {
      // Gastos exactamente iguales entre periodos
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1000.00', fecha: '2026-01-10', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1000.00', fecha: '2026-02-10', tipo: 'gasto' })

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )

      // THEN no destaca ningún elemento e informa que no hay variaciones relevantes
      expect(datos.hay_variaciones_destacadas).toBe(false)
      expect(datos.elementos_destacados).toHaveLength(0)

      const html = renderToStaticMarkup(<VistaComparativos datos={datos} />)
      expect(html).toContain('Sin variaciones relevantes')
    })
  })

  describe('Requisito 3: La comparacion refleja las correcciones retroactivas', () => {
    it('Scenario: Correccion de un gasto pasado', async () => {
      // Gasto inicial en marzo
      const movId = await crearMovimiento(base.db, {
        cuenta_id,
        sobre_id,
        monto: '-1000.00',
        fecha: '2026-03-10',
        tipo: 'gasto',
      })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1500.00', fecha: '2026-04-10', tipo: 'gasto' })

      // Corrección retroactiva del gasto de marzo a 1200.00
      const { movimientos } = await import('../../src/db/schema')
      const { eq } = await import('drizzle-orm')
      await base.db.update(movimientos).set({ monto: '-1200.00' }).where(eq(movimientos.id, movId))

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-03', '2026-04'],
        '2026-03',
      )

      // El total de marzo refleja la corrección y la variación se recalcula (1500 - 1200 = 300)
      expect(datos.grupos[0]?.sobres[0]?.importes_por_periodo['2026-03']).toBe('1200.00')
      expect(datos.grupos[0]?.sobres[0]?.variaciones['2026-04']?.diferencia).toBe('300.00')
    })

    it('Scenario: Aviso de comparacion modificada', async () => {
      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )

      // Al activarse el aviso de alteración retroactiva
      const html = renderToStaticMarkup(<VistaComparativos datos={datos} avisoRecalculo={true} />)
      expect(html).toContain('Aviso de recálculo:')
      expect(html).toContain('Los resultados de la comparación cambiaron debido a correcciones')
    })

    it('Scenario: Alta retroactiva', async () => {
      // Registrar gasto con fecha de enero después de estar en febrero
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-500.00', fecha: '2026-01-05', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-800.00', fecha: '2026-02-05', tipo: 'gasto' })

      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )

      expect(datos.grupos[0]?.sobres[0]?.importes_por_periodo['2026-01']).toBe('500.00')
      expect(datos.grupos[0]?.sobres[0]?.importes_por_periodo['2026-02']).toBe('800.00')
    })
  })

  describe('Requisito 4: La comparacion se limita a una cartera', () => {
    it('Scenario: Comparacion dentro de una cartera', async () => {
      const datos = await consultarComparativo(
        base.db,
        usuario_id,
        cartera_id,
        ['2026-01', '2026-02'],
        '2026-01',
      )

      expect(datos.cartera.id).toBe(cartera_id)
      for (const g of datos.grupos) {
        for (const s of g.sobres) {
          expect(s.grupo_id).toBe(g.id)
        }
      }
    })

    it('Scenario: Cambio de cartera abierta', async () => {
      const carteraUSD = await crearCartera(base.db, usuario_id, { nombre: 'USA', moneda: 'USD' })
      const cuentaUSD = await crearCuenta(base.db, carteraUSD, { nombre: 'Chase', saldo_inicial: '10000.00' })
      const grupoUSD = await crearGrupo(base.db, carteraUSD, { nombre: 'Living' })
      const sobreUSD = await crearSobre(base.db, carteraUSD, grupoUSD, { nombre: 'Rent' })

      await crearMovimiento(base.db, {
        cuenta_id: cuentaUSD,
        sobre_id: sobreUSD,
        monto: '-1500.00',
        fecha: '2026-01-01',
        tipo: 'gasto',
      })

      const datosUSD = await consultarComparativo(
        base.db,
        usuario_id,
        carteraUSD,
        ['2026-01'],
        '2026-01',
      )

      expect(datosUSD.cartera.id).toBe(carteraUSD)
      expect(datosUSD.cartera.moneda).toBe('USD')
      expect(datosUSD.total_general_por_periodo['2026-01']).toBe('1500.00')
    })

    it('Scenario: Sin comparaciones entre monedas', async () => {
      const carteraUSD = await crearCartera(base.db, usuario_id, { nombre: 'USA', moneda: 'USD' })

      const datosMXN = await consultarComparativo(base.db, usuario_id, cartera_id, ['2026-01'], '2026-01')
      const datosUSD = await consultarComparativo(base.db, usuario_id, carteraUSD, ['2026-01'], '2026-01')

      // Cada una expresa sus importes en su propia moneda sin mezclar
      expect(datosMXN.cartera.moneda).toBe('MXN')
      expect(datosUSD.cartera.moneda).toBe('USD')

      const htmlMXN = renderToStaticMarkup(<VistaComparativos datos={datosMXN} />)
      expect(htmlMXN).toContain('MXN')
      expect(htmlMXN).not.toContain('USD')
    })
  })
})
