import 'server-only'

/**
 * Servicio de autenticacion.
 *
 * Aqui vive la logica de `autenticacion` como funciones que reciben el cliente
 * Drizzle. No importan cookies ni usan `next/headers`, y por eso se prueban
 * enteras contra PGlite. Las Server Actions son adaptadores finos sobre este
 * archivo: leen cookies, llaman aca, y escriben cookies.
 */

import type { Base } from '../db/tipos'
import type { Usuario } from '../db/schema'
import { crearCartera } from '../repos/carteras'
import {
  buscarSesionConUsuario,
  crearSesion as crearFilaSesion,
  eliminarSesionesDeUsuario,
  eliminarSesion,
  type SesionVigente,
} from '../repos/sesiones'
import {
  CredencialesInvalidas,
  CuentaBloqueada,
  DatosDuplicados,
  UsuarioInactivo,
  actualizarContrasena,
  buscarPorId,
  buscarPorNombreUsuario,
  crearUsuario as crearFilaUsuario,
  registrarIntentoFallido,
  reiniciarIntentos,
} from '../repos/usuarios'
import { hashearContrasena, verificarContrasena } from './argon'
import { SEGUNDOS_VALIDEZ } from './cookies'
import { generarToken } from './tokens'
import {
  ErroresDeValidacion,
  MINIMO_CONTRASENA,
  esquemaCambioContrasena,
  esquemaInicioSesion,
  esquemaRegistro,
  validar,
  type EntradaCambioContrasena,
  type EntradaInicioSesion,
  type EntradaRegistro,
} from './validacion'

/** 5 intentos y 60 segundos, segun el spec. */
export const INTENTOS_MAXIMOS = 5
export const SEGUNDOS_BLOQUEO = 60

/** Tokens de una sesion recien creada, en claro. Se entregan al cliente una vez. */
export interface TokensDeSesion {
  token: string
  token_proteccion: string
  expira_en: Date
}

function nuevaSesion(): TokensDeSesion {
  return {
    token: generarToken(),
    token_proteccion: generarToken(),
    expira_en: new Date(Date.now() + SEGUNDOS_VALIDEZ * 1000),
  }
}

/**
 * Hash con el que se verifica cuando el usuario no existe.
 *
 * Sin esto, un nombre de usuario inexistente responderia al instante y uno
 * existente tardaria lo que tarda Argon2id. Esa diferencia de tiempo es suficiente
 * para enumerar las cuentas que hay, y el mensaje de error unico no alcanza si el
 * tiempo delata lo que el texto esconde. Verificar siempre contra ALGO cuesta lo
 * mismo y no dice nada.
 *
 * Se calcula una vez y se recuerda, no en cada intento: hashear es de lo mas caro
 * que hace este archivo.
 */
let hashEntero: Promise<string> | undefined

function hashEnteroParaVerificar(): Promise<string> {
  hashEntero ??= hashearContrasena('contrasena-que-no-corresponde-a-nadie')
  return hashEntero
}

/** Segundos que faltan para que expire el bloqueo. 0 si no esta bloqueado. */
export function segundosDeBloqueoRestantes(usuario: Usuario): number {
  if (!usuario.bloqueado_hasta) return 0
  const diferencia = usuario.bloqueado_hasta.getTime() - Date.now()
  return diferencia > 0 ? Math.max(1, Math.ceil(diferencia / 1000)) : 0
}

export interface ResultadoRegistro {
  usuario_id: number
  cartera_id: number
  sesion: TokensDeSesion
}

/**
 * Registra un usuario, le crea su cartera inicial y lo deja con sesion iniciada.
 *
 * Usuario, cartera y sesion se crean en UNA transaccion. Por separado existe la
 * posibilidad de un usuario sin cartera, que es un usuario que no puede hacer
 * nada y no puede explicar por que.
 *
 * El nombre de la cartera inicial es el nombre del usuario: es lo que espera ver
 * al abrir la app por primera vez.
 */
export async function registrarUsuario(db: Base, entrada: unknown): Promise<ResultadoRegistro> {
  const datos: EntradaRegistro = validar(esquemaRegistro, entrada)

  // El hash se calcula FUERA de la transaccion. Argon2id cuesta ~50ms y mantener
  // abierta una transaccion durante ese tiempo bloquea la fila del indice unico
  // para todos los demás registros que lleguen en paralelo.
  const hash_contrasena = await hashearContrasena(datos.contrasena)
  const tokens = nuevaSesion()

  return db.transaction(async (tx) => {
    // `crearFilaUsuario` traduce la violacion del indice unico a `DatosDuplicados`.
    // Si el nombre de usuario choca, la transaccion se revierte entera y no queda
    // ni la cartera ni la sesion: no hay cuentas a medio crear.
    const usuario = await crearFilaUsuario(tx, {
      nombre: datos.nombre,
      apellido: datos.apellido,
      nombre_usuario: datos.nombre_usuario,
      correo: datos.correo,
      hash_contrasena,
      zona_horaria: 'America/Mexico_City',
    })

    const cartera = await crearCartera(tx, usuario.id, {
      nombre: datos.nombre,
      moneda: 'MXN',
      orden: 0,
    })

    await crearFilaSesion(tx, {
      usuario_id: usuario.id,
      token: tokens.token,
      token_proteccion: tokens.token_proteccion,
      expira_en: tokens.expira_en,
    })

    return { usuario_id: usuario.id, cartera_id: cartera.id, sesion: tokens }
  })
}

