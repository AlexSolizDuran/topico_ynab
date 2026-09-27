'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import { CarteraAjena, CarteraArchivada } from '../repos/carteras'
import {
  GrupoNoExiste,
  NombreDeGrupoEnUso,
  archivarGrupo,
  cambiarNombreGrupo,
  cambiarOrdenGrupo,
  crearGrupo,
  restaurarGrupo,
} from '../repos/grupos'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import { ErroresDeGrupo, validarGrupo, validarOrden } from './validacion'

/**
 * Server Actions de `grupos`.
 *
 * Adaptadores finos, como los de `carteras` y `cuentas`. El `cartera_id` sale de la
 * sesion del servidor y no del formulario, y el repositorio lo cruza con el grupo:
 * un `cartera_id` inventado no encuentra nada.
 */

export interface ResultadoDeGrupo {
  ok: boolean
  error?: string
  campos?: Record<string, string>
  aviso?: string
}

function aResultado(error: unknown): ResultadoDeGrupo {
  if (error instanceof ErroresDeGrupo) {
    return { ok: false, error: error.message, campos: error.campos }
  }
  if (
    error instanceof GrupoNoExiste ||
    error instanceof NombreDeGrupoEnUso ||
    error instanceof CarteraAjena ||
    error instanceof CarteraArchivada ||
    error instanceof SesionRequerida
  ) {
    return { ok: false, error: error.message }
  }

  console.error('[grupos] fallo no controlado:', error)
  return { ok: false, error: 'Ocurrio un problema. Intenta de nuevo.' }
}

export async function accionCrearGrupo(
  cartera_id: number,
  _estado: ResultadoDeGrupo,
  datos: FormData,
): Promise<ResultadoDeGrupo> {
  const db = obtenerCliente()
  let nombre = ''
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarGrupo({ nombre: String(datos.get('nombre') ?? '') })
    nombre = validado.nombre
    await crearGrupo(db, sesion.usuario_id, cartera_id, validado.nombre)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: `El grupo "${nombre}" quedo creado.` }
}

export async function accionRenombrarGrupo(
  cartera_id: number,
  grupo_id: number,
  _estado: ResultadoDeGrupo,
  datos: FormData,
): Promise<ResultadoDeGrupo> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { nombre } = validarGrupo({ nombre: String(datos.get('nombre') ?? '') })
    await cambiarNombreGrupo(db, sesion.usuario_id, cartera_id, grupo_id, nombre)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'El nombre del grupo cambio.' }
}

export async function accionReordenarGrupo(
  cartera_id: number,
  grupo_id: number,
  _estado: ResultadoDeGrupo,
  datos: FormData,
): Promise<ResultadoDeGrupo> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { orden } = validarOrden({ orden: datos.get('orden') })
    await cambiarOrdenGrupo(db, sesion.usuario_id, cartera_id, grupo_id, orden)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'El grupo cambio de lugar. Sus totales no se movieron.' }
}

export async function accionArchivarGrupo(
  cartera_id: number,
  grupo_id: number,
  _estado: ResultadoDeGrupo,
  _datos: FormData,
): Promise<ResultadoDeGrupo> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await archivarGrupo(db, sesion.usuario_id, cartera_id, grupo_id)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  // El aviso dice lo que el requerimiento exige: archivar un grupo no toca sus sobres.
  return { ok: true, aviso: 'El grupo quedo archivado. Sus sobres siguen intactos.' }
}

export async function accionRestaurarGrupo(
  cartera_id: number,
  grupo_id: number,
  _estado: ResultadoDeGrupo,
  _datos: FormData,
): Promise<ResultadoDeGrupo> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await restaurarGrupo(db, sesion.usuario_id, cartera_id, grupo_id)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath(`/cartera/${cartera_id}`)
  return { ok: true, aviso: 'El grupo volvio al agrupamiento.' }
}
