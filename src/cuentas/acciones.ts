'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import {
  CuentaAjena,
  SaldoNoCero,
  TipoConMovimientos,
  archivarCuenta,
  cambiarNombreCuenta,
  cambiarOrdenCuenta,
  cambiarTipoCuenta,
  corregirSaldoInicial,
  crearCuenta,
  restaurarCuenta,
} from '../repos/cuentas'
import { CarteraAjena, CarteraArchivada } from '../repos/carteras'
import { exigirEntero } from '../enteros'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import {
  ErroresDeCuenta,
  validarCuenta,
  validarRenombre,
  validarSaldoInicial,
} from './validacion'
import type { Dinero } from '../dinero'

/**
 * Server Actions de `cuentas`.
 *
 * Adaptadores finos, como los de `autenticacion` y `carteras`: traducen `FormData`,
 * llaman al repositorio y traducen errores de dominio a algo pintable.
 *
 * Todas exigen sesion y el token de proteccion, y todas toman el `cartera_id` de la
 * sesion del usuario, no del formulario, salvo el identificador de la cuenta. Ese
 * `cartera_id` es el que despues se cruza con la cuenta en el repositorio: si el
 * formulario mandara el de otra cartera, `obtenerCuenta` no lo encontraria.
 */

export interface ResultadoDeCuenta {
  ok: boolean
  error?: string
  campos?: Record<string, string>
  aviso?: string
}

function aResultado(error: unknown): ResultadoDeCuenta {
  if (error instanceof ErroresDeCuenta) {
    return { ok: false, error: error.message, campos: error.campos }
  }
  if (
    error instanceof CuentaAjena ||
    error instanceof CarteraAjena ||
    error instanceof CarteraArchivada ||
    error instanceof SaldoNoCero ||
    error instanceof TipoConMovimientos ||
    error instanceof SesionRequerida
  ) {
    return { ok: false, error: error.message }
  }

  console.error('[cuentas] fallo no controlado:', error)
  return { ok: false, error: 'Ocurrio un problema. Intenta de nuevo.' }
}

export async function accionCrearCuenta(
  cartera_id: number,
  _estado: ResultadoDeCuenta,
  datos: FormData,
): Promise<ResultadoDeCuenta> {
  const db = obtenerCliente()
  let nombre = ''
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarCuenta({
      nombre: String(datos.get('nombre') ?? ''),
      tipo: String(datos.get('tipo') ?? ''),
      saldo_inicial: String(datos.get('saldo_inicial') ?? ''),
    })
    nombre = validado.nombre
    await crearCuenta(db, sesion.usuario_id, cartera_id, validado)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: `La cuenta "${nombre}" quedo creada.` }
}

export async function accionRenombrarCuenta(
  cartera_id: number,
  cuenta_id: number,
  _estado: ResultadoDeCuenta,
  datos: FormData,
): Promise<ResultadoDeCuenta> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { nombre } = validarRenombre({ nombre: String(datos.get('nombre') ?? '') })
    await cambiarNombreCuenta(db, sesion.usuario_id, cartera_id, cuenta_id, nombre)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'El nombre cambio. El saldo y el historial quedaron intactos.' }
}

export async function accionReordenarCuenta(
  cartera_id: number,
  cuenta_id: number,
  _estado: ResultadoDeCuenta,
  datos: FormData,
): Promise<ResultadoDeCuenta> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const orden = exigirEntero(String(datos.get('orden') ?? ''), 'orden')
    if (orden < 0) {
      throw new ErroresDeCuenta({ orden: 'El orden tiene que ser cero o un entero positivo.' })
    }
    await cambiarOrdenCuenta(db, sesion.usuario_id, cartera_id, cuenta_id, orden)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'El orden cambio.' }
}

export async function accionCambiarTipoCuenta(
  cartera_id: number,
  cuenta_id: number,
  _estado: ResultadoDeCuenta,
  datos: FormData,
): Promise<ResultadoDeCuenta> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const tipo = String(datos.get('tipo') ?? '')
    await cambiarTipoCuenta(
      db,
      sesion.usuario_id,
      cartera_id,
      cuenta_id,
      tipo as 'corriente' | 'ahorro' | 'efectivo' | 'credito',
    )
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'El tipo cambio.' }
}

export async function accionCorregirSaldoInicial(
  cartera_id: number,
  cuenta_id: number,
  _estado: ResultadoDeCuenta,
  datos: FormData,
): Promise<ResultadoDeCuenta> {
  const db = obtenerCliente()
  let corregido: Dinero = '0.00'
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarSaldoInicial({ saldo_inicial: String(datos.get('saldo_inicial') ?? '') })
    corregido = validado.saldo_inicial
    await corregirSaldoInicial(db, sesion.usuario_id, cartera_id, cuenta_id, validado.saldo_inicial)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'El saldo inicial quedo corregido y el saldo se recalculo.' }
}

export async function accionArchivarCuenta(
  cartera_id: number,
  cuenta_id: number,
  _estado: ResultadoDeCuenta,
  _datos: FormData,
): Promise<ResultadoDeCuenta> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await archivarCuenta(db, sesion.usuario_id, cartera_id, cuenta_id)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'La cuenta quedo archivada. Su historial sigue aqui.' }
}

export async function accionRestaurarCuenta(
  cartera_id: number,
  cuenta_id: number,
  _estado: ResultadoDeCuenta,
  _datos: FormData,
): Promise<ResultadoDeCuenta> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await restaurarCuenta(db, sesion.usuario_id, cartera_id, cuenta_id)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'La cuenta volvio a estar activa.' }
}