/**
 * Inicia sesion, o falla con un error de dominio.
 *
 * El orden importa:
 *
 * 1. Se busca al usuario por nombre de usuario, insensible a mayusculas.
 * 2. Se comprueba el bloqueo ANTES de verificar la contrasena, para que la
 *    respuesta no dependa de si la credencial era correcta.
 * 3. Se verifica la contrasena, siempre — tambien cuando el usuario no existe,
 *    contra un hash entero. Con exito, sesion nueva y contador a cero. Sin
 *    exito, se suma un intento y se bloquea al quinto.
 *
 * El error de credenciales es UNO para usuario inexistente y para contrasena
 * incorrecta. Distinguirlos convertiria la pantalla en un oraculo de que cuentas
 * existen.
 */
export async function iniciarSesion(
  db: Base,
  entrada: unknown,
): Promise<{ usuario_id: number; sesion: TokensDeSesion }> {
  const datos: EntradaInicioSesion = validar(esquemaInicioSesion, entrada)

  const usuario = await buscarPorNombreUsuario(db, datos.nombre_usuario)

  const restantes = usuario ? segundosDeBloqueoRestantes(usuario) : 0
  if (restantes > 0) throw new CuentaBloqueada(restantes)

  if (usuario && !usuario.activo) throw new UsuarioInactivo()

  const hash_a_verificar = usuario?.hash_contrasena ?? (await hashEnteroParaVerificar())
  const correcta = await verificarContrasena(datos.contrasena, hash_a_verificar)

  if (!usuario || !correcta) {
    // El bloqueo es por cuenta, asi que un nombre de usuario inexistente no
    // puede acumular intentos: no hay fila donde contarlos. Lo que evita la
    // enumeracion es el error unico y el tiempo de respuesta igual, no el
    // contador.
    if (usuario) await registrarIntentoFallido(db, usuario.id, INTENTOS_MAXIMOS, SEGUNDOS_BLOQUEO)
    throw new CredencialesInvalidas()
  }

  // Un exito reinicia el contador. Sin esto, un usuario que falla cinco veces y
  // despues acierta quedaria con el contador intacto y un bloqueo pendiente.
  await reiniciarIntentos(db, usuario.id)

  const tokens = nuevaSesion()
  await crearFilaSesion(db, {
    usuario_id: usuario.id,
    token: tokens.token,
    token_proteccion: tokens.token_proteccion,
    expira_en: tokens.expira_en,
  })

  return { usuario_id: usuario.id, sesion: tokens }
}

/**
 * Cierra la sesion de un usuario: elimina la fila.
 *
 * Devuelve `false` si no habia sesion que cerrar, para que cerrar dos veces no sea
 * un error: el cierre de sesion debe ser idempotente.
 */
export async function cerrarSesion(db: Base, usuario_id: number, token: string): Promise<boolean> {
  return eliminarSesion(db, usuario_id, token)
}

/**
 * Cambia la contrasena de un usuario autenticado.
 *
 * Exige la actual correcta —sin ella, quien encuentre una pestana abierta cambia
 * la contrasena del dueno— y el minimo de 6 en la nueva.
 *
 * Tras el cambio se cierran TODAS las sesiones del usuario, incluida la actual,
 * y se crea una nueva. Si alguien robo una sesion, cambiar la contrasena la deja
 * sin nada; y la cookie vigente deja de valer, para que nadie la reutilice.
 */
export async function cambiarContrasena(
  db: Base,
  usuario_id: number,
  entrada: unknown,
): Promise<{ sesion: TokensDeSesion; sesiones_cerradas: number }> {
  const datos: EntradaCambioContrasena = validar(esquemaCambioContrasena, entrada)

  if (datos.contrasena_nueva.length < MINIMO_CONTRASENA) {
    throw new ErroresDeValidacion({
      contrasena_nueva: `La contrasena necesita al menos ${MINIMO_CONTRASENA} caracteres.`,
    })
  }

  if (datos.contrasena_nueva !== datos.confirmacion) {
    throw new ErroresDeValidacion({ confirmacion: 'Las contrasenas no coinciden.' })
  }

  const usuario = await buscarPorId(db, usuario_id)
  if (!usuario) throw new CredencialesInvalidas()

  if (!(await verificarContrasena(datos.contrasena_actual, usuario.hash_contrasena))) {
    throw new CredencialesInvalidas()
  }

  await actualizarContrasena(db, usuario_id, await hashearContrasena(datos.contrasena_nueva))

  const sesiones_cerradas = await eliminarSesionesDeUsuario(db, usuario_id)

  const tokens = nuevaSesion()
  await crearFilaSesion(db, {
    usuario_id,
    token: tokens.token,
    token_proteccion: tokens.token_proteccion,
    expira_en: tokens.expira_en,
  })

  return { sesion: tokens, sesiones_cerradas }
}

/** Resuelve la sesion vigente de un token, o `undefined` si no hay. */
export function sesionDe(db: Base, token: string): Promise<SesionVigente | undefined> {
  return buscarSesionConUsuario(db, token)
}

export { CredencialesInvalidas, CuentaBloqueada, DatosDuplicados, UsuarioInactivo }
