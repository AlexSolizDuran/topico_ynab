import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import { crearSobre } from '@/repos/sobres'
import { taparDesborde } from '@/repos/asignaciones'
import {
  CarteraNoExiste,
  InvarianteRota,
  avisarDesborde,
  comprobarInvariante,
  resumenDeCartera,
} from '@/repos/dinero-suelto'
import { moverEntreSobres } from '@/repos/asignaciones'

/**
 * El dinero suelto y la invariante del patrimonio.
 *
 * `dinero_suelto` no es una columna, y estas pruebas son la razon. Si alguien lo
 * agrega para "no calcularlo cada vez", la columna arranca en cero, el resumen por
 * defecto sigue dando bien mientras no haya sobres, y el primer asignar deja de cuadrar
 * en produccion. Con la suma derivada no hay nada que sincronizar, asi que lo que se
 * prueba aca es que la suma sea correcta en los cuatro estados raros: sobres en
 * negativo, cuentas en deuda, cuentas de credito, y asignar mas de lo que se tiene.
 */

const ENERO = '2026-01'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number
let cuenta_id: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta_id = await crearCuenta(base.db, cartera, { nombre: 'Banco', saldo_inicial: '0.00' })
})

afterEach(async () => {
  await base.cerrar()
})

async function sobre(nombre: string): Promise<number> {
  return (await crearSobre(base.db, usuario, cartera, grupo, nombre)).id
}

describe('dinero suelto e invariante', () => {
  it('es la diferencia entre los saldos de cuentas y los disponibles de sobres', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '30000.00' })
    const id = await sobre('Comida')
    await crearAsignacion(base.db, { sobre_id: id, monto: '22000.00', periodo: ENERO })

    const resumen = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(resumen.patrimonio).toBe('30000.00')
    expect(resumen.asignado).toBe('22000.00')
    expect(resumen.dinero_suelto).toBe('8000.00')
  })

  it('la invariante se cumple: disponibles mas suelto iguala el patrimonio', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '30000.00' })
    const id = await sobre('Comida')
    await crearAsignacion(base.db, { sobre_id: id, monto: '22000.00', periodo: ENERO })

    await comprobarInvariante(base.db, usuario, cartera, ENERO)

    const resumen = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(resumen.patrimonio).toBe('30000.00')
    expect(resumen.asignado).toBe('22000.00')
    expect(resumen.dinero_suelto).toBe('8000.00')
  })

  it('queda negativo si se asigna mas de lo que hay, y lo dice', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '30000.00' })
    const id = await sobre('Comida')
    await crearAsignacion(base.db, { sobre_id: id, monto: '35000.00', periodo: ENERO })

    const resumen = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(resumen.dinero_suelto).toBe('-5000.00')
    expect(resumen.hay_dinero_suelto).toBe(false)
  })

  it('se cumple con sobres en negativo, cuentas en deuda y movimientos sin asignar', async () => {
    const corriente = await crearCuenta(base.db, cartera, {
      nombre: 'Corriente',
      saldo_inicial: '5000.00',
    })
    await crearCuenta(base.db, cartera, {
      nombre: 'Tarjeta',
      tipo: 'credito',
      saldo_inicial: '-2000.00',
    })

    const comido = await sobre('Comida')
    const transporte = await sobre('Transporte')
    await crearAsignacion(base.db, { sobre_id: comido, monto: '1000.00', periodo: ENERO })
    await crearAsignacion(base.db, { sobre_id: transporte, monto: '500.00', periodo: ENERO })
    // Un gasto que se pasa: el sobre queda en negativo.
    await crearMovimiento(base.db, {
      cuenta_id: corriente,
      sobre_id: comido,
      monto: '-2500.00',
      fecha: '2026-01-15',
    })
    // Un gasto sin sobre: es dinero de la cuenta que no esta repartido.
    await crearMovimiento(base.db, { cuenta_id: corriente, monto: '-300.00', fecha: '2026-01-20' })

    const resumen = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(resumen.asignado).toBe('-1000.00')
    expect(resumen.patrimonio).toBe('200.00')
    // El disponible negativo no es un problema para la invariante: se compensa con
    // dinero suelto, y aca hay mas de lo que hace falta.
    expect(resumen.dinero_suelto).toBe('1200.00')
    await comprobarInvariante(base.db, usuario, cartera, ENERO)
  })

  it('lanza en vez de devolver un estado valido cuando no cuadra', () => {
    // `InvarianteRota` existe para esto: un desajuste es un error, no un numero que se
    // pueda pintar. Sin esto, un `false` y la pantalla sigue mostrando un total falso.
    expect(new InvarianteRota(ENERO)).toBeInstanceOf(Error)
    expect(new InvarianteRota(ENERO).message).toContain(ENERO)
  })

  it('no lee una cartera de otro usuario', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Trabajo' })

    await expect(resumenDeCartera(base.db, usuario, carteraAjena, ENERO)).rejects.toBeInstanceOf(
      CarteraNoExiste,
    )
  })

  it('el resumen cambia con el periodo, porque el disponible se deriva', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '10000.00' })
    const id = await sobre('Comida')
    await crearAsignacion(base.db, { sobre_id: id, monto: '2000.00', periodo: '2026-01' })
    await crearAsignacion(base.db, { sobre_id: id, monto: '3000.00', periodo: '2026-03' })

    expect((await resumenDeCartera(base.db, usuario, cartera, '2026-01')).asignado).toBe('2000.00')
    expect((await resumenDeCartera(base.db, usuario, cartera, '2026-02')).asignado).toBe('2000.00')
    expect((await resumenDeCartera(base.db, usuario, cartera, '2026-03')).asignado).toBe('5000.00')
  })
})

