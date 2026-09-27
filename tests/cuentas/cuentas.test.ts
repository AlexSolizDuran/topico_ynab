import { describe, expect, it } from 'vitest'
import { crearCartera, crearCuenta, crearMovimiento, crearUsuario } from '../helpers/fabricas'
import { crearBaseDePruebas } from '../helpers/pg'
import {
  CuentaAjena,
  NombreDeCuentaDuplicado,
  SaldoNoCero,
  TipoConMovimientos,
  archivarCuenta,
  cambiarNombreCuenta,
  cambiarOrdenCuenta,
  cambiarTipoCuenta,
  corregirSaldoInicial,
  crearCuenta as crear,
  listarCuentas,
  listarCuentasArchivadas,
  obtenerCuenta,
  reactivarCuenta,
  restaurarCuenta,
  saldoDeCuenta,
  saldoEsCero,
  tieneMovimientos,
} from '../../src/repos/cuentas'
import { CarteraAjena, CarteraArchivada } from '../../src/repos/carteras'

/** Deja lista una cartera con su usuario, que es el punto de partida de casi todo. */
async function escenario() {
  const base = await crearBaseDePruebas()
  const usuario_id = await crearUsuario(base.db, { nombre_usuario: 'Ana' })
  const cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Casa', moneda: 'MXN' })
  return { ...base, usuario_id, cartera_id }
}

describe('crear cuentas', () => {
  it('registra una cuenta corriente con su saldo inicial', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()

    const cuenta = await crear(db, usuario_id, cartera_id, { nombre: 'Nómina', saldo_inicial: '5000.00' })

    expect(cuenta.nombre).toBe('Nómina')
    expect(cuenta.tipo).toBe('corriente')
    expect(cuenta.saldo_inicial).toBe('5000.00')
    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta.id)).toBe('5000.00')

    await cerrar()
  })

  it('acepta los cuatro tipos, y el de credito es deuda', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()

    for (const tipo of ['corriente', 'ahorro', 'efectivo', 'credito'] as const) {
      const cuenta = await crear(db, usuario_id, cartera_id, { nombre: `De ${tipo}`, tipo })
      expect(cuenta.tipo).toBe(tipo)
    }

    await cerrar()
  })

  it('rechaza un nombre duplicado en la misma cartera, y dice que ya esta en uso', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    await crear(db, usuario_id, cartera_id, { nombre: 'Principal' })

    const error = await crear(db, usuario_id, cartera_id, { nombre: 'Principal' }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(NombreDeCuentaDuplicado)
    expect((error as Error).message).toMatch(/ya hay una cuenta/i)

    await cerrar()
  })

  it('admite el mismo nombre en carteras distintas, porque cada cartera es independiente', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const otra_cartera = await crearCartera(db, usuario_id, { nombre: 'Trabajo', moneda: 'USD' })
    await crear(db, usuario_id, cartera_id, { nombre: 'Principal' })

    const en_otra = await crear(db, usuario_id, otra_cartera, { nombre: 'Principal' })

    expect(en_otra.nombre).toBe('Principal')
    expect(en_otra.cartera_id).toBe(otra_cartera)

    await cerrar()
  })

  it('no crea en una cartera ajena, y el error es el de cartera', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const intruso = await crearUsuario(db, { nombre_usuario: 'Beto' })
    const ajena = await crearCartera(db, intruso, { nombre: 'Suya', moneda: 'MXN' })

    await expect(
      crear(db, intruso, cartera_id, { nombre: 'Colada' }),
    ).rejects.toBeInstanceOf(CarteraAjena)
    expect(ajena).toBeGreaterThan(0)

    await cerrar()
  })

  it('no crea en una cartera archivada', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const { crearTablasDeDinero } = await import('../carteras/ayuda')
    await crearTablasDeDinero(db)
    const { archivarCartera } = await import('../../src/repos/carteras')
    await archivarCartera(db, usuario_id, cartera_id)

    await expect(crear(db, usuario_id, cartera_id, { nombre: 'Tarde' })).rejects.toBeInstanceOf(
      CarteraArchivada,
    )

    await cerrar()
  })
})

