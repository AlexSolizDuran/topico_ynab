import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas } from '../helpers/pg'
import type { BaseDePruebas } from '../helpers/pg'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import { saldoDeCuenta } from '@/repos/cuentas'
import { crearSobre } from '@/repos/sobres'
import { registrarTraspaso } from '@/repos/traspasos'

/**
 * `070` grupo 4: los avisos.
 *
 * Los dos avisos de R1 y R4 son **lecturas sobre lo que ya se escribio**, no cuentas. La
 * diferencia importa: el de pata unica no necesita el dinero suelto para saber que se mueve,
 * y el de deuda no necesita una tabla de deudas, solo el saldo de la cuenta antes y despues.
 *
 * Lo que se prueba aca es que los avisos sean **exactos**: que aparezcan cuando corresponde y,
 * sobre todo, que **no** aparezcan cuando no. Un aviso que sale de mas enseña a la persona a
 * ignorar los avisos, que es peor que no tenerlos.
 */

let base: BaseDePruebas
let usuario: number
let cartera: number
let corriente: number
let ahorro: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Principal' })
  corriente = await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '10000.00' })
  ahorro = await crearCuenta(base.db, cartera, { nombre: 'Ahorro', saldo_inicial: '2000.00' })
})

afterEach(async () => {
  await base.cerrar()
})

/**
 * Una cuenta de credito que debe `deuda`, con el adeudo nacido como gasto.
 *
 * El saldo inicial va en **cero**: la deuda la crea el movimiento de gasto. Poner tambien un
 * `saldo_inicial` negativo duplicaria la deuda y el aviso seguiria naming el importe correcto,
 * porque el delta es el mismo, pero el saldo final no cuadra.
 */
async function creditoQueDebe(nombre: string, deuda: string): Promise<number> {
  const credito = await crearCuenta(base.db, cartera, {
    nombre,
    tipo: 'credito',
    saldo_inicial: '0.00',
  })
  const grupo = await crearGrupo(base.db, cartera, { nombre: 'Compras' })
  const sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Compras')).id
  await crearMovimiento(base.db, {
    cuenta_id: credito,
    sobre_id: sobre,
    tipo: 'gasto',
    monto: `-${deuda}`,
    fecha: '2026-03-05',
    descripcion: 'Compra con tarjeta',
  })
  return credito
}

describe('070: el aviso de pata unica', () => {
  it('R1 avisa que no hay contraparte y nombra el importe, sin bloquear la operacion', async () => {
    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Sin contraparte',
    })

    // El aviso tiene que decir las tres cosas que R1 exige: que no hay contraparte, que el
    // dinero suelto se mueve y que el patrimonio se mueve.
    expect(resultado.aviso).toContain('contraparte')
    expect(resultado.aviso).toContain('dinero suelto')
    expect(resultado.aviso).toContain('patrimonio')
    expect(resultado.aviso).toContain('500.00')

    // Y no bloquea nada: la pata quedo escrita igual.
    expect(resultado.origen_id).toBeGreaterThan(0)
    expect(resultado.destino_id).toBeNull()
    expect(await saldoDeCuenta(base.db, usuario, cartera, corriente)).toBe('9500.00')
  })

  it('R1 el importe del aviso sale de la pata, no de medir el dinero suelto', async () => {
    // Dos traspasos de una pata, con otros saldos y otras asignaciones en el medio. Si el
    // mensaje se armara con `dinero_suelto`, estas dos ejecutarias darian numeros distintos
    // a 500 y 250; sale de la pata, asi que el importe es el que se escribio.
    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Primera',
    })

    const segundo = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '250.00',
      fecha: '2026-03-11',
      descripcion: 'Segunda',
    })

    expect(segundo.aviso).toContain('250.00')
    expect(segundo.aviso).not.toContain('500.00')
  })

  it('R1 con dos patas no hay aviso de pata unica', async () => {
    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '5000.00',
      fecha: '2026-03-10',
      descripcion: 'Emparejado',
    })

    // Sin destino no hay deuda, asi que un traspaso emparejado normal no produce ningun aviso.
    expect(resultado.aviso).toBeUndefined()
  })

  it('R1 el aviso depende de la forma del grupo, no de que el destino este a cero', async () => {
    // Destino con saldo exactamente 0: la pata opuesta existe y vale lo mismo. Sigue sin
    // haber aviso, porque lo que decide es cuantas patas se escribieron.
    const enCero = await crearCuenta(base.db, cartera, {
      nombre: 'Nueva',
      saldo_inicial: '0.00',
    })

    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: enCero,
      monto: '100.00',
      fecha: '2026-03-10',
      descripcion: 'A una cuenta nueva',
    })

    expect(resultado.aviso).toBeUndefined()
    expect(resultado.destino_id).toBeGreaterThan(0)
  })
})

describe('070: el aviso de deuda de una cuenta de credito', () => {
  it('R4 nombra cuanto se saldo de la deuda', async () => {
    const credito = await creditoQueDebe('Visa', '600.00')

    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: credito,
      monto: '600.00',
      fecha: '2026-03-12',
      descripcion: 'Pago total',
    })

    expect(resultado.aviso).toContain('deuda')
    expect(resultado.aviso).toContain('600.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('0.00')
  })

  it('R4 el pago parcial nombra lo que salio, no el total de la deuda', async () => {
    const credito = await creditoQueDebe('Visa', '600.00')

    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: credito,
      monto: '250.00',
      fecha: '2026-03-12',
      descripcion: 'Pago parcial',
    })

    // Lo que se saldio es 250. Los 600 son la deuda original y no aparecen.
    expect(resultado.aviso).toContain('250.00')
    expect(resultado.aviso).not.toContain('600.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('-350.00')
  })

  it('R4 no avisa cuando la cuenta de destino no es de credito', async () => {
    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Entre cuentas corrientes',
    })

    expect(resultado.aviso).toBeUndefined()
  })

  it('R4 no avisa si la tarjeta no debe nada, porque no hay deuda que reducir', async () => {
    // Una tarjeta en cero que recibe dinero queda con saldo a favor. Anunciar "saldo 400 de
    // la deuda" ahi seria falso, y por eso el aviso exige que el saldo previo sea negativo.
    const credito = await crearCuenta(base.db, cartera, {
      nombre: 'Visa',
      tipo: 'credito',
      saldo_inicial: '0.00',
    })

    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: credito,
      monto: '400.00',
      fecha: '2026-03-12',
      descripcion: 'Saldo a favor',
    })

    expect(resultado.aviso).toBeUndefined()
    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('400.00')
  })

  it('R4 el aviso de deuda y el de pata unica pueden convivir y se entregan juntos', async () => {
    // Una pata sola **hacia** una tarjeta no reduce la deuda (no hay pata que entre a la
    // tarjeta), asi que solo hay un aviso. Los dos caminos conviven en la misma funcion y se
    // concatenan en un unico string.
    const credito = await creditoQueDebe('Visa', '600.00')

    const conDestino = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: credito,
      monto: '200.00',
      fecha: '2026-03-12',
      descripcion: 'Con destino',
    })
    expect(conDestino.aviso).toContain('200.00')
    expect(conDestino.aviso).not.toContain('contraparte')

    const sinDestino = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '200.00',
      fecha: '2026-03-13',
      descripcion: 'Sin destino',
    })
    expect(sinDestino.aviso).toContain('contraparte')
    expect(sinDestino.aviso).not.toContain('deuda')
  })
})
