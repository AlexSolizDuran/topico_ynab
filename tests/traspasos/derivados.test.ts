import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas } from '../helpers/pg'
import type { BaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearTransferencia,
  crearUsuario,
} from '../helpers/fabricas'
import { saldoDeCuenta } from '@/repos/cuentas'
import { comprobarInvariante, resumenDeCartera } from '@/repos/dinero-suelto'
import {
  TraspasoNoAsignable,
  TraspasoNoRegistrable,
  asignarSobre,
  registrarMovimiento,
} from '@/repos/movimientos'
import { crearSobre, disponibleDeSobre } from '@/repos/sobres'
import { registrarTraspaso } from '@/repos/traspasos'

/**
 * `070` grupo 3: los derivados.
 *
 * Este archivo es el que decide si un traspaso es un traspaso. La comprobacion de
 * `dinero_suelto` mas importante del change esta aca: si las dos patas se sumaran en vez de
 * restarse, **todo** el modelo de sobres quedaria mal y ninguna prueba de `sobres` lo
 * detectaria, porque esas no colocan un traspaso al lado de un sobre.
 *
 * Que los importes se comparen como `toBe('...')` y no como numeros no es estilo:
 * `resumenDeCartera` devuelve `Dinero`, y comparar eso con `toBe` sobre un `numeric(16,2)`
 * verifica que la regla del dinero se respeta de punta a punta. Si algun dia un `Dinero`
 * vuelve como `number`, estas pruebas dejan de compilar.
 */

const PERIODO = '2026-03'

let base: BaseDePruebas
let usuario: number
let cartera: number
let corriente: number
let ahorro: number
let grupo: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Principal' })
  corriente = await crearCuenta(base.db, cartera, {
    nombre: 'Corriente',
    saldo_inicial: '10000.00',
  })
  ahorro = await crearCuenta(base.db, cartera, { nombre: 'Ahorro', saldo_inicial: '2000.00' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Casa' })
})

afterEach(async () => {
  await base.cerrar()
})

/** Crea un sobre con una asignacion, y devuelve el id. */
async function sobreAsignado(nombre: string, monto: string): Promise<number> {
  const sobre = (await crearSobre(base.db, usuario, cartera, grupo, nombre)).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto, periodo: PERIODO })
  return sobre
}

/**
 * Una tarjeta que debe `importe`, con el adeudo nacido como gasto.
 *
 * El adeudo se crea con un gasto real y no con un `saldo_inicial` escrito a mano: asi la
 * deuda nace como lo que es en la realidad, un gasto ya registrado, y el disponible del
 * sobre queda en negativo por el motivo correcto.
 */
async function tarjetaQueDebe(importe: string): Promise<{ credito: number; sobre: number }> {
  const credito = await crearCuenta(base.db, cartera, {
    nombre: 'Credito',
    tipo: 'credito',
    saldo_inicial: '0.00',
  })
  const sobre = await sobreAsignado('Compras', importe)
  await crearMovimiento(base.db, {
    cuenta_id: credito,
    sobre_id: sobre,
    tipo: 'gasto',
    monto: `-${importe}`,
    fecha: '2026-03-05',
    descripcion: 'Compra con tarjeta',
  })
  return { credito, sobre }
}