describe('el saldo se deriva de los movimientos', () => {
  it('resta un gasto del saldo inicial: 5000 menos 450 son 4550', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { nombre: 'Nómina', saldo_inicial: '5000.00' })
    await crearMovimiento(db, { cuenta_id, monto: '-450.00', tipo: 'gasto' })

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('4550.00')

    await cerrar()
  })

  it('suma un ingreso, y el signo va en el monto', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '100.00' })
    await crearMovimiento(db, { cuenta_id, monto: '250.00', tipo: 'ingreso' })

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('350.00')

    await cerrar()
  })

  it('no es una columna: borrar un movimiento lo recalcula sin tocar la cuenta', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '1000.00' })
    const movimiento_id = await crearMovimiento(db, { cuenta_id, monto: '-200.00', tipo: 'gasto' })

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('800.00')

    await db.execute(
      `update movimientos set eliminado_en = now() where id = ${movimiento_id}`,
    )

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('1000.00')

    await cerrar()
  })

  it('ignora los movimientos ya eliminados, tambien al contarlos', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id)
    const vivo = await crearMovimiento(db, { cuenta_id, monto: '-10.00', tipo: 'gasto' })
    const muerto = await crearMovimiento(db, { cuenta_id, monto: '-90.00', tipo: 'gasto' })
    await db.execute(`update movimientos set eliminado_en = now() where id = ${muerto}`)

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('-10.00')
    expect(await tieneMovimientos(db, usuario_id, cartera_id, cuenta_id)).toBe(true)
    expect(vivo).not.toBe(muerto)

    await cerrar()
  })

  it('corregir el saldo inicial mueve el saldo de inmediato, con los movimientos que ya habia', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '5000.00' })
    await crearMovimiento(db, { cuenta_id, monto: '-450.00', tipo: 'gasto' })

    await corregirSaldoInicial(db, usuario_id, cartera_id, cuenta_id, '6000.00')

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('5550.00')

    await cerrar()
  })

  it('el saldo llega como string, porque numeric es exacto y un float no', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    // El mayor valor que entra en `numeric(16,2)`: 14 digitos enteros y 2 decimales.
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '99999999999999.99' })

    const saldo = await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)

    expect(typeof saldo).toBe('string')
    expect(saldo).toBe('99999999999999.99')
    // El motivo medido de la regla: a esta magnitud un float ya perdio centavos, y
    // no aviso. Por eso el tipo es `string` y no `number`.
    expect(String(Number('99999999999999.99'))).not.toBe('99999999999999.99')

    await cerrar()
  })
})

describe('una cuenta de credito es deuda', () => {
  it('un gasto en una tarjeta deja el saldo en menos seiscientos', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { tipo: 'credito', saldo_inicial: '0.00' })

    await crearMovimiento(db, { cuenta_id, monto: '-600.00', tipo: 'gasto' })

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('-600.00')

    await cerrar()
  })

  it('un reembolso mayor que la deuda deja la tarjeta a favor', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { tipo: 'credito', saldo_inicial: '0.00' })
    await crearMovimiento(db, { cuenta_id, monto: '-600.00', tipo: 'gasto' })

    await crearMovimiento(db, { cuenta_id, monto: '800.00', tipo: 'ingreso' })

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('200.00')

    await cerrar()
  })

  it('una cuenta corriente en negativo se muestra igual que una tarjeta', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const corriente = await crearCuenta(db, cartera_id, { tipo: 'corriente', saldo_inicial: '0.00' })
    const tarjeta = await crearCuenta(db, cartera_id, { tipo: 'credito', saldo_inicial: '0.00' })
    await crearMovimiento(db, { cuenta_id: corriente, monto: '-75.00', tipo: 'gasto' })
    await crearMovimiento(db, { cuenta_id: tarjeta, monto: '-75.00', tipo: 'gasto' })

    const saldo_corriente = await saldoDeCuenta(db, usuario_id, cartera_id, corriente)
    const saldo_tarjeta = await saldoDeCuenta(db, usuario_id, cartera_id, tarjeta)

    expect(saldo_corriente).toBe(saldo_tarjeta)
    expect(saldo_corriente).toBe('-75.00')

    await cerrar()
  })
})

describe('editar cuentas', () => {
  it('renombrar conserva el saldo y el historial', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, {
      nombre: 'Viejo',
      saldo_inicial: '750.00',
    })
    await crearMovimiento(db, { cuenta_id, monto: '-50.00', tipo: 'gasto' })

    const renombrada = await cambiarNombreCuenta(db, usuario_id, cartera_id, cuenta_id, 'Nuevo')

    expect(renombrada.nombre).toBe('Nuevo')
    expect(renombrada.saldo_inicial).toBe('750.00')
    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('700.00')
    expect(await tieneMovimientos(db, usuario_id, cartera_id, cuenta_id)).toBe(true)

    await cerrar()
  })

  it('reordenar no altera los saldos', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const primera = await crearCuenta(db, cartera_id, { nombre: 'A', saldo_inicial: '10.00' })
    const segunda = await crearCuenta(db, cartera_id, { nombre: 'B', saldo_inicial: '20.00' })
    await crearMovimiento(db, { cuenta_id: segunda, monto: '-5.00', tipo: 'gasto' })

    await cambiarOrdenCuenta(db, usuario_id, cartera_id, segunda, -1)

    expect((await listarCuentas(db, usuario_id, cartera_id)).map((c) => c.id)).toEqual([segunda, primera])
    expect(await saldoDeCuenta(db, usuario_id, cartera_id, segunda)).toBe('15.00')

    await cerrar()
  })

  it('cambia el tipo de una cuenta sin movimientos', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { tipo: 'corriente' })

    const cambiada = await cambiarTipoCuenta(db, usuario_id, cartera_id, cuenta_id, 'ahorro')

    expect(cambiada.tipo).toBe('ahorro')

    await cerrar()
  })

  it('rechaza cambiar el tipo de una cuenta con movimientos, y explica por que', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { tipo: 'corriente' })
    await crearMovimiento(db, { cuenta_id, monto: '-10.00', tipo: 'gasto' })

    const error = await cambiarTipoCuenta(db, usuario_id, cartera_id, cuenta_id, 'credito').catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(TipoConMovimientos)
    expect((error as Error).message).toMatch(/sin movimientos|no puede cambiar de tipo/i)
    expect((await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)).tipo).toBe('corriente')

    await cerrar()
  })
})

