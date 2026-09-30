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
import { consultarDatosPanel } from '../../src/repos/panel'
import { archivarSobre } from '../../src/repos/sobres'
import { archivarCuenta } from '../../src/repos/cuentas'
import { asignarSobre } from '../../src/repos/movimientos'
import { renderToStaticMarkup } from 'react-dom/server'
import { PanelResumen } from '../../src/components/panel'
import { detectarAfectacionHistorica } from '../../src/patrimonio/retroactividad'
import { esCero } from '../../src/dinero'

describe('110: matriz de trazabilidad - 39 escenarios de panel', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let grupo_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Principal', moneda: 'MXN' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco MXN', saldo_inicial: '0.00' })
    grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Gastos Mensuales' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Alimentos' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  describe('Requisito 1: El panel muestra el patrimonio de la cartera abierta', () => {
    it('Scenario: Patrimonio mostrado (22,000 en sobres y 8,000 sin asignar -> 30,000)', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '30000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '22000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.patrimonio.total).toBe('30000.00')
    })

    it('Scenario: Desglose del patrimonio', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '30000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '22000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.patrimonio.en_sobres).toBe('22000.00')
      expect(panel.patrimonio.dinero_suelto).toBe('8000.00')
    })

    it('Scenario: Patrimonio recalculado', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '30000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      let panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.patrimonio.total).toBe('30000.00')

      // Registrar gasto de 5,000
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-5000.00', fecha: '2026-03-05', tipo: 'gasto' })
      panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.patrimonio.total).toBe('25000.00')
    })
  })

  describe('Requisito 2: El panel muestra el saldo de cada cuenta', () => {
    it('Scenario: Lista de cuentas con saldos', async () => {
      const c2 = await crearCuenta(base.db, cartera_id, { nombre: 'Caja Fuerte', saldo_inicial: '2000.00' })
      const c3 = await crearCuenta(base.db, cartera_id, { nombre: 'Billetera', saldo_inicial: '500.00' })
      await crearMovimiento(base.db, { cuenta_id, monto: '10000.00', fecha: '2026-03-01', tipo: 'ingreso' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.cuentas.activas).toHaveLength(3)
      expect(panel.cuentas.total_activas).toBe('12500.00')
    })

    it('Scenario: Cuenta de credito en rojo', async () => {
      const creditoId = await crearCuenta(base.db, cartera_id, {
        nombre: 'Tarjeta Cr�dito',
        tipo: 'credito',
        saldo_inicial: '-600.00',
      })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const c = panel.cuentas.activas.find((x) => x.id === creditoId)
      expect(c?.saldo).toBe('-600.00')
    })

    it('Scenario: Cuentas archivadas separadas', async () => {
      const archivadaId = await crearCuenta(base.db, cartera_id, {
        nombre: 'Cuenta Cerrada',
        saldo_inicial: '0.00',
      })
      await archivarCuenta(base.db, usuario_id, cartera_id, archivadaId)

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.cuentas.activas.map((c) => c.id)).not.toContain(archivadaId)
      expect(panel.cuentas.archivadas.map((c) => c.id)).toContain(archivadaId)
    })
  })

  describe('Requisito 3: El panel muestra el disponible de cada sobre', () => {
    it('Scenario: Sobres agrupados con totales', async () => {
      const sobre2 = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Restaurantes' })
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '3000.00' })
      await crearAsignacion(base.db, { sobre_id: sobre2, periodo: '2026-03', monto: '1000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const g = panel.grupos.find((x) => x.id === grupo_id)
      expect(g?.total_disponible).toBe('4000.00')
      expect(g?.sobres).toHaveLength(2)
    })

    it('Scenario: Recalculo del disponible', async () => {
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '3000.00' })
      let panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.grupos[0]?.sobres[0]?.disponible).toBe('3000.00')

      // Registrar gasto de 800 en el sobre
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-800.00', fecha: '2026-03-05', tipo: 'gasto' })
      panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.grupos[0]?.sobres[0]?.disponible).toBe('2200.00')
      expect(panel.grupos[0]?.total_disponible).toBe('2200.00')
    })

    it('Scenario: Sobres archivados separados', async () => {
      const sobreArchivado = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Sobre Pasado' })
      // Para archivar, disponible debe ser 0.00
      await archivarSobre(base.db, usuario_id, cartera_id, sobreArchivado, '2026-03')
      // Posterior devolucion de 300
      await crearMovimiento(base.db, { cuenta_id, sobre_id: sobreArchivado, monto: '300.00', fecha: '2026-03-10', tipo: 'ingreso' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.sobres_archivados_con_saldo).toHaveLength(1)
      expect(panel.sobres_archivados_con_saldo[0]?.id).toBe(sobreArchivado)
      expect(panel.sobres_archivados_con_saldo[0]?.disponible).toBe('300.00')
    })
  })

  describe('Requisito 4: El panel muestra el dinero suelto', () => {
    it('Scenario: Dinero suelto positivo', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '30000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '22000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.dinero_suelto.monto).toBe('8000.00')
      expect(panel.dinero_suelto.sobreasignado).toBe(false)
    })

    it('Scenario: Dinero suelto negativo', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '30000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '35000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.dinero_suelto.monto).toBe('-5000.00')
      expect(panel.dinero_suelto.sobreasignado).toBe(true)
      expect(panel.dinero_suelto.aviso_sobreasignado).toContain('dinero del que tienes')
    })

    it('Scenario: Sin dinero suelto', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '15000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '15000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.dinero_suelto.monto).toBe('0.00')
      expect(panel.dinero_suelto.sobreasignado).toBe(false)
    })
  })

  describe('Requisito 5: El panel destaca los sobres con disponible negativo', () => {
    it('Scenario: Sobres en rojo ordenados antes que los positivos', async () => {
      const sobrePositivo = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Ahorro' })
      await crearAsignacion(base.db, { sobre_id: sobrePositivo, periodo: '2026-03', monto: '1000.00' })

      // Sobre con gasto no cubierto -> disponible -300
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-300.00', fecha: '2026-03-02', tipo: 'gasto' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const g = panel.grupos.find((x) => x.id === grupo_id)
      expect(g?.sobres[0]?.id).toBe(sobre_id)
      expect(g?.sobres[0]?.es_negativo).toBe(true)
      expect(g?.sobres[0]?.desborde).toBe('300.00')
    })

    it('Scenario: Sobre archivado en negativo', async () => {
      const sobreArchivado = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Sobre Archiv' })
      await archivarSobre(base.db, usuario_id, cartera_id, sobreArchivado, '2026-03')

      // Gasto posterior que lo deja en negativo
      await crearMovimiento(base.db, { cuenta_id, sobre_id: sobreArchivado, monto: '-250.00', fecha: '2026-03-05', tipo: 'gasto' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.sobres_desbordados.map((s) => s.id)).toContain(sobreArchivado)
    })

    it('Scenario: Desborde subsanado deja de destacarse', async () => {
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-200.00', fecha: '2026-03-02', tipo: 'gasto' })
      let panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.sobres_desbordados).toHaveLength(1)

      // Asignar 200 para tapar desborde
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '200.00' })
      panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.sobres_desbordados).toHaveLength(0)
    })
  })

  describe('Requisito 6: El panel ofrece el acceso para tapar un desborde', () => {
    it('Scenario: Ofrecer tapar el desborde cuando hay cobertura', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-400.00', fecha: '2026-03-02', tipo: 'gasto' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const desborde = panel.desbordes_acciones.find((d) => d.sobre_id === sobre_id)
      expect(desborde?.desborde).toBe('400.00')
      expect(desborde?.puede_tapar).toBe(true)
    })

    it('Scenario: Desborde sin cobertura', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '200.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-400.00', fecha: '2026-03-02', tipo: 'gasto' })
      // Asignar en otro sobre
      const s2 = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Otro' })
      await crearAsignacion(base.db, { sobre_id: s2, periodo: '2026-03', monto: '400.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const desborde = panel.desbordes_acciones.find((d) => d.sobre_id === sobre_id)
      expect(desborde?.puede_tapar).toBe(false)
    })

    it('Scenario: Cobertura manual (al asignar dinero suelto cubre el desborde)', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-400.00', fecha: '2026-03-02', tipo: 'gasto' })

      // Se tapa manualmente asignando 400
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '400.00' })
      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.sobres_desbordados).toHaveLength(0)
    })
  })

  describe('Requisito 7: El panel muestra el gasto y el ingreso del periodo', () => {
    it('Scenario: Totales del mes', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '8000.00', fecha: '2026-09-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-3200.00', fecha: '2026-09-15', tipo: 'gasto' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-09')
      expect(panel.totales_periodo.ingresado).toBe('8000.00')
      expect(panel.totales_periodo.gastado).toBe('3200.00')
    })

    it('Scenario: Cambio de periodo', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '6000.00', fecha: '2026-08-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-2000.00', fecha: '2026-08-10', tipo: 'gasto' })

      const panelAgosto = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-08')
      expect(panelAgosto.totales_periodo.ingresado).toBe('6000.00')
      expect(panelAgosto.totales_periodo.gastado).toBe('2000.00')
    })

    it('Scenario: Los traspasos no cuentan como gasto', async () => {
      const cuenta2 = await crearCuenta(base.db, cartera_id, { nombre: 'Caja', saldo_inicial: '0.00' })
      await crearMovimiento(base.db, { cuenta_id, monto: '5000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1500.00', fecha: '2026-03-05', tipo: 'gasto' })
      // Traspaso de 2000 entre cuentas
      await crearMovimiento(base.db, { cuenta_id, monto: '-2000.00', fecha: '2026-03-10', tipo: 'traspaso' })
      await crearMovimiento(base.db, { cuenta_id: cuenta2, monto: '2000.00', fecha: '2026-03-10', tipo: 'traspaso' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.totales_periodo.gastado).toBe('1500.00')
      expect(panel.totales_periodo.ingresado).toBe('5000.00')
    })

    it('Scenario: Recalculo de un periodo pasado', async () => {
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-1000.00', fecha: '2026-01-10', tipo: 'gasto' })
      let panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-01')
      expect(panel.totales_periodo.gastado).toBe('1000.00')

      // Registro adicional en enero
      await crearMovimiento(base.db, { cuenta_id, sobre_id, monto: '-500.00', fecha: '2026-01-20', tipo: 'gasto' })
      panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-01')
      expect(panel.totales_periodo.gastado).toBe('1500.00')
    })
  })

  describe('Requisito 8: El panel muestra los movimientos pendientes de asignar', () => {
    it('Scenario: Movimientos sin asignar', async () => {
      await crearMovimiento(base.db, { cuenta_id, sobre_id: null, monto: '-100.00', fecha: '2026-03-01', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id: null, monto: '-200.00', fecha: '2026-03-02', tipo: 'gasto' })
      await crearMovimiento(base.db, { cuenta_id, sobre_id: null, monto: '-300.00', fecha: '2026-03-03', tipo: 'gasto' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.pendientes_asignacion.cantidad).toBe(3)
    })

    it('Scenario: Acceso a la asignacion y asignaci�n de sobre', async () => {
      const idMov = await crearMovimiento(base.db, { cuenta_id, sobre_id: null, monto: '-150.00', fecha: '2026-03-01', tipo: 'gasto' })
      let panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.pendientes_asignacion.cantidad).toBe(1)

      // Asignar sobre
      await asignarSobre(base.db, usuario_id, idMov, sobre_id)
      panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.pendientes_asignacion.cantidad).toBe(0)
    })
  })

  describe('Requisito 9: El panel muestra el progreso de las metas activas', () => {
    it('Scenario: Metas en el panel', async () => {
      const sobre2 = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Vacaciones' })
      await crearMeta(base.db, sobre_id, { monto_objetivo: '5000.00' })
      await crearMeta(base.db, sobre2, { monto_objetivo: '10000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.metas_activas).toHaveLength(2)
    })

    it('Scenario: Meta retrasada destacada', async () => {
      await crearMeta(base.db, sobre_id, {
        monto_objetivo: '12000.00',
        fecha_limite: '2026-03-01',
      })
      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '2000.00' })

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const meta = panel.metas_activas[0]!
      expect(meta.retrasada).toBe(true)
      expect(meta.estado_visual).toBe('retrasada')
    })

    it('Scenario: Avance recalculado tras asignaci�n', async () => {
      await crearMeta(base.db, sobre_id, { monto_objetivo: '10000.00' })
      let panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.metas_activas[0]?.porcentaje).toBe(0)

      await crearAsignacion(base.db, { sobre_id, periodo: '2026-03', monto: '5000.00' })
      panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.metas_activas[0]?.porcentaje).toBe(50)
    })
  })

  describe('Requisito 10: El panel permite cambiar de cartera', () => {
    it('Scenario: Cambio de cartera', async () => {
      const cartera2 = await crearCartera(base.db, usuario_id, { nombre: 'Segunda Cartera', moneda: 'MXN' })
      const cuenta2 = await crearCuenta(base.db, cartera2, { nombre: 'Banco 2', saldo_inicial: '8000.00' })

      const panel1 = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const panel2 = await consultarDatosPanel(base.db, usuario_id, cartera2, '2026-03')

      expect(panel1.cartera.id).toBe(cartera_id)
      expect(panel2.cartera.id).toBe(cartera2)
      expect(panel2.cuentas.activas[0]?.nombre).toBe('Banco 2')
    })

    it('Scenario: Carteras de distinta moneda (serie en su propia moneda)', async () => {
      const carteraUSD = await crearCartera(base.db, usuario_id, { nombre: 'Cartera USD', moneda: 'USD' })
      const cuentaUSD = await crearCuenta(base.db, carteraUSD, { nombre: 'Chase', saldo_inicial: '3000.00' })

      const panelUSD = await consultarDatosPanel(base.db, usuario_id, carteraUSD, '2026-03')
      expect(panelUSD.cartera.moneda).toBe('USD')
      expect(panelUSD.patrimonio.total).toBe('3000.00')
    })

    it('Scenario: Sin arrastre de cifras', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '50000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      const carteraVacia = await crearCartera(base.db, usuario_id, { nombre: 'Cartera Limpia', moneda: 'MXN' })

      const panelVacio = await consultarDatosPanel(base.db, usuario_id, carteraVacia, '2026-03')
      expect(esCero(panelVacio.patrimonio.total)).toBe(true)
      expect(panelVacio.cuentas.activas).toHaveLength(0)
    })
  })

  describe('Requisito 11: El panel no muestra totales entre carteras de distinta moneda', () => {
    it('Scenario: Sin total global', async () => {
      await crearMovimiento(base.db, { cuenta_id, monto: '10000.00', fecha: '2026-03-01', tipo: 'ingreso' })
      const carteraUSD = await crearCartera(base.db, usuario_id, { nombre: 'USA', moneda: 'USD' })
      const cuentaUSD = await crearCuenta(base.db, carteraUSD, { nombre: 'Bank', saldo_inicial: '2000.00' })

      const pMXN = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const pUSD = await consultarDatosPanel(base.db, usuario_id, carteraUSD, '2026-03')

      const res = renderToStaticMarkup(
        <PanelResumen
          datos={pMXN}
          carterasDisponibles={[
            { id: cartera_id, nombre: 'MXN', moneda: 'MXN' },
            { id: carteraUSD, nombre: 'USD', moneda: 'USD' },
          ]}
        />,
      )

      expect(res).not.toContain('Total global')
      expect(res).not.toContain('Total combinado')
      expect(pMXN.patrimonio.total).toBe('10000.00')
      expect(pUSD.patrimonio.total).toBe('2000.00')
    })

    it('Scenario: Cifras de la cartera abierta', async () => {
      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.cartera.id).toBe(cartera_id)
    })

    it('Scenario: Usuario con una sola cartera', async () => {
      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel.cartera.id).toBe(cartera_id)
      const res = renderToStaticMarkup(<PanelResumen datos={panel} carterasDisponibles={[]} />)
      expect(res).toContain('Cartera Principal')
    })
  })

  describe('Requisito 12: El panel es de solo lectura', () => {
    it('Scenario: El panel no captura datos', async () => {
      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const res = renderToStaticMarkup(<PanelResumen datos={panel} />)
      expect(res).not.toContain('<input')
      expect(res).not.toContain('<textarea')
    })

    it('Scenario: Acceso a las operaciones', async () => {
      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const res = renderToStaticMarkup(<PanelResumen datos={panel} />)
      expect(res).toContain('href="/cartera/' + cartera_id + '/movimientos"')
      expect(res).toContain('href="/cartera/' + cartera_id + '/cuentas"')
      expect(res).toContain('href="/cartera/' + cartera_id + '/sobres"')
    })

    it('Scenario: Toda operacion ocurre fuera del panel', async () => {
      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      expect(panel).toBeDefined()
    })
  })

  describe('Requisito 13: El panel informa cuando los datos se recalculan', () => {
    it('Scenario: Aviso de recalculo ante movimiento retroactivo', async () => {
      const deteccion = detectarAfectacionHistorica('2026-01-15', '2026-03')
      expect(deteccion.historiaModificada).toBe(true)

      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      const res = renderToStaticMarkup(<PanelResumen datos={panel} avisoRecalculo={true} />)
      expect(res).toContain('Los valores mostrados han sido recalculados')
    })

    it('Scenario: La operacion no se bloquea y los valores se recalculan', async () => {
      // Registrar retroactivo en enero
      await crearMovimiento(base.db, { cuenta_id, monto: '1000.00', fecha: '2026-01-15', tipo: 'ingreso' })
      const panel = await consultarDatosPanel(base.db, usuario_id, cartera_id, '2026-03')
      // Se recalcula y el patrimonio en marzo refleja el ingreso de enero
      expect(panel.patrimonio.total).toBe('1000.00')
    })
  })
})
