import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearSobre,
  crearUsuario,
} from '../helpers/fabricas'
import {
  crearReglaRecurrente,
  alternarEstadoReglaRecurrente,
  materializarRecurrencias,
} from '../../src/repos/recurrencias'
import { saldoDeCuenta } from '../../src/repos/cuentas'
import { listarSobres } from '../../src/repos/sobres'
import { movimientos } from '../../src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { editarMovimiento, eliminarMovimiento } from '../../src/repos/movimientos'

describe('080: motor de materializacion de recurrencias', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Mi Cartera' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Banco', saldo_inicial: '20000.00' })
    const grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Vivienda' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Alquiler' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R2: Regla mensual aplicada (genera el movimiento con fecha y periodo correspondiente)', async () => {
    await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Renta mensual',
      monto: '8000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-09-01',
    })

    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-09-01')
    expect(res.totalGenerados).toBe(1)
    expect(res.periodosAfectados).toEqual(['2026-09'])

    const [mov] = await base.db
      .select()
      .from(movimientos)
      .where(and(eq(movimientos.cuenta_id, cuenta_id), eq(movimientos.fecha, '2026-09-01')))

    expect(mov).toBeDefined()
    expect(mov?.monto).toBe('-8000.00')
    expect(mov?.origen).toBe('recurrente')
    expect(mov?.descripcion).toBe('Renta mensual')
  })

  it('R2: Movimiento generado indistinguible (se trata igual que uno a mano en saldos y disponibles)', async () => {
    await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Pago alquiler',
      monto: '5000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-09-01',
    })

    await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-09-01')

    // Saldo de cuenta debe bajar en 5000: 20000 - 5000 = 15000
    const saldo = await saldoDeCuenta(base.db, usuario_id, cartera_id, cuenta_id)
    expect(saldo).toBe('15000.00')

    // Disponible de sobre debe reflejar el gasto: 0 - 5000 = -5000
    const [sobre] = await listarSobres(base.db, usuario_id, cartera_id, '2026-09')
    expect(sobre?.disponible).toBe('-5000.00')
  })

  it('R2: Importe negativo en una regla (gasto genera negativo, ingreso positivo)', async () => {
    // Regla de gasto
    await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Gasto luz',
      monto: '1200.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-09-01',
    })

    // Regla de ingreso
    await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id: null,
      descripcion: 'Sueldo',
      monto: '30000.00',
      tipo: 'ingreso',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-09-01',
    })

    await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-09-01')

    const rows = await base.db
      .select({ descripcion: movimientos.descripcion, monto: movimientos.monto })
      .from(movimientos)
      .where(and(eq(movimientos.cuenta_id, cuenta_id), eq(movimientos.fecha, '2026-09-01')))

    const gasto = rows.find((r) => r.descripcion === 'Gasto luz')
    const ingreso = rows.find((r) => r.descripcion === 'Sueldo')

    expect(gasto?.monto).toBe('-1200.00')
    expect(ingreso?.monto).toBe('30000.00')
  })

  it('R3: Movimiento ya registrado a mano (omite la generacion y no crea duplicado)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Renta septiembre',
      monto: '8000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-09-01',
    })

    // El usuario ya registro a mano la renta del 1 de septiembre
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id,
      descripcion: 'Renta septiembre',
      monto: '-8000.00',
      fecha: '2026-09-01',
      tipo: 'gasto',
      origen: 'manual',
    })

    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-09-01')
    expect(res.totalGenerados).toBe(0)

    const count = await base.db
      .select()
      .from(movimientos)
      .where(and(eq(movimientos.cuenta_id, cuenta_id), eq(movimientos.fecha, '2026-09-01')))

    expect(count.length).toBe(1)
  })

  it('R3: Generacion normal (cuando no existe movimiento previo se genera normalmente)', async () => {
    await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Internet',
      monto: '600.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 10,
      mes: null,
      fecha_inicio: '2026-09-10',
    })

    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-09-10')
    expect(res.totalGenerados).toBe(1)
  })

  it('R3: Generacion tras eliminar un movimiento (vuelve a generarlo si el anterior fue borrado)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Mantenimiento',
      monto: '400.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 5,
      mes: null,
      fecha_inicio: '2026-09-05',
    })

    // Primera generacion
    await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-09-05')
    const [primerMov] = await base.db
      .select({ id: movimientos.id })
      .from(movimientos)
      .where(eq(movimientos.regla_id, regla.id))

    // Usuario elimina logicamente el movimiento
    await eliminarMovimiento(base.db, usuario_id, primerMov!.id)

    // Se vuelve a correr la materializacion
    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-09-05')
    expect(res.totalGenerados).toBe(1)

    // Ahora hay 2 filas en total, pero solo 1 viva
    const vivos = await base.db
      .select()
      .from(movimientos)
      .where(and(eq(movimientos.regla_id, regla.id), isNull(movimientos.eliminado_en)))

    expect(vivos.length).toBe(1)
  })

  it('R4: Varias ausencias (genera movimientos de tres periodos e informa)', async () => {
    await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Suscripcion',
      monto: '200.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
    })

    // Pasaron 3 meses: enero, febrero, marzo
    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-03-01')
    expect(res.totalGenerados).toBe(3)
    expect(res.periodosAfectados).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('R4: Anterior a la fecha de inicio (no genera movimientos anteriores al inicio)', async () => {
    // La regla comienza el 1 de marzo
    await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Streaming',
      monto: '150.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-03-01',
    })

    // Consultamos hasta el 20 de marzo
    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-03-20')
    expect(res.totalGenerados).toBe(1)
    expect(res.periodosAfectados).toEqual(['2026-03'])

    // No debe haber nada de febrero ni enero
    const anteriores = await base.db
      .select()
      .from(movimientos)
      .where(and(eq(movimientos.cuenta_id, cuenta_id), eq(movimientos.fecha, '2026-02-01')))

    expect(anteriores.length).toBe(0)
  })

  it('R4: Regla desactivada (no genera movimientos para los periodos pendientes)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Club',
      monto: '1000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
    })

    // Desactivamos la regla
    await alternarEstadoReglaRecurrente(base.db, usuario_id, regla.id, false)

    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-04-01')
    expect(res.totalGenerados).toBe(0)
  })

  it('R5: Editar un movimiento generado (se guarda y la regla no lo sobrescribe)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Luz bimestral',
      monto: '1000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
    })

    await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-01-01')

    const [mov] = await base.db
      .select({ id: movimientos.id })
      .from(movimientos)
      .where(eq(movimientos.regla_id, regla.id))

    // El usuario edita el movimiento generado (cambia el monto de 1000 a 1150)
    await editarMovimiento(base.db, usuario_id, mov!.id, {
      cuenta_id,
      sobre_id,
      monto: '-1150.00',
      fecha: '2026-01-01',
      descripcion: 'Luz con recargo',
    })

    // Volvemos a correr la materializacion
    const res = await materializarRecurrencias(base.db, usuario_id, cartera_id, '2026-01-01')
    expect(res.totalGenerados).toBe(0)

    // El movimiento editado conserva su valor editado
    const [editado] = await base.db
      .select({ monto: movimientos.monto, descripcion: movimientos.descripcion })
      .from(movimientos)
      .where(eq(movimientos.id, mov!.id))

    expect(editado?.monto).toBe('-1150.00')
    expect(editado?.descripcion).toBe('Luz con recargo')
  })
})
