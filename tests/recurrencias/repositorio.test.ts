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
  CuentaYSobreDeDistintaCartera,
  ReglaAnualSinMes,
  alternarEstadoReglaRecurrente,
  crearReglaRecurrente,
  editarReglaRecurrente,
  eliminarReglaRecurrente,
  listarReglasRecurrentes,
  obtenerReglaRecurrente,
} from '../../src/repos/recurrencias'
import { movimientos } from '../../src/db/schema'
import { eq } from 'drizzle-orm'

describe('080: repositorio de reglas recurrentes', () => {
  let base: BaseDePruebas
  let usuario_id: number
  let cartera_id: number
  let cuenta_id: number
  let sobre_id: number

  beforeEach(async () => {
    base = await crearBaseDePruebas()
    usuario_id = await crearUsuario(base.db)
    cartera_id = await crearCartera(base.db, usuario_id, { nombre: 'Principal' })
    cuenta_id = await crearCuenta(base.db, cartera_id, { nombre: 'Corriente', saldo_inicial: '10000.00' })
    const grupo_id = await crearGrupo(base.db, cartera_id, { nombre: 'Gastos fijos' })
    sobre_id = await crearSobre(base.db, cartera_id, grupo_id, { nombre: 'Renta' })
  })

  afterEach(async () => {
    await base.cerrar()
  })

  it('R1: Crear una regla mensual (renta por 8,000 con frecuencia mensual el dia 1)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Renta',
      monto: '8000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
      comercio: 'Inmobiliaria',
    })

    expect(regla.id).toBeDefined()
    expect(regla.activa).toBe(true)
    expect(regla.descripcion).toBe('Renta')
    expect(regla.monto).toBe('8000.00')
    expect(regla.dia).toBe(1)
    expect(regla.fecha_inicio).toBe('2026-01-01')
  })

  it('R1: Regla sin sobre (se acepta y queda sobre_id null)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id: null,
      descripcion: 'Gasto varios',
      monto: '500.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 15,
      mes: null,
      fecha_inicio: '2026-01-15',
    })

    expect(regla.id).toBeDefined()
    expect(regla.sobre_id).toBeNull()
  })

  it('R1: Regla anual sin mes (se rechaza con error)', async () => {
    await expect(
      crearReglaRecurrente(base.db, usuario_id, {
        cartera_id,
        cuenta_id,
        sobre_id,
        descripcion: 'Seguro auto',
        monto: '20000.00',
        tipo: 'gasto',
        frecuencia: 'anual',
        dia: 10,
        mes: null,
        fecha_inicio: '2026-01-10',
      }),
    ).rejects.toThrow(ReglaAnualSinMes)
  })

  it('R1: Regla con cuenta y sobre de carteras distintas (se rechaza)', async () => {
    const cartera2 = await crearCartera(base.db, usuario_id, { nombre: 'Segunda cartera' })
    const cuenta2 = await crearCuenta(base.db, cartera2, { nombre: 'Banco 2', saldo_inicial: '5000.00' })

    // cuenta2 es de cartera2, pero sobre_id es de cartera_id
    await expect(
      crearReglaRecurrente(base.db, usuario_id, {
        cartera_id: cartera2,
        cuenta_id: cuenta2,
        sobre_id,
        descripcion: 'Cruzado',
        monto: '100.00',
        tipo: 'gasto',
        frecuencia: 'mensual',
        dia: 5,
        mes: null,
        fecha_inicio: '2026-01-05',
      }),
    ).rejects.toThrow(CuentaYSobreDeDistintaCartera)
  })

  it('R5: Editar el importe de una regla (los movimientos ya registrados conservan su importe)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Renta',
      monto: '8000.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
    })

    // Simulamos un movimiento ya generado por esa regla
    const movId = await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id,
      monto: '-8000.00',
      fecha: '2026-01-01',
      descripcion: 'Renta',
      tipo: 'gasto',
      origen: 'recurrente',
    })

    // Actualizamos el importe de la regla a 8500
    const editada = await editarReglaRecurrente(base.db, usuario_id, {
      id: regla.id,
      cuenta_id,
      sobre_id,
      descripcion: 'Renta',
      monto: '8500.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
    })

    expect(editada.monto).toBe('8500.00')

    // Verificamos que el movimiento previo sigue en -8000.00
    const [movPrevio] = await base.db
      .select({ monto: movimientos.monto })
      .from(movimientos)
      .where(eq(movimientos.id, movId))

    expect(movPrevio?.monto).toBe('-8000.00')
  })

  it('R5: Desactivar una regla (deja de estar activa)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Gimnasio',
      monto: '1500.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
    })

    const desactivada = await alternarEstadoReglaRecurrente(base.db, usuario_id, regla.id, false)
    expect(desactivada.activa).toBe(false)
  })

  it('R5: Eliminar una regla (baja logica, conserva movimientos generados)', async () => {
    const regla = await crearReglaRecurrente(base.db, usuario_id, {
      cartera_id,
      cuenta_id,
      sobre_id,
      descripcion: 'Netflix',
      monto: '300.00',
      tipo: 'gasto',
      frecuencia: 'mensual',
      dia: 1,
      mes: null,
      fecha_inicio: '2026-01-01',
    })

    const movId = await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id,
      monto: '-300.00',
      fecha: '2026-01-01',
      descripcion: 'Netflix',
      tipo: 'gasto',
      origen: 'recurrente',
    })

    await eliminarReglaRecurrente(base.db, usuario_id, regla.id)

    // La lista activa ya no la muestra
    const lista = await listarReglasRecurrentes(base.db, usuario_id, cartera_id)
    expect(lista.find((r) => r.id === regla.id)).toBeUndefined()

    // El movimiento generado sigue existiendo
    const [mov] = await base.db
      .select({ id: movimientos.id, monto: movimientos.monto })
      .from(movimientos)
      .where(eq(movimientos.id, movId))

    expect(mov?.monto).toBe('-300.00')
  })
})
