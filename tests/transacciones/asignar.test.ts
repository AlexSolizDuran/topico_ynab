/**
 * 060-transacciones, grupo 4: asignar un sobre y quitarselo.
 *
 * Estas pruebas existen para fijar la idea de que **asignar no mueve dinero, re-etiqueta**.
 * El importe ya habia salido de la cuenta cuando se registro el movimiento; asignarlo a un
 * sobre no lo mueve otra vez, decide en que bolsa se lo cuenta. Por eso el saldo de la
 * cuenta no puede cambiar, y por eso el disponible y el dinero suelto cambian en la misma
 * medida y en direcciones opuestas.
 *
 * El invariante que se repite en cada prueba: la suma de cartera es constante. Un gasto de
 * 200 sin asignar y el mismo asignado dan el mismo patrimonio; lo unico que se reparte es
 * entre "disponible de un sobre" y "dinero suelto".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BaseDePruebas } from '../helpers/pg'
import { crearBaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearTransferencia,
  crearUsuario,
} from '../helpers/fabricas'
import {
  MovimientoNoExiste,
  SobreDeOtraCartera,
  TraspasoNoAsignable,
  asignarSobre,
  buscarMovimiento,
  quitarSobre,
} from '@/repos/movimientos'
import { SobreNoExiste, crearSobre, disponibleDeSobre } from '@/repos/sobres'
import { saldoDeCuenta } from '@/repos/cuentas'
import { dineroSuelto } from '@/repos/dinero-suelto'

const ENERO = '2026-01'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number
let cuenta: number
let sobre: number

let cuentas = 0
function nombreCuenta(prefijo = 'Banco'): string {
  return `${prefijo} ${cuentas++}`
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '1000.00' })
  sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Comida')).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: ENERO })
})

afterEach(async () => {
  await base.cerrar()
})

/** Un gasto de 200 sin asignar, en enero. El punto de partida de casi todo el bloque. */
async function gastoSinAsignar(monto = '200'): Promise<number> {
  return crearMovimiento(base.db, {
    cuenta_id: cuenta,
    monto: `-${monto}`,
    tipo: 'gasto',
    fecha: '2026-01-15',
    descripcion: 'Compra sin asignar',
  })
}

function saldo(cuenta_id: number): Promise<string> {
  return saldoDeCuenta(base.db, usuario, cartera, cuenta_id)
}

function disponible(sobre_id = sobre): Promise<string> {
  return disponibleDeSobre(base.db, usuario, cartera, sobre_id, ENERO)
}

function suelto(): Promise<string> {
  return dineroSuelto(base.db, usuario, cartera, ENERO)
}

