import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearSobre,
  crearUsuario,
  crearAsignacion,
  crearMovimiento,
  crearMeta,
} from '../helpers/fabricas'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import { consultarDatosPanel, CarteraNoExiste } from '../../src/repos/panel'
import { archivarSobre } from '../../src/repos/sobres'
import { archivarCuenta } from '../../src/repos/cuentas'

describe('110: repositorio del panel de control', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let grupo_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Mi Cartera', moneda: 'MXN' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco', saldo_inicial: '0.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Necesidades' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Supermercado' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R1: calcula patrimonio y su desglose (22,000 en sobres y 8,000 sin asignar -> 30,000)', async () => {
    await crearMovimiento(base.db, { cuenta_id, monto: '30000.00', fecha: '2026-03-01', tipo: 'ingreso' })
    await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '22000.00' })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    expect(panel.patrimonio.total).toBe('30000.00')
    expect(panel.patrimonio.en_sobres).toBe('22000.00')
    expect(panel.patrimonio.dinero_suelto).toBe('8000.00')
  })

  it('R2: lista cuentas, crédito en rojo/negativo y separa archivadas del total activo', async () => {
    // Cuenta corriente con 5,000
    await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-03-01', tipo: 'ingreso' })

    // Cuenta de crédito que debe 600
    const tarjetaId = await crearCuenta(base.db, cartera_id, {
      nombre: 'Tarjeta Crédito',
      tipo: 'credito',
      saldo_inicial: '-600.00',
    })

    // Cuenta archivada con 0.00
    const cuentaArchivadaId = await crearCuenta(base.db, cartera_id, {
      nombre: 'Ahorro Antiguo',
      saldo_inicial: '0.00',
    })
    await archivarCuenta(base.db, usuario_id, cartera_id, cuentaArchivadaId)

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')

    expect(panel.cuentas.activas).toHaveLength(2)
    const tarjeta = panel.cuentas.activas.find((c) => c.id === tarjetaId)
    expect(tarjeta?.saldo).toBe('-600.00')

    // Total de activas: 5000 - 600 = 4400.00 (excluye la archivada)
    expect(panel.cuentas.total_activas).toBe('4400.00')

    expect(panel.cuentas.archivadas).toHaveLength(1)
    expect(panel.cuentas.archivadas[0]?.id).toBe(cuentaArchivadaId)
  })

  it('R3: lista sobres agrupados por grupo y calcula el total de cada grupo', async () => {
    const sobre2 = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Luz' })
    await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '1500.00' })
    await crearAsignacion(base.db, { sobre_id: sobre2, periodo: '2026-03', monto: '500.00' })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    const grupo = panel.grupos.find((g) => g.id === grupo_id)
    expect(grupo).toBeDefined()
    expect(grupo?.total_disponible).toBe('2000.00')
    expect(grupo?.sobres).toHaveLength(2)
  })

  it('R4: calcula dinero suelto y avisa cuando es negativo (sobreasignado)', async () => {
    // Cuentas con 30,000 y asignaciones por 35,000 -> dinero suelto = -5,000
    await crearMovimiento(base.db, { cuenta_id, monto: '30000.00', fecha: '2026-03-01', tipo: 'ingreso' })
    await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '35000.00' })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    expect(panel.dinero_suelto.monto).toBe('-5000.00')
    expect(panel.dinero_suelto.es_negativo).toBe(true)
    expect(panel.dinero_suelto.sobreasignado).toBe(true)
    expect(panel.dinero_suelto.aviso_sobreasignado).toContain('Asignaste más dinero del que tienes')
  })

  it('R5 y R6: destaca sobres en negativo y evalúa cobertura para tapar desborde', async () => {
    // Cuenta con 5,000 de dinero suelto
    await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-03-01', tipo: 'ingreso' })

    // Sobre con gasto sin asignación previa: queda en -400.00
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id,
      monto: '-400.00',
      fecha: '2026-03-05',
      tipo: 'gasto',
    })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    expect(panel.sobres_desbordados).toHaveLength(1)
    expect(panel.sobres_desbordados[0]?.disponible).toBe('-400.00')

    const desbordeAccion = panel.desbordes_acciones.find((d) => d.sobre_id === sobre_id)
    expect(desbordeAccion).toBeDefined()
    expect(desbordeAccion?.desborde).toBe('400.00')
    // Con 5000 en cuentas y -400 en sobres -> dinero suelto = 5400 >= 400 -> puede tapar
    expect(desbordeAccion?.puede_tapar).toBe(true)
  })

  it('R6: explica falta de cobertura cuando el dinero suelto no alcanza para tapar desborde', async () => {
    // Cuenta con 200
    await crearMovimiento(base.db, { cuenta_id, monto: '200.00', fecha: '2026-03-01', tipo: 'ingreso' })

    // Sobre en -400.00
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id,
      monto: '-400.00',
      fecha: '2026-03-05',
      tipo: 'gasto',
    })

    // Asignación en otro sobre para consumir dinero suelto
    const otroSobre = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Otro' })
    await crearAsignacion(base.db, { sobre_id: otroSobre, periodo: '2026-03', monto: '400.00' })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    const desbordeAccion = panel.desbordes_acciones.find((d) => d.sobre_id === sobre_id)
    expect(desbordeAccion).toBeDefined()
    expect(desbordeAccion?.puede_tapar).toBe(false)
  })

  it('R7: muestra total gastado e ingresado del mes excluyendo traspasos', async () => {
    const cuenta2 = await crearCuenta(base.db, cartera_id, { nombre: 'Caja', saldo_inicial: '0.00' })

    // Ingreso: 10,000
    await crearMovimiento(base.db, { cuenta_id, monto: '10000.00', fecha: '2026-03-01', tipo: 'ingreso' })
    // Gasto: 2,500
    await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-2500.00', fecha: '2026-03-10', tipo: 'gasto' })
    // Traspaso entre cuentas: 1,000 (no debe contar en gastos ni ingresos)
    await crearMovimiento(base.db, { cuenta_id, monto: '-1000.00', fecha: '2026-03-12', tipo: 'traspaso' })
    await crearMovimiento(base.db, { cuenta_id: cuenta2, monto: '1000.00', fecha: '2026-03-12', tipo: 'traspaso' })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    expect(panel.totales_periodo.ingresado).toBe('10000.00')
    expect(panel.totales_periodo.gastado).toBe('2500.00')
  })

  it('R8: cuenta e identifica movimientos sin sobre asignado', async () => {
    // Movimiento con sobre
    await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-200.00', fecha: '2026-03-01', tipo: 'gasto' })

    // Dos movimientos sin sobre
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: null,
      monto: '-150.00',
      fecha: '2026-03-02',
      descripcion: 'Cafetería',
      tipo: 'gasto',
    })
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: null,
      monto: '-350.00',
      fecha: '2026-03-03',
      descripcion: 'Farmacia',
      tipo: 'gasto',
    })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    expect(panel.pendientes_asignacion.cantidad).toBe(2)
    expect(panel.pendientes_asignacion.movimientos).toHaveLength(2)
  })

  it('R9: muestra metas activas destacando las retrasadas', async () => {
    await crearMeta(base.db, sobre_id, {
      monto_objetivo: '10000.00',
      fecha_limite: '2026-03-01', // Vence este mes
    })
    // Asignamos solo 1000 de los 10000 necesarios -> retrasada
    await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '1000.00' })

    const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
    expect(panel.metas_activas).toHaveLength(1)
    const m = panel.metas_activas[0]!
    expect(m.monto_objetivo).toBe('10000.00')
    expect(m.retrasada).toBe(true)
    expect(m.estado_visual).toBe('retrasada')
  })

  it('R10 y R11: aísla carteras y rechaza cartera inexistente o ajena', async () => {
    const otroUsuario = await crearUsuario(base.db)
    await expect(consultarDatosPanel(base.db, otroUsuario, cartera_id, '2026-03')).rejects.toThrow(CarteraNoExiste)
    await expect(consultarDatosPanel(base.db, usuario_id, 99999, '2026-03')).rejects.toThrow(CarteraNoExiste)
  })
})
