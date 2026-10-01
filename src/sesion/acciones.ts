'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import {
  CredencialesInvalidas,
  CuentaBloqueada,
  DatosDuplicados,
  UsuarioInactivo,
  actualizarPerfil,
  cambiarContrasena,
  cerrarSesion,
  iniciarSesion,
  registrarUsuario,
} from './servicio'
import { exigirTokenDeFormulario, exigirTokenProteccion } from './proteccion'
import {
  SesionRequerida,
  TokenRequerido,
  borrarCookiesDeSesion,
  exigirSesion,
  escribirCookiesDeSesion,
  tokenDeSesion,
} from './server'
import { ErroresDeValidacion } from './validacion'

/**
 * Datos que llegan del formulario de perfil.
 *
 * `nombre_usuario` y `zona_horaria` se leen del `FormData` a proposito: el
 * formulario los reenvia para poder mostrarlos, y el servicio los ignora. Que un
 * campo se mande no significa que se pueda escribir.
 */
function aObjetoPerfil(datos: FormData): Record<string, unknown> {
  return {
    nombre: String(datos.get('nombre') ?? ''),
    apellido: String(datos.get('apellido') ?? ''),
    correo: String(datos.get('correo') ?? ''),
  }
}

/**
 * Server Actions de `autenticacion`.
 *
 * La directiva `'use server'` del primer renglon es lo que convierte este archivo
 * en una frontera de servidor: sin ella, importar estas funciones desde un
 * componente cliente las arrastra al bundle del navegador, y con ellas todo
 * `argon`, `pg` y `next/headers`. La construccion falla en vez de fallar en
 * silencio.
 *
 * Como adaptadores finos: traducen `FormData` a objetos, llaman al servicio, y
 * traducen errores de dominio a algo que la vista pueda pintar. No hay logica de
 * negocio aqui —esta en `servicio.ts`, y por eso se prueban enteras sin React.
 */

/** Como la vista recibe un resultado de una accion. */
export interface ResultadoAccion {
  ok: boolean
  /** Error general, para pintar arriba del formulario. */
  error?: string
  /** Errores por campo, para pintar junto a cada input. */
  campos?: Record<string, string>
  /** Aviso de exito, para confirmar sin cambiar de pantalla. */
  aviso?: string
}

/**
 * Traduce cualquier error del servicio a un resultado pintable.
 *
 * Vive en una sola funcion para que la accion no tenga que decidir, cada vez,
 * si un error es un campo o un aviso general. Un error que no se reconoce
 * devuelve un mensaje generico en vez de propagarse: mostrar el texto crudo de
 * una excepcion en pantalla es filtrar informacion del servidor.
 */
function aResultado(error: unknown): ResultadoAccion {
  if (error instanceof ErroresDeValidacion) {
    return { ok: false, error: error.message, campos: error.campos }
  }
  if (error instanceof DatosDuplicados) {
    return { ok: false, error: error.message, campos: { [error.campo]: error.message } }
  }
  if (error instanceof CuentaBloqueada) {
    return { ok: false, error: error.message }
  }
  if (error instanceof CredencialesInvalidas) {
    return { ok: false, error: error.message }
  }
  if (error instanceof UsuarioInactivo) {
    return { ok: false, error: error.message }
  }
  if (error instanceof TokenRequerido) {
    return { ok: false, error: error.message }
  }
  if (error instanceof SesionRequerida) {
    return { ok: false, error: error.message }
  }

  // Cualquier otra cosa es un fallo del servidor. Se registra en la salida del
  // servidor y se muestra algo que no revela la causa.
  console.error('[autenticacion] fallo no controlado:', error)
  return { ok: false, error: 'Ocurrio un problema. Intenta de nuevo.' }
}

function aObjeto(datos: FormData): Record<string, unknown> {
  return {
    nombre: String(datos.get('nombre') ?? ''),
    apellido: String(datos.get('apellido') ?? ''),
    nombre_usuario: String(datos.get('nombre_usuario') ?? ''),
    correo: String(datos.get('correo') ?? ''),
    contrasena: String(datos.get('contrasena') ?? ''),
  }
}

/**
 * Registra un usuario y lo deja con sesion iniciada.
 *
 * `redirect` no se puede capturar con un `try/catch` —Next lo lanza como error
 * para interrumpir el render—, asi que va FUERA del bloque. Envolviendo el
 * redirect en el try, la accion se tragaria la navegacion y el usuario se
 * quedaria en la pantalla de registro con la cuenta ya creada.
 */
export async function accionRegistrar(
  _estado: ResultadoAccion,
  datos: FormData,
): Promise<ResultadoAccion> {
  const db = obtenerCliente()
  try {
    await exigirTokenDeFormulario()
    const { sesion } = await registrarUsuario(db, aObjeto(datos))
    await escribirCookiesDeSesion(sesion)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/', 'layout')
  redirect('/panel')
}

/** Inicia sesion y lleva al panel. */
export async function accionIniciarSesion(
  _estado: ResultadoAccion,
  datos: FormData,
): Promise<ResultadoAccion> {
  const db = obtenerCliente()
  try {
    await exigirTokenDeFormulario()
    const { sesion } = await iniciarSesion(db, {
      nombre_usuario: String(datos.get('nombre_usuario') ?? ''),
      contrasena: String(datos.get('contrasena') ?? ''),
    })
    await escribirCookiesDeSesion(sesion)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/', 'layout')
  redirect('/panel')
}

/** Cierra sesion y lleva a la pantalla de entrada. */
export async function accionCerrarSesion(): Promise<ResultadoAccion> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const token = (await tokenDeSesion()) ?? ''
    await cerrarSesion(db, sesion.usuario_id, token)
    await borrarCookiesDeSesion()
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/', 'layout')
  redirect('/entrar')
}

/**
 * Cambia la contrasena y renueva la sesion.
 *
 * El servicio ya creo la sesion nueva y cerro las viejas, asi que lo que queda
 * es reescribir las cookies con los tokens nuevos.
 */
export async function accionCambiarContrasena(
  _estado: ResultadoAccion,
  datos: FormData,
): Promise<ResultadoAccion> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { sesion: nueva } = await cambiarContrasena(db, sesion.usuario_id, {
      contrasena_actual: String(datos.get('contrasena_actual') ?? ''),
      contrasena_nueva: String(datos.get('contrasena_nueva') ?? ''),
      confirmacion: String(datos.get('confirmacion') ?? ''),
    })
    await escribirCookiesDeSesion(nueva)
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/', 'layout')
  return { ok: true, aviso: 'Tu contrasena cambio.' }
}

/**
 * Guarda los datos de perfil.
 *
 * A diferencia del resto, esta no redirige: el usuario sigue en la misma pantalla
 * y necesita ver el aviso de exito. Tampoco renueva la sesion, porque no cambio nada
 * que afecte a la autenticacion.
 */
export async function accionActualizarPerfil(
  _estado: ResultadoAccion,
  datos: FormData,
): Promise<ResultadoAccion> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    await actualizarPerfil(db, sesion.usuario_id, aObjetoPerfil(datos))
  } catch (error) {
    return aResultado(error)
  }

  revalidatePath('/', 'layout')
  return { ok: true, aviso: 'Tus datos se guardaron.' }
}