describe('060: asignar un sobre a un movimiento pendiente', () => {
  it('baja el disponible del sobre y sube el dinero suelto por lo mismo', async () => {
    // Escenario `Asignar sobre a un movimiento pendiente`: 3000 asignados y una cuenta con
    // 1000, asi que todavia no hay dinero suelto, hay sobregiro.
    const movimiento = await gastoSinAsignar()
    expect(await disponible()).toBe('3000.00')
    expect(await suelto()).toBe('-2200.00')

    const resultado = await asignarSobre(base.db, usuario, movimiento, sobre)

    expect(resultado).toEqual({ id: movimiento, sobre_id: sobre })
    // El disponible de Comida disminuye en 200...
    expect(await disponible()).toBe('2800.00')
    // ...y el dinero suelto aumenta en 200. Exactamente lo que pide R4, y en sentidos
    // opuestos: los 200 no aparecen ni desaparecen, solo dejan de estar sueltos.
    expect(await suelto()).toBe('-2000.00')
  })

  it('no toca el saldo de la cuenta', async () => {
    // Escenario `El saldo de la cuenta no cambia`. El saldo se deriva sumando el `monto` por
    // `cuenta_id`, y asignar un sobre no escribe `cuenta_id` ni `monto`: no hay forma de que
    // se mueva. Si alguien agrega un "update de saldo" en esta operacion, esta prueba falla.
    const movimiento = await gastoSinAsignar()
    const antes = await saldo(cuenta)
    expect(antes).toBe('800.00')

    await asignarSobre(base.db, usuario, movimiento, sobre)

    expect(await saldo(cuenta)).toBe(antes)
  })

  it('cambiar el sobre de mano reparte, no crea ni destruye', async () => {
    // El dinero suelto cuenta otra cosa de la que uno supondria: sale de
    // `sum(saldos) - sum(disponibles)`, asi que un movimiento **sin asignar no esta en
    // ningun disponible** y su importe esta suelto. Por eso hay dos pasos distintos aqui, y
    // el segundo es el que no mueve el dinero suelto.
    const otroSobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Transporte')).id
    await crearAsignacion(base.db, { sobre_id: otroSobre, monto: '500.00', periodo: ENERO })
    const movimiento = await gastoSinAsignar()

    // Con 3000 + 500 asignados y una cuenta con 1000 menos un gasto de 200 sin asignar, el
    // disponible total es 3500 y el dinero suelto -2700.
    expect(await disponible(sobre)).toBe('3000.00')
    expect(await disponible(otroSobre)).toBe('500.00')
    expect(await suelto()).toBe('-2700.00')

    // Paso 1: entra a un sobre. Los 200 dejan de estar sueltos, como pide R4.
    await asignarSobre(base.db, usuario, movimiento, sobre)
    expect(await disponible(sobre)).toBe('2800.00')
    expect(await disponible(otroSobre)).toBe('500.00')
    expect(await suelto()).toBe('-2500.00')

    // Paso 2: re-etiquetar de Comida a Transporte. Los mismos 200 salen de uno y entran en
    // el otro, asi que los dos disponibles se mueven y el dinero suelto **no**: antes y
    // despues esta en -2500.
    const sueltoEntreSobres = await suelto()
    await asignarSobre(base.db, usuario, movimiento, otroSobre)
    expect(await disponible(sobre)).toBe('3000.00')
    expect(await disponible(otroSobre)).toBe('300.00')
    expect(await suelto()).toBe(sueltoEntreSobres)
    expect(sueltoEntreSobres).toBe('-2500.00')

    // El saldo no se movio en ninguno de los dos updates.
    expect(await saldo(cuenta)).toBe('800.00')
  })

  it('rechaza un sobre de otra cartera con un error propio', async () => {
    // Escenario `Asignar un sobre de otra cartera`. El error dice "de otra cartera" y no
    // "no existe": un usuario que esta viendo el sobre en su otra cartera concluiria que
    // escribio mal el id si la respuesta fuera la otra. Ver R3 y el encabezado del repo.
    const otraCartera = await crearCartera(base.db, usuario, { nombre: 'Trabajo' })
    const otroGrupo = await crearGrupo(base.db, otraCartera, { nombre: 'Gastos' })
    const sobreAjeno = (await crearSobre(base.db, usuario, otraCartera, otroGrupo, 'Viajes')).id
    const movimiento = await gastoSinAsignar()

    const fallo = await asignarSobre(base.db, usuario, movimiento, sobreAjeno).catch((e: unknown) => e)

    expect(fallo).toBeInstanceOf(SobreDeOtraCartera)
    // Y el error de "no existe" es otro, a proposito.
    expect(fallo).not.toBeInstanceOf(SobreNoExiste)

    // El movimiento sigue sin asignar: el rechazo no escribio nada.
    expect(await disponible()).toBe('3000.00')
    expect(await suelto()).toBe('-2200.00')
  })
})

describe('060: quitar el sobre de un movimiento', () => {
  it('devuelve el importe al dinero suelto y sube el disponible', async () => {
    // Escenario `Quitar el sobre de un movimiento`.
    const movimiento = await gastoSinAsignar()
    await asignarSobre(base.db, usuario, movimiento, sobre)
    expect(await disponible()).toBe('2800.00')

    const resultado = await quitarSobre(base.db, usuario, movimiento)

    expect(resultado).toEqual({ id: movimiento, sobre_id: null })
    expect(await disponible()).toBe('3000.00')
    expect(await suelto()).toBe('-2200.00')
    // El saldo, ni se entera.
    expect(await saldo(cuenta)).toBe('800.00')
  })

  it('quitar un sobre que no tenia no cambia nada', async () => {
    const movimiento = await gastoSinAsignar()

    expect(await quitarSobre(base.db, usuario, movimiento)).toEqual({ id: movimiento, sobre_id: null })

    expect(await disponible()).toBe('3000.00')
    expect(await suelto()).toBe('-2200.00')
  })

  it('asignar, quitar y volver a asignar vuelve al mismo estado', async () => {
    const movimiento = await gastoSinAsignar()
    const inicial = { disponible: await disponible(), suelto: await suelto() }

    await asignarSobre(base.db, usuario, movimiento, sobre)
    await quitarSobre(base.db, usuario, movimiento)
    await asignarSobre(base.db, usuario, movimiento, sobre)

    const final = { disponible: await disponible(), suelto: await suelto() }
    // Cambiar de sobre a mano es reversible sin residuos, porque no hay estado guardado.
    expect(final.disponible).toBe('2800.00')
    expect(final.suelto).toBe('-2000.00')
    expect(inicial.disponible).toBe('3000.00')
    expect(inicial.suelto).toBe('-2200.00')
  })
})

