'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import { exigirEntero } from '../enteros'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import { CarteraAjena, CarteraArchivada } from '../repos/carteras'
import {
  GrupoDeOtraCartera,
  NombreDeSobreDuplicado,
  OrdenDeSobreInvalido,
  SinGrupo,
  SobreArchivado,
  SobreConMovimientos,
  SobreConSaldo,
  SobreNoExiste,
  archivarSobre,
  cambiarNombreSobre,
  cambiarOrdenSobre,
  crearSobre,
  eliminarSobre,
  moverSobreDeGrupo,
  restaurarSobre,
} from '../repos/sobres'
import {
  AsignacionNoExiste,
  AsignacionNoPositiva,
  DisponibleInsuficiente,
  ImporteInvalido,
  MismoSobre,
  NoHayDesborde,
  TapaDemasiado,
  asignarASobre,
  corregirAsignacion,
  moverEntreSobres,
  taparDesborde,
} from '../repos/asignaciones'
import {
  ErroresDeSobre,
  validarAsignacion,
  validarCambioDeGrupo,
  validarCorreccion,
  validarMover,
  validarNuevoSobre,
  validarOperacion,
  validarOrden,
  validarRenombre,
  validarTapar,
} from './validacion'

/**
 * Server Actions de `sobres`.
 *
 * Adaptadores finos, como los de `cuentas` y `grupos`: traducen `FormData`, llaman al
 * repositorio y traducen errores de dominio a algo pintable. No hay ninguna aritmetica
 * de dinero aca: el repositorio ya devolvio el disponible, y esta capa solo decide que
 * texto mostrar.
 *
 * Todas exigen sesion y el token de proteccion. El `cartera_id` se recibe del servidor —
 *la pagina lo tiene en la URL y la sesion tiene al usuario— y se cruza en el
 * repositorio con el id del sobre: un formulario que mandara el `cartera_id` de otra
 * cartera no encontraria el sobre y responderia que no existe.
 *
 * Los ids del formulario llegan como texto y se convierten con `exigirEntero`, que
 * devuelve `null` en vez de `NaN`. La validacion de forma ya reviso que sean enteros
 * positivos; esta conversion es la que se los pasa a la base.
 */

export interface ResultadoDeSobre {
  ok: boolean
  error?: string
  campos?: Record<string, string>
  aviso?: string
  /** Cuando el error se resuelve archivando en vez de eliminar. */
  ofrece?: 'archivar'
}

const ERRORES_DE_DOMINIO = [
  // Del repositorio de sobres.
  GrupoDeOtraCartera,
  NombreDeSobreDuplicado,
  OrdenDeSobreInvalido,
  SinGrupo,
  SobreArchivado,
  SobreConMovimientos,
  SobreConSaldo,
  SobreNoExiste,
  // De las asignaciones.
  AsignacionNoExiste,
  AsignacionNoPositiva,
  DisponibleInsuficiente,
  ImporteInvalido,
  MismoSobre,
  NoHayDesborde,
  TapaDemasiado,
  // De la cartera y de la sesion.
  CarteraAjena,
  CarteraArchivada,
  SesionRequerida,
]

function aResultado(error: unknown): ResultadoDeSobre {
  if (error instanceof ErroresDeSobre) {
    return { ok: false, error: error.message, campos: error.campos }
  }
  if (ERRORES_DE_DOMINIO.some((tipo) => error instanceof tipo)) {
    const dominio = error as Error
    // R10: un sobre con movimientos no se borra, se archiva. El mensaje lo dice y la
    // UI ofrece el archivado, asi que el error trae consigo la salida.
    return {
      ok: false,
      error: dominio.message,
      ofrece: error instanceof SobreConMovimientos ? 'archivar' : undefined,
    }
  }

  console.error('[sobres] fallo no controlado:', error)
  return { ok: false, error: 'Ocurrio un problema. Intenta de nuevo.' }
}

/** El camino de la pagina de cartera, que es donde vive todo lo de sobres. */
function refrescar(cartera_id: number): void {
  revalidatePath('/panel')
}

