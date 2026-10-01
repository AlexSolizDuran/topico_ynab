'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import { aEntero } from '../enteros'
import {
  CarteraAjena,
  CuentaAjena,
  CuentaYSobreDeDistintaCartera,
  ReglaAnualSinMes,
  ReglaNoExiste,
  alternarEstadoReglaRecurrente,
  crearReglaRecurrente,
  editarReglaRecurrente,
  eliminarReglaRecurrente,
  materializarRecurrencias,
} from '../repos/recurrencias'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import {
  esquemaAltaRegla,
  esquemaEdicionRegla,
} from './validacion'

export interface ResultadoRecurrencia {
  ok: boolean
  error?: string
  aviso?: string
  campos?: Record<string, string>
  generados?: number
  periodos?: string[]
}

function hoyEnFecha(): string {
  const ahora = new Date()
  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function traducirError(error: unknown): ResultadoRecurrencia {
  if (error instanceof SesionRequerida) {
    return { ok: false, error: 'Debes iniciar sesion para realizar esta operacion.' }
  }
  if (error instanceof CuentaYSobreDeDistintaCartera) {
    return { ok: false, error: error.message }
  }
  if (error instanceof CuentaAjena) {
    return { ok: false, error: error.message }
  }
  if (error instanceof CarteraAjena) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ReglaAnualSinMes) {
    return { ok: false, error: error.message }
  }
  if (error instanceof ReglaNoExiste) {
    return { ok: false, error: error.message }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: 'Ocurrio un error inesperado al procesar la regla.' }
}

export async function accionCrearReglaRecurrente(
  prevOForm: ResultadoRecurrencia | FormData,
  formOpcional?: FormData,
): Promise<ResultadoRecurrencia> {
  try {
    const formulario = formOpcional ?? (prevOForm as FormData)
    await exigirTokenProteccion()
    const sesion = await exigirSesion()

    const rawData = {
      cartera_id: formulario.get('cartera_id'),
      cuenta_id: formulario.get('cuenta_id'),
      sobre_id: formulario.get('sobre_id'),
      descripcion: formulario.get('descripcion'),
      monto: formulario.get('monto'),
      tipo: formulario.get('tipo') || 'gasto',
      frecuencia: formulario.get('frecuencia'),
      dia: formulario.get('dia'),
      mes: formulario.get('mes') || null,
      fecha_inicio: formulario.get('fecha_inicio'),
      comercio: formulario.get('comercio'),
    }

    const parseado = esquemaAltaRegla.safeParse(rawData)
    if (!parseado.success) {
      const campos: Record<string, string> = {}
      for (const issue of parseado.error.issues) {
        const campo = issue.path[0]
        if (campo) campos[String(campo)] = issue.message
      }
      return {
        ok: false,
        error: parseado.error.issues[0]?.message ?? 'Datos invalidos.',
        campos,
      }
    }

    const db = obtenerCliente()
    await crearReglaRecurrente(db, sesion.usuario_id, parseado.data)

    revalidatePath('/panel')
    return { ok: true, aviso: 'Regla recurrente creada con exito.' }
  } catch (error) {
    return traducirError(error)
  }
}

export async function accionEditarReglaRecurrente(
  prevOForm: ResultadoRecurrencia | FormData,
  formOpcional?: FormData,
): Promise<ResultadoRecurrencia> {
  try {
    const formulario = formOpcional ?? (prevOForm as FormData)
    await exigirTokenProteccion()
    const sesion = await exigirSesion()

    const carteraIdStr = formulario.get('cartera_id')
    const carteraId = aEntero(carteraIdStr ? String(carteraIdStr) : null)

    const rawData = {
      id: formulario.get('id'),
      cuenta_id: formulario.get('cuenta_id'),
      sobre_id: formulario.get('sobre_id'),
      descripcion: formulario.get('descripcion'),
      monto: formulario.get('monto'),
      tipo: formulario.get('tipo'),
      frecuencia: formulario.get('frecuencia'),
      dia: formulario.get('dia'),
      mes: formulario.get('mes') || null,
      fecha_inicio: formulario.get('fecha_inicio'),
      activa: formulario.has('activa') ? formulario.get('activa') === 'true' : undefined,
      comercio: formulario.get('comercio'),
    }

    const parseado = esquemaEdicionRegla.safeParse(rawData)
    if (!parseado.success) {
      const campos: Record<string, string> = {}
      for (const issue of parseado.error.issues) {
        const campo = issue.path[0]
        if (campo) campos[String(campo)] = issue.message
      }
      return {
        ok: false,
        error: parseado.error.issues[0]?.message ?? 'Datos invalidos.',
        campos,
      }
    }

    const db = obtenerCliente()
    await editarReglaRecurrente(db, sesion.usuario_id, parseado.data)

    if (carteraId) {
      revalidatePath('/panel')
    }
    return { ok: true, aviso: 'Regla recurrente actualizada con exito.' }
  } catch (error) {
    return traducirError(error)
  }
}

export async function accionAlternarReglaRecurrente(
  prevOForm: ResultadoRecurrencia | FormData,
  formOpcional?: FormData,
): Promise<ResultadoRecurrencia> {
  try {
    const formulario = formOpcional ?? (prevOForm as FormData)
    await exigirTokenProteccion()
    const sesion = await exigirSesion()

    const id = aEntero(formulario.get('id')?.toString() ?? null)
    if (!id) return { ok: false, error: 'Identificador invalido.' }

    const activa = formulario.get('activa') === 'true'
    const carteraId = aEntero(formulario.get('cartera_id')?.toString() ?? null)

    const db = obtenerCliente()
    await alternarEstadoReglaRecurrente(db, sesion.usuario_id, id, activa)

    if (carteraId) {
      revalidatePath('/panel')
    }
    return {
      ok: true,
      aviso: activa ? 'Regla activada.' : 'Regla desactivada.',
    }
  } catch (error) {
    return traducirError(error)
  }
}

export async function accionEliminarReglaRecurrente(
  prevOForm: ResultadoRecurrencia | FormData,
  formOpcional?: FormData,
): Promise<ResultadoRecurrencia> {
  try {
    const formulario = formOpcional ?? (prevOForm as FormData)
    await exigirTokenProteccion()
    const sesion = await exigirSesion()

    const id = aEntero(formulario.get('id')?.toString() ?? null)
    if (!id) return { ok: false, error: 'Identificador invalido.' }

    const carteraId = aEntero(formulario.get('cartera_id')?.toString() ?? null)

    const db = obtenerCliente()
    await eliminarReglaRecurrente(db, sesion.usuario_id, id)

    if (carteraId) {
      revalidatePath('/panel')
    }
    return { ok: true, aviso: 'Regla recurrente eliminada.' }
  } catch (error) {
    return traducirError(error)
  }
}

export async function accionMaterializarRecurrencias(
  cartera_id: number,
  fecha_hasta?: string,
): Promise<ResultadoRecurrencia> {
  try {
    const sesion = await exigirSesion()
    const db = obtenerCliente()

    const hasta = fecha_hasta ?? hoyEnFecha()
    const resultado = await materializarRecurrencias(db, sesion.usuario_id, cartera_id, hasta)

    if (resultado.totalGenerados > 0) {
      revalidatePath('/panel')
      return {
        ok: true,
        generados: resultado.totalGenerados,
        periodos: resultado.periodosAfectados,
        aviso: `Se generaron automaticamente ${resultado.totalGenerados} movimientos pendientes en ${resultado.periodosAfectados.length} periodo(s).`,
      }
    }

    return { ok: true, generados: 0, periodos: [] }
  } catch (error) {
    return traducirError(error)
  }
}