describe('060: asignar y quitar son operaciones del dueño', () => {
  it('no asigna ni quita sobre un movimiento de otro usuario', async () => {
    // R10: cada usuario solo ve y opera los suyos. El movimiento ajeno se responde igual que
    // uno inexistente, con el mismo error, para que la existencia de un id ajeno no se
    // pueda deducir del mensaje.
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Fijos' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta('Ajena') })
    const sobreAjeno = (await crearSobre(base.db, otro, carteraAjena, grupoAjeno, 'Comida')).id
    const movimientoAjeno = await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      monto: '-200',
      fecha: '2026-01-15',
    })

    await expect(asignarSobre(base.db, usuario, movimientoAjeno, sobre)).rejects.toBeInstanceOf(
      MovimientoNoExiste,
    )
    await expect(quitarSobre(base.db, usuario, movimientoAjeno)).rejects.toBeInstanceOf(
      MovimientoNoExiste,
    )
    // Y el mismo error para un id que no existe, que es la mitad del aislamiento.
    await expect(asignarSobre(base.db, usuario, 999999, sobre)).rejects.toBeInstanceOf(
      MovimientoNoExiste,
    )
  })

  it('no asigna a un sobre de otro usuario y lo reporta como que no existe', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Fijos' })
    const sobreAjeno = (await crearSobre(base.db, otro, carteraAjena, grupoAjeno, 'Comida')).id
    const movimiento = await gastoSinAsignar()

    // Un sobre de otro usuario responde `SobreNoExiste`, no `SobreDeOtraCartera`:
    // distinguirlo confirmaria que el sobre existe.
    await expect(asignarSobre(base.db, usuario, movimiento, sobreAjeno)).rejects.toBeInstanceOf(
      SobreNoExiste,
    )
  })
})

describe('060: un traspaso no se asigna', () => {
  it('rechaza asignarle un sobre a una pata de traspaso', async () => {
    // Es una prueba propia del repositorio, sin escenario en el spec, porque el caso no es
    // de un usuario: es una consecuencia de que el disponible excluya los traspasos.
    const origen = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
    const destino = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
    const { origen_id, destino_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })
    const disponibleAntes = await disponible()

    await expect(asignarSobre(base.db, usuario, origen_id, sobre)).rejects.toBeInstanceOf(
      TraspasoNoAsignable,
    )
    await expect(asignarSobre(base.db, usuario, destino_id, sobre)).rejects.toBeInstanceOf(
      TraspasoNoAsignable,
    )

    // Sin este chequeo, asignar una pata moveria el disponible sin que el dinero hubiera
    // estado nunca en ese sobre: el importe se perdia de los dos lados del inventario.
    expect(await disponible()).toBe(disponibleAntes)
  })

  it('una pata de traspaso no es un pendiente de asignar', async () => {
    // Las dos patas siguen sin sobre, y `pendiente` es la columna que usa la interfaz para
    // offercer asignarlas. Una pata no esta esperando destino: su dinero llego desde otro
    // sitio. Ver R2 y el campo `pendiente` de `MovimientoVisto`.
    const origen = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
    const destino = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
    const { origen_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })

    const pata = await buscarMovimiento(base.db, usuario, origen_id)

    expect(pata?.sobre_id).toBeNull()
    expect(pata?.pendiente).toBe(false)
  })
})