describe('archivar cuentas', () => {
  it('archiva una cuenta en cero y la saca de la lista activa', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '0.00' })
    const con_saldo = await crearCuenta(db, cartera_id, { saldo_inicial: '90.00' })

    const archivada = await archivarCuenta(db, usuario_id, cartera_id, cuenta_id)

    expect(archivada.archivada).toBe(true)
    expect((await listarCuentas(db, usuario_id, cartera_id)).map((c) => c.id)).toEqual([con_saldo])
    expect((await listarCuentasArchivadas(db, usuario_id, cartera_id)).map((c) => c.id)).toEqual([
      cuenta_id,
    ])

    await cerrar()
  })

  it('rechaza archivar una cuenta con saldo y dice que la deje en cero', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '42.00' })

    const error = await archivarCuenta(db, usuario_id, cartera_id, cuenta_id).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(SaldoNoCero)
    expect((error as Error).message).toMatch(/Dejela en cero primero/)
    expect((await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)).archivada).toBe(false)

    await cerrar()
  })

  it('no archiva una cuenta que llego a cero por movimientos, no solo por inicial', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '100.00' })
    await crearMovimiento(db, { cuenta_id, monto: '-100.00', tipo: 'gasto' })

    expect(await saldoEsCero(db, usuario_id, cartera_id, cuenta_id)).toBe(true)
    expect((await archivarCuenta(db, usuario_id, cartera_id, cuenta_id)).archivada).toBe(true)

    await cerrar()
  })

  it('un movimiento en una cuenta archivada la reactiva sola', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '0.00' })
    await archivarCuenta(db, usuario_id, cartera_id, cuenta_id)

    await crearMovimiento(db, { cuenta_id, monto: '250.00', tipo: 'traspaso' })
    await reactivarCuenta(db, usuario_id, cartera_id, cuenta_id)

    expect((await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)).archivada).toBe(false)
    expect((await listarCuentas(db, usuario_id, cartera_id)).map((c) => c.id)).toContain(cuenta_id)

    await cerrar()
  })

  it('restaurar devuelve la cuenta con su historial', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { nombre: 'Guardada', saldo_inicial: '0.00' })
    await archivarCuenta(db, usuario_id, cartera_id, cuenta_id)

    const restaurada = await restaurarCuenta(db, usuario_id, cartera_id, cuenta_id)

    expect(restaurada.archivada).toBe(false)
    expect(restaurada.nombre).toBe('Guardada')

    await cerrar()
  })
})

describe('aislamiento entre usuarios', () => {
  it('la lista de cuentas sale de la sesion del usuario, no de un parametro libre', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    await crearCuenta(db, cartera_id, { nombre: 'Mia' })
    const intruso = await crearUsuario(db, { nombre_usuario: 'Beto' })
    const cartera_intruso = await crearCartera(db, intruso, { nombre: 'Suya', moneda: 'MXN' })
    await crearCuenta(db, cartera_intruso, { nombre: 'Suya de el' })

    const mias = await listarCuentas(db, usuario_id, cartera_id)

    expect(mias.map((c) => c.nombre)).toEqual(['Mia'])
    expect(await listarCuentas(db, intruso, cartera_id)).toEqual([])

    await cerrar()
  })

  it('no deja registrar un movimiento en una cuenta de otra cartera', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const ajena_cartera = await crearCartera(db, usuario_id, { nombre: 'Trabajo', moneda: 'MXN' })
    const cuenta_ajena = await crearCuenta(db, ajena_cartera, { nombre: 'Corriente' })

    const error = await obtenerCuenta(db, usuario_id, cartera_id, cuenta_ajena).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(CuentaAjena)

    await cerrar()
  })

  it('el saldo de una cuenta ajena no se puede leer, ni aunque se conozca el id', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const intruso = await crearUsuario(db, { nombre_usuario: 'Beto' })
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '9999.00' })

    await expect(
      saldoDeCuenta(db, intruso, cartera_id, cuenta_id),
    ).rejects.toBeInstanceOf(CuentaAjena)

    await cerrar()
  })

  it('ajustar el saldo inicial de una cuenta propia recalcula el derivado', async () => {
    const { db, cerrar, usuario_id, cartera_id } = await escenario()
    const cuenta_id = await crearCuenta(db, cartera_id, { saldo_inicial: '100.00' })
    await crearMovimiento(db, { cuenta_id, monto: '25.00', tipo: 'ingreso' })

    await corregirSaldoInicial(db, usuario_id, cartera_id, cuenta_id, '10.00')

    expect(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id)).toBe('35.00')

    await cerrar()
  })
})