export async function accionCrearSobre(
  cartera_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  let nombre = ''
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarNuevoSobre({
      nombre: String(datos.get('nombre') ?? ''),
      grupo_id: String(datos.get('grupo_id') ?? ''),
    })
    nombre = validado.nombre
    await crearSobre(
      db,
      sesion.usuario_id,
      cartera_id,
      validado.grupo_id === '' ? null : exigirEntero(validado.grupo_id, 'grupo_id'),
      validado.nombre,
    )
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: `El sobre "${nombre}" quedo creado con disponible en cero.` }
}

export async function accionRenombrarSobre(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { nombre } = validarRenombre({ nombre: String(datos.get('nombre') ?? '') })
    await cambiarNombreSobre(db, sesion.usuario_id, cartera_id, sobre_id, nombre)
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El nombre cambio. El disponible y el historial quedaron intactos.' }
}

export async function accionReordenarSobre(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { orden } = validarOrden({ orden: String(datos.get('orden') ?? '') })
    await cambiarOrdenSobre(db, sesion.usuario_id, cartera_id, sobre_id, exigirEntero(orden, 'orden'))
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El orden cambio.' }
}

export async function accionMoverSobreDeGrupo(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { grupo_id } = validarCambioDeGrupo({ grupo_id: String(datos.get('grupo_id') ?? '') })
    await moverSobreDeGrupo(
      db,
      sesion.usuario_id,
      cartera_id,
      sobre_id,
      grupo_id === '' ? null : exigirEntero(grupo_id, 'grupo_id'),
    )
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El sobre cambio de grupo.' }
}

export async function accionAsignarASobre(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  let monto = ''
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarAsignacion({
      periodo: String(datos.get('periodo') ?? ''),
      monto: String(datos.get('monto') ?? ''),
    })
    monto = validado.monto
    await asignarASobre(
      db,
      sesion.usuario_id,
      cartera_id,
      sobre_id,
      validado.periodo,
      validado.monto,
    )
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: `Se asignaron ${monto}. El disponible se ajusto solo.` }
}

export async function accionCorregirAsignacion(
  cartera_id: number,
  sobre_id: number,
  asignacion_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { monto } = validarCorreccion({ monto: String(datos.get('monto') ?? '') })
    await corregirAsignacion(db, sesion.usuario_id, cartera_id, asignacion_id, monto)
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'La asignacion quedo corregida y el disponible se ajusto.' }
}

export async function accionTaparDesborde(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarTapar({
      periodo: String(datos.get('periodo') ?? ''),
      monto: String(datos.get('monto') ?? ''),
    })
    await taparDesborde(
      db,
      sesion.usuario_id,
      cartera_id,
      sobre_id,
      validado.periodo,
      validado.monto,
    )
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El desborde quedo tapado y el dinero suelto bajo por el mismo importe.' }
}

export async function accionMoverEntreSobres(
  cartera_id: number,
  origen_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarMover({
      periodo: String(datos.get('periodo') ?? ''),
      monto: String(datos.get('monto') ?? ''),
      destino_id: String(datos.get('destino_id') ?? ''),
    })
    await moverEntreSobres(
      db,
      sesion.usuario_id,
      cartera_id,
      origen_id,
      exigirEntero(validado.destino_id, 'destino_id'),
      validado.periodo,
      validado.monto,
    )
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El dinero paso de un sobre al otro. El patrimonio no cambio.' }
}

export async function accionEliminarSobre(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { periodo } = validarOperacion({ periodo: String(datos.get('periodo') ?? '') })
    await eliminarSobre(db, sesion.usuario_id, cartera_id, sobre_id, periodo)
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El sobre quedo eliminado. No queda registro de el.' }
}

export async function accionArchivarSobre(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { periodo } = validarOperacion({ periodo: String(datos.get('periodo') ?? '') })
    await archivarSobre(db, sesion.usuario_id, cartera_id, sobre_id, periodo)
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El sobre quedo archivado. Su historial sigue disponible.' }
}

export async function accionRestaurarSobre(
  cartera_id: number,
  sobre_id: number,
  _estado: ResultadoDeSobre,
  _datos: FormData,
): Promise<ResultadoDeSobre> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await restaurarSobre(db, sesion.usuario_id, cartera_id, sobre_id)
  } catch (error) {
    return aResultado(error)
  }

  refrescar(cartera_id)
  return { ok: true, aviso: 'El sobre volvio a estar activo.' }
}