describe('070: un traspaso no toca ningun sobre', () => {
  it('R2 el disponible de todos los sobres queda igual antes y despues de un traspaso de 5,000', async () => {
    // Comida tiene exactamente 5,000 asignados, que es el importe del traspaso: si una pata
    // se colara en el disponible, ese sobre caeria a cero. Es la version con dinero
    // asignado del escenario, y la unica que distingue "no lo toco" de "lo toco y no se nota".
    const comida = await sobreAsignado('Comida', '5000.00')
    const transporte = await sobreAsignado('Transporte', '1000.00')

    expect(await disponibleDeSobre(base.db, usuario, cartera, comida, PERIODO)).toBe('5000.00')
    expect(await disponibleDeSobre(base.db, usuario, cartera, transporte, PERIODO)).toBe('1000.00')

    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '5000.00',
      fecha: '2026-03-10',
      descripcion: 'Ahorro de marzo',
    })

    expect(await disponibleDeSobre(base.db, usuario, cartera, comida, PERIODO)).toBe('5000.00')
    expect(await disponibleDeSobre(base.db, usuario, cartera, transporte, PERIODO)).toBe('1000.00')
  })

  it('R2 el disponible tampoco se mueve con una pata sola, porque sigue sin tener sobre', async () => {
    const sobre = await sobreAsignado('Comida', '2500.00')
    const antes = await disponibleDeSobre(base.db, usuario, cartera, sobre, PERIODO)

    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '500.00',
      fecha: '2026-03-11',
      descripcion: 'Una pata sola',
    })

    expect(await disponibleDeSobre(base.db, usuario, cartera, sobre, PERIODO)).toBe(antes)
  })

  it('R2 el camino de alta simple de 060 no acepta un traspaso', async () => {
    // `registrarMovimiento` es el camino de `060`, donde un traspaso no tiene por que estar.
    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: corriente,
        sobre_id: null,
        tipo: 'traspaso',
        monto: '100.00',
        fecha: '2026-03-10',
        descripcion: 'Colarse por aqui',
      }),
    ).rejects.toBeInstanceOf(TraspasoNoRegistrable)
  })

  it('R2 no se puede asignar un sobre a una pata de traspaso que ya existe', async () => {
    const sobre = await sobreAsignado('Comida', '1000.00')
    const { origen_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '750.00',
      fecha: '2026-03-10',
    })

    await expect(asignarSobre(base.db, usuario, origen_id, sobre)).rejects.toBeInstanceOf(
      TraspasoNoAsignable,
    )
  })
})

describe('070: un traspaso emparejado no mueve ni el dinero suelto ni el patrimonio', () => {
  it('R3 el dinero suelto y el patrimonio quedan identicos, y la invariante sigue valiendo', async () => {
    await sobreAsignado('Comida', '3000.00')

    const antes = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    await comprobarInvariante(base.db, usuario, cartera, PERIODO)

    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '5000.00',
      fecha: '2026-03-10',
      descripcion: 'Mover a ahorro',
    })

    const despues = await resumenDeCartera(base.db, usuario, cartera, PERIODO)

    expect(despues.patrimonio).toBe(antes.patrimonio)
    expect(despues.dinero_suelto).toBe(antes.dinero_suelto)
    expect(despues.asignado).toBe(antes.asignado)

    // Los saldos si se mueven, y en direcciones opuestas. Si esto no pasara, la prueba de
    // arriba estaria comparando dos ceros y no probaria nada.
    expect(despues.patrimonio).toBe('12000.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, corriente)).toBe('5000.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, ahorro)).toBe('7000.00')

    await comprobarInvariante(base.db, usuario, cartera, PERIODO)
  })

  it('R3 el patrimonio no cambia con ningun importe, tampoco con uno mayor que el saldo', async () => {
    const antes = await resumenDeCartera(base.db, usuario, cartera, PERIODO)

    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '999999.99',
      fecha: '2026-03-10',
      descripcion: 'Importe imposible',
    })

    const despues = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    expect(despues.patrimonio).toBe(antes.patrimonio)
    expect(despues.dinero_suelto).toBe(antes.dinero_suelto)
  })
})

describe('070: una pata sola si mueve el dinero suelto y el patrimonio', () => {
  it('R1 y R3 una pata sola de 500 mueve ambos por el importe completo, y la invariante sigue valiendo', async () => {
    await sobreAsignado('Comida', '3000.00')

    const antes = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    expect(antes.patrimonio).toBe('12000.00')
    expect(antes.dinero_suelto).toBe('9000.00')

    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Sin contraparte',
    })

    const despues = await resumenDeCartera(base.db, usuario, cartera, PERIODO)

    // El escenario `Una pata sola si mueve el dinero suelto`, al centavo. El importe se lee de
    // los saldos de las cuentas y no del resultado, para que la prueba no dependa de la
    // magnitud que devuelve el repositorio.
    expect(await saldoDeCuenta(base.db, usuario, cartera, corriente)).toBe('9500.00')

    // Sin pata opuesta, `suma(saldos)` cae 500 y el disponible no se mueve: bajan los dos.
    expect(despues.patrimonio).toBe('11500.00')
    expect(despues.dinero_suelto).toBe('8500.00')
    expect(despues.asignado).toBe('3000.00')

    await comprobarInvariante(base.db, usuario, cartera, PERIODO)

    expect(resultado.destino_id).toBeNull()
  })
})

