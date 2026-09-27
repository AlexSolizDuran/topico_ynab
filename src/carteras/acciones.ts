'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import {
  archivarCartera,
  cambiarNombre,
  CarteraAjena,
  CarteraArchivada,
  CarteraConSaldos,
  ArchivadoSinVerificar,
  NombreDeCarteraDuplicado,
  crearCartera,
  obtenerCartera,
  restaurarCartera,
} from '../repos/carteras'
import { MonedaInmutable, exigirMonedaNoCambiada } from './monedas'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import { ErroresDeCartera, validarCartera, validarRenombre } from './validacion'

/**
 * Server Actions de `carteras`.
 *
 * Adaptadores finos: traducen `FormData` a objetos, llaman al repositorio, y
 * traducen errores de dominio a algo que la vista pueda pintar. No hay logica de
 * negocio aqui, y por eso el repositorio se prueba entero sin React.
 *
 * Exigen sesion y el token de proteccion: crear, renombrar y archivar una cartera
 * son operaciones autenticadas, y la CSRF se comprueba igual que en
 * `autenticacion`, con la misma cookie de doble submit.
 */

export interface ResultadoDeCartera {
  ok: boolean
  error?: string
  campos?: Record<string, string>
  aviso?: string
}

function aResultado(error: unknown): ResultadoDeCartera {
  if (error instanceof ErroresDeCartera) {
    return { ok: false, error: error.message, campos: error.campos }
  }
  if (error instanceof NombreDeCarteraDuplicado) {
    return { ok: false, error: error.message, campos: { [error.campo]: error.message } }
  }
  if (
    error instanceof CarteraAjena ||
    error instanceof CarteraArchivada ||
    error instanceof CarteraConSaldos ||
    error instanceof ArchivadoSinVerificar ||
    error instanceof MonedaInmutable ||
    error instanceof SesionRequerida
  ) {
    return { ok: false, error: error.message }
  }

  console.error('[carteras] fallo no controlado:', error)
  return { ok: false, error: 'Ocurrio un problema. Intenta de nuevo.' }
}

export async function accionCrearCartera(
  _estado: ResultadoDeCartera,
  datos: FormData,
): Promise<ResultadoDeCartera> {
  const db = obtenerCliente()
  let nombre = ''
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarCartera({
      nombre: String(datos.get('nombre') ?? ''),
      moneda: String(datos.get('moneda') ?? ''),
    })
    nombre = validado.nombre
    await crearCartera(db, sesion.usuario_id, { nombre: validado.nombre, moneda: validado.moneda })
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/carteras')
  return { ok: true, aviso: `La cartera "${nombre}" quedo creada.` }
}

export async function accionRenombrarCartera(
  cartera_id: number,
  _estado: ResultadoDeCartera,
  datos: FormData,
): Promise<ResultadoDeCartera> {
  const db = obtenerCliente()
  let nombre = ''
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarRenombre({ nombre: String(datos.get('nombre') ?? '') })
    nombre = validado.nombre

    // El formulario de renombrado no lleva moneda, pero si alguien la manda
    // manipulada, se rechaza en vez de ignorarse en silencio.
    const actual = await obtenerCartera(db, sesion.usuario_id, cartera_id)
    exigirMonedaNoCambiada(actual.moneda, String(datos.get('moneda') ?? '').toUpperCase())

    await cambiarNombre(db, sesion.usuario_id, cartera_id, nombre)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/carteras')
  return { ok: true, aviso: 'El nombre cambio. La moneda y tus datos quedaron intactos.' }
}

export async function accionArchivarCartera(
  cartera_id: number,
  _estado: ResultadoDeCartera,
  _datos: FormData,
): Promise<ResultadoDeCartera> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await archivarCartera(db, sesion.usuario_id, cartera_id)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/carteras')
  return { ok: true, aviso: 'La cartera quedo archivada. Sus datos siguen aqui.' }
}

export async function accionRestaurarCartera(
  cartera_id: number,
  _estado: ResultadoDeCartera,
  _datos: FormData,
): Promise<ResultadoDeCartera> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await restaurarCartera(db, sesion.usuario_id, cartera_id)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/carteras')
  return { ok: true, aviso: 'La cartera volvio a estar activa.' }
}
