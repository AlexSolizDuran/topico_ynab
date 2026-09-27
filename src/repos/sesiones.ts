import { and, eq, gt, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { sesiones, usuarios } from '../db/schema'
import type { NuevaSesion, Sesion } from '../db/schema'
import { hashearToken } from '../sesion/tokens'

/**
 * `sesiones` — el estado de sesion.
 *
 * Todas las lecturas por token van acompanadas de `expira_en > now()`, y
 * todas exigen `usuario_id`. Una sesion encontrada pero vencida no es una sesion:
 * es una fila que se limpio tarde.
 */

export interface SesionVigente extends Sesion {
  nombre_usuario: string
  correo: string
}

/**
 * Inserta una sesion a partir de los tokens EN CLARO y guarda solo sus hashes.
 *
 * La funcion recibe los tokens en claro y persiste los hashes, para que ningun
 * llamador pueda tener la tentacion de guardar el token: no hay forma de hacerlo
 * por accidente desde aca.
 */
export async function crearSesion(
  db: Base,
  datos: { usuario_id: number; token: string; token_proteccion: string; expira_en: Date },
): Promise<Sesion> {
  const fila: NuevaSesion = {
    usuario_id: datos.usuario_id,
    token_hash: hashearToken(datos.token),
    token_proteccion: hashearToken(datos.token_proteccion),
    expira_en: datos.expira_en,
  }

  const [creada] = await db.insert(sesiones).values(fila).returning()
  if (!creada) throw new Error('crearSesion no devolvio fila')
  return creada
}

/**
 * Busca la sesion de un token, si sigue vigente.
 *
 * El token se hashea y se busca por el hash. Un token en claro nunca llega a la
 * base, ni a un `where` de la base.
 */
export async function buscarSesionVigente(db: Base, token: string): Promise<Sesion | undefined> {
  const [encontrada] = await db
    .select()
    .from(sesiones)
    .where(and(eq(sesiones.token_hash, hashearToken(token)), gt(sesiones.expira_en, sql`now()`)))
    .limit(1)

  return encontrada
}

/**
 * Busca la sesion Y sus datos de usuario en una sola consulta.
 *
 * El JOIN se filtra por `expira_en`, no se trae la sesion y se descarta despues:
 * asi el usuario inactivo nunca llega a capa de presentacion.
 */
export async function buscarSesionConUsuario(
  db: Base,
  token: string,
): Promise<SesionVigente | undefined> {
  const [fila] = await db
    .select({
      id: sesiones.id,
      usuario_id: sesiones.usuario_id,
      token_hash: sesiones.token_hash,
      token_proteccion: sesiones.token_proteccion,
      expira_en: sesiones.expira_en,
      creada_en: sesiones.creada_en,
      nombre_usuario: usuarios.nombre_usuario,
      correo: usuarios.correo,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuario_id))
    .where(
      and(
        eq(sesiones.token_hash, hashearToken(token)),
        gt(sesiones.expira_en, sql`now()`),
        eq(usuarios.activo, true),
      ),
    )
    .limit(1)

  return fila
}

/**
 * Renueva el token de proteccion de una sesion.
 *
 * Se usa tras un cambio de contrasena: el token de proteccion anterior queda sin
 * uso, y la sesion sigue viva. El token de sesion NO cambia, para no expulsar al
 * usuario de la pestana en la que esta escribiendo.
 */
export async function renovarTokenProteccion(
  db: Base,
  usuario_id: number,
  token_proteccion: string,
): Promise<void> {
  await db
    .update(sesiones)
    .set({ token_proteccion: hashearToken(token_proteccion) })
    .where(and(eq(sesiones.usuario_id, usuario_id), gt(sesiones.expira_en, sql`now()`)))
}

/**
 * Elimina TODAS las sesiones de un usuario.
 *
 * Es lo que hace el cambio de contrasena en el resto de dispositivos: si alguien
 * robo una sesion, cambiar la contrasena la deja sin nada.
 */
export async function eliminarSesionesDeUsuario(db: Base, usuario_id: number): Promise<number> {
  const borradas = await db
    .delete(sesiones)
    .where(eq(sesiones.usuario_id, usuario_id))
    .returning({ id: sesiones.id })

  return borradas.length
}

/**
 * Cierra la sesion de un token: elimina la fila.
 *
 * No marca nada, porque no hay columna de revocacion. Borrar la fila es la
 * invalidacion.
 */
export async function eliminarSesion(db: Base, usuario_id: number, token: string): Promise<boolean> {
  const borradas = await db
    .delete(sesiones)
    .where(
      and(
        eq(sesiones.usuario_id, usuario_id),
        eq(sesiones.token_hash, hashearToken(token)),
      ),
    )
    .returning({ id: sesiones.id })

  return borradas.length > 0
}

/** Elimina las sesiones vencidas. Lo llama el materializador al abrir la app. */
export async function eliminarSesionesVencidas(db: Base): Promise<number> {
  const borradas = await db
    .delete(sesiones)
    .where(sql`${sesiones.expira_en} <= now()`)
    .returning({ id: sesiones.id })

  return borradas.length
}