describe('070: pagar el adeudo de una tarjeta es un traspaso', () => {
  it('R4 pagar 600 a una tarjeta que debia 600 la salda, avisa, y no pide ningun sobre', async () => {
    const { credito } = await tarjetaQueDebe('600.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('-600.00')

    const antes = await resumenDeCartera(base.db, usuario, cartera, PERIODO)

    const resultado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: credito,
      monto: '600.00',
      fecha: '2026-03-12',
      descripcion: 'Pago de tarjeta',
    })

    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('0.00')
    expect(resultado.aviso).toContain('600.00')

    // Que no pida sobre es que `registrarTraspaso` no tiene ningun `sobre_id` que pedir: las
    // patas van con `sobre_id: null` siempre. No hay una rama que lo acepte.
    const despues = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    expect(despues.dinero_suelto).toBe(antes.dinero_suelto)
    expect(despues.patrimonio).toBe(antes.patrimonio)
  })

  it('R4 el pago parcial baja la deuda a 300 y no mueve el dinero suelto', async () => {
    // El escenario `Pago parcial de tarjeta` dice "la deuda baja a 300". La segunda mitad de
    // su THEN decia que el dinero suelto bajaba 300, y es imposible: las dos patas se
    // cancelan en `suma(saldos)`. Escenario corregido el 2026-09-30.
    const { credito } = await tarjetaQueDebe('600.00')
    const antes = await resumenDeCartera(base.db, usuario, cartera, PERIODO)

    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: credito,
      monto: '300.00',
      fecha: '2026-03-12',
      descripcion: 'Pago parcial',
    })

    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('-300.00')

    const despues = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    expect(despues.dinero_suelto).toBe(antes.dinero_suelto)
    expect(despues.patrimonio).toBe(antes.patrimonio)
    await comprobarInvariante(base.db, usuario, cartera, PERIODO)
  })

  it('R4 un gasto con tarjeta sigue siendo un gasto contra el sobre, y el pago posterior no lo toca', async () => {
    // El escenario `Usuario que paga con tarjeta` va al reves del de arriba: aqui la compra
    // genera gasto y desborde; alla, pagar la tarjeta es un traspaso. Las dos mitades de R4
    // juntas dicen que la tarjeta no es un gasto doble.
    const credito = await crearCuenta(base.db, cartera, {
      nombre: 'Credito',
      tipo: 'credito',
      saldo_inicial: '0.00',
    })
    // El sobre va **sin asignacion**: si tuviera 600 asignados y gastara 600, el disponible
    // caeria a cero y no habria desborde que tapar. El desborde de una compra con tarjeta
    // nace de gastar contra un sobre sin fondo.
    const sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Compras')).id

    await registrarMovimiento(base.db, usuario, {
      cuenta_id: credito,
      sobre_id: sobre,
      tipo: 'gasto',
      monto: '-600.00',
      fecha: '2026-03-05',
      descripcion: 'Compra con tarjeta',
    })

    expect(await disponibleDeSobre(base.db, usuario, cartera, sobre, PERIODO)).toBe('-600.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('-600.00')

    // El desborde son 600 y el dinero suelto los cubre entero: ese es el sentido de "ese mismo
    // importe queda disponible para tapar el desborde".
    const desborde = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    expect(desborde.desborde).toBe('600.00')
    expect(desborde.dinero_suelto).toBe('12000.00')
    expect(desborde.cubre_desborde).toBe(true)

    // Y al pagar, el importe del pago es exactamente el desborde, asi que el pago no necesita
    // asignarse a ningun sobre: el sobre ya sabe que debe 600 y el traspaso no lo altera.
    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: credito,
      monto: '600.00',
      fecha: '2026-03-12',
      descripcion: 'Pago de tarjeta',
    })

    expect(await disponibleDeSobre(base.db, usuario, cartera, sobre, PERIODO)).toBe('-600.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, credito)).toBe('0.00')
  })
})