describe('tapar un desborde no crea ni destruye dinero', () => {
  it('el dinero suelto baja y el disponible sube por el mismo importe', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '10000.00' })
    const id = await sobre('Comida')
    await crearAsignacion(base.db, { sobre_id: id, monto: '1000.00', periodo: ENERO })
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: id,
      monto: '-1400.00',
      fecha: '2026-01-15',
    })

    const antes = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(antes.asignado).toBe('-400.00')
    expect(antes.patrimonio).toBe('8600.00')
    expect(antes.dinero_suelto).toBe('9000.00')

    await taparDesborde(base.db, usuario, cartera, id, ENERO, '400.00')

    const despues = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(despues.asignado).toBe('0.00')
    expect(despues.dinero_suelto).toBe('8600.00')
    expect(despues.patrimonio).toBe(antes.patrimonio)
  })

  it('mover entre sobres deja el patrimonio y el dinero suelto intactos', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '10000.00' })
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await crearAsignacion(base.db, { sobre_id: origen, monto: '3000.00', periodo: ENERO })
    await crearAsignacion(base.db, { sobre_id: destino, monto: '500.00', periodo: ENERO })

    const antes = await resumenDeCartera(base.db, usuario, cartera, ENERO)

    await moverEntreSobres(base.db, usuario, cartera, origen, destino, ENERO, '1200.00')

    const despues = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(despues.patrimonio).toBe(antes.patrimonio)
    expect(despues.dinero_suelto).toBe(antes.dinero_suelto)
    expect(despues.asignado).toBe(antes.asignado)
    await comprobarInvariante(base.db, usuario, cartera, ENERO)
  })
})

describe('el aviso de desborde', () => {
  async function enNegativo(): Promise<number> {
    const id = await sobre('Comida')
    await crearAsignacion(base.db, { sobre_id: id, monto: '2000.00', periodo: ENERO })
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: id,
      monto: '-2400.00',
      fecha: '2026-01-15',
    })
    return id
  }

  it('avisa que se puede tapar cuando el dinero suelto alcanza', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '5000.00' })
    const id = await enNegativo()

    const aviso = await avisarDesborde(base.db, usuario, cartera, ENERO, id)

    expect(aviso.negativo).toBe('-400.00')
    expect(aviso.dinero_suelto).toBe('3000.00')
    expect(aviso.cubre).toBe(true)
  })

  it('avisa igual cuando el dinero suelto no alcanza, y lo dice', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '200.00' })
    const id = await enNegativo()

    const aviso = await avisarDesborde(base.db, usuario, cartera, ENERO, id)

    // Se gastaron 2400 y solo havia 200: la cartera quedo debiendo, no solo el sobre.
    expect(aviso.negativo).toBe('-400.00')
    expect(aviso.dinero_suelto).toBe('-1800.00')
    expect(aviso.hay_dinero_suelto).toBe(false)
    expect(aviso.cubre).toBe(false)
  })

  it('no tapa nada por su cuenta: el disponible sigue negativo', async () => {
    await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '5000.00' })
    const id = await enNegativo()

    await avisarDesborde(base.db, usuario, cartera, ENERO, id)

    const resumen = await resumenDeCartera(base.db, usuario, cartera, ENERO)
    expect(resumen.asignado).toBe('-400.00')
    expect(resumen.dinero_suelto).toBe('3000.00')
  })

  it('no dice que cubre cuando no hay dinero suelto, ni cuando el sobre no debe', async () => {
    const id = await sobre('Comida')
    const sinPlata = await avisarDesborde(base.db, usuario, cartera, ENERO, id)
    expect(sinPlata.hay_dinero_suelto).toBe(false)
    expect(sinPlata.cubre).toBe(false)

    await crearAsignacion(base.db, { sobre_id: id, monto: '1000.00', periodo: ENERO })
    const tapado = await avisarDesborde(base.db, usuario, cartera, ENERO, id)
    expect(tapado.cubre).toBe(false)
  })
})
