import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearSobre,
  crearUsuario,
} from '../helpers/fabricas'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import { consultarResumenGlobal } from '../../src/repos/resumen-global'

describe('130: resumen global agrupado por moneda', () => {
  let base: BaseDePruebas
  let usuario_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R1-R5: agrupa por moneda, no mezcla monedas y arma las series mensual, diaria y de comercios', async () => {
    const carteraMxn = await crearCartera(base.db, usuario_id, { nombre: 'MXN', moneda: 'MXN' })
    const cuentaMxn = await crearCuenta(base.db, carteraMxn, { nombre: 'Banco', saldo_inicial: '0.00' })
    const grupoMxn = await crearGrupo(base.db, carteraMxn, { nombre: 'Gastos' })
    const sobreMxn = await crearSobre(base.db, carteraMxn, grupoMxn, { nombre: 'Sobre' })

    await crearMovimiento(base.db, {
      cuenta_id: cuentaMxn,
      monto: '30000.00',
      tipo: 'ingreso',
      fecha: '2026-03-01',
      descripcion: 'Sueldo',
    })
    await crearMovimiento(base.db, {
      cuenta_id: cuentaMxn,
      monto: '-12000.00',
      tipo: 'gasto',
      fecha: '2026-03-05',
      comercio: 'Super',
      sobre_id: sobreMxn,
    })
    await crearMovimiento(base.db, {
      cuenta_id: cuentaMxn,
      monto: '-3000.00',
      tipo: 'gasto',
      fecha: '2026-03-06',
      comercio: 'Cafe',
      sobre_id: sobreMxn,
    })
    await crearMovimiento(base.db, {
      cuenta_id: cuentaMxn,
      monto: '-500.00',
      tipo: 'gasto',
      fecha: '2026-02-10',
      comercio: 'Cafe',
      sobre_id: sobreMxn,
    })
    // 17,500 asignados menos 15,500 gastados en el sobre (12,000 + 3,000 de marzo y 500 de
    // febrero) dejan un disponible de 2,000.
    await crearAsignacion(base.db, { sobre_id: sobreMxn, periodo: '2026-03', monto: '17500.00' })

    const carteraUsd = await crearCartera(base.db, usuario_id, { nombre: 'USD', moneda: 'USD' })
    const cuentaUsd = await crearCuenta(base.db, carteraUsd, { nombre: 'Banco USD', saldo_inicial: '0.00' })

    await crearMovimiento(base.db, {
      cuenta_id: cuentaUsd,
      monto: '1000.00',
      tipo: 'ingreso',
      fecha: '2026-03-02',
    })
    await crearMovimiento(base.db, {
      cuenta_id: cuentaUsd,
      monto: '-400.00',
      tipo: 'gasto',
      fecha: '2026-03-08',
      comercio: 'Amazon',
    })

    const datos = await consultarResumenGlobal(base.db, usuario_id, '2026-03')

    expect(datos.grupos.map((g) => g.moneda)).toEqual(['MXN', 'USD'])

    // MXN: el capital no incluye la cartera en USD.
    const mxn = datos.grupos[0]!
    expect(mxn.capital.patrimonio).toBe('14500.00')
    expect(mxn.capital.en_sobres).toBe('2000.00')
    expect(mxn.capital.dinero_suelto).toBe('12500.00')
    expect(mxn.flujo.ingresado).toBe('30000.00')
    expect(mxn.flujo.gastado).toBe('15000.00')
    expect(mxn.flujo.neto).toBe('15000.00')

    // Serie mensual: 12 puntos, el ultimo es el periodo.
    expect(mxn.mensual).toHaveLength(12)
    const marzo = mxn.mensual.find((p) => p.clave === '2026-03')!
    expect(marzo.ingresado).toBe('30000.00')
    expect(marzo.gastado).toBe('15000.00')
    const febrero = mxn.mensual.find((p) => p.clave === '2026-02')!
    expect(febrero.gastado).toBe('500.00')

    // Serie diaria: un punto por dia del periodo, con el gasto del dia correcto.
    expect(mxn.diario).toHaveLength(31)
    expect(mxn.diario.find((p) => p.clave === '2026-03-05')!.gastado).toBe('12000.00')
    expect(mxn.diario.find((p) => p.clave === '2026-03-31')!.gastado).toBe('0.00')

    // Top comercios: solo MXN, de mayor a menor.
    expect(mxn.top_comercios.map((c) => c.comercio)).toEqual(['Super', 'Cafe'])
    expect(mxn.top_comercios[0]!.gastado).toBe('12000.00')

    // USD: cifras propias, sin contaminarse con MXN.
    const usd = datos.grupos[1]!
    expect(usd.capital.patrimonio).toBe('600.00')
    expect(usd.capital.en_sobres).toBe('0.00')
    expect(usd.flujo.gastado).toBe('400.00')
    expect(usd.top_comercios.map((c) => c.comercio)).toEqual(['Amazon'])
  })

  it('R1: sin carteras no hay grupos', async () => {
    const datos = await consultarResumenGlobal(base.db, usuario_id, '2026-03')
    expect(datos.grupos).toHaveLength(0)
  })
})
