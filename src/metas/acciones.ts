'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import { aEntero } from '../enteros'
import {
  abandonarMeta,
  completarMeta,
  crearMeta,
  MetaActivaYaExiste,
  MetaNoEstaActiva,
  MetaNoExiste,
  MetaObjetivoNoAlcanzado,
  SobreArchivado,
  SobreNoExiste,
} from '../repos/metas'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import { esquemaAltaMeta } from './validacion'

export interface ResultadoMeta {
  ok: boolean
  error?: string
  aviso?: string
  campos?: Record<string, string>
}

function traducirError(error: unknown): ResultadoMeta {
  if (error instanceof SesionRequerida) {
    return { ok: false, error: 'Debes iniciar sesion para realizar esta operacion.' }
  }
  if (error instanceof SobreNoExiste) {
    return { ok: false, error: error.message }
  }
  if (error instanceof SobreArchivado) {
    return { ok: false, error: error.message }
  }
  if (error instanceof MetaNoExiste) {
    return { ok: false, error: error.message }
  }
  if (error instanceof MetaActivaYaExiste) {
    return { ok: false, error: error.message }
  }
  if (error instanceof MetaNoEstaActiva) {
    return { ok: false, error: error.message }
  }
  if (error instanceof MetaObjetivoNoAlcanzado) {
    return { ok: false, error: error.message }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: 'Ocurrio un error inesperado al procesar la meta.' }
}

export async function accionCrearMeta(
  prevOForm: ResultadoMeta | FormData,
  formOpcional?: FormData,
): Promise<ResultadoMeta> {
  try {
    const formulario = formOpcional ?? (prevOForm as FormData)
    await exigirTokenProteccion()
    const sesion = await exigirSesion()

    const rawData = {
      sobre_id: formulario.get('sobre_id'),
      monto_objetivo: formulario.get('monto_objetivo'),
      fecha_limite: formulario.get('fecha_limite'),
    }

    const parseado = esquemaAltaMeta.safeParse(rawData)
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
    await crearMeta(db, sesion.usuario_id, parseado.data)

    const carteraIdStr = formulario.get('cartera_id')
    const carteraId = aEntero(carteraIdStr ? String(carteraIdStr) : null)
    if (carteraId) {
      revalidatePath('/panel')
    }

    return { ok: true, aviso: 'Meta de ahorro fijada con exito.' }
  } catch (error) {
    return traducirError(error)
  }
}

export async function accionCompletarMeta(
  prevOForm: ResultadoMeta | FormData,
  formOpcional?: FormData,
): Promise<ResultadoMeta> {
  try {
    const formulario = formOpcional ?? (prevOForm as FormData)
    await exigirTokenProteccion()
    const sesion = await exigirSesion()

    const id = aEntero(formulario.get('id')?.toString() ?? null)
    if (!id) return { ok: false, error: 'Identificador de meta invalido.' }

    const periodo = formulario.get('periodo')?.toString() || undefined
    const carteraIdStr = formulario.get('cartera_id')
    const carteraId = aEntero(carteraIdStr ? String(carteraIdStr) : null)

    const db = obtenerCliente()
    await completarMeta(db, sesion.usuario_id, id, periodo)

    if (carteraId) {
      revalidatePath('/panel')
    }

    return { ok: true, aviso: '¡Felicidades! Meta completada con exito.' }
  } catch (error) {
    return traducirError(error)
  }
}

export async function accionAbandonarMeta(
  prevOForm: ResultadoMeta | FormData,
  formOpcional?: FormData,
): Promise<ResultadoMeta> {
  try {
    const formulario = formOpcional ?? (prevOForm as FormData)
    await exigirTokenProteccion()
    const sesion = await exigirSesion()

    const id = aEntero(formulario.get('id')?.toString() ?? null)
    if (!id) return { ok: false, error: 'Identificador de meta invalido.' }

    const carteraIdStr = formulario.get('cartera_id')
    const carteraId = aEntero(carteraIdStr ? String(carteraIdStr) : null)

    const db = obtenerCliente()
    await abandonarMeta(db, sesion.usuario_id, id)

    if (carteraId) {
      revalidatePath('/panel')
    }

    return { ok: true, aviso: 'Meta abandonada.' }
  } catch (error) {
    return traducirError(error)
  }
}
