import { and, eq, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { carteras, usuarios } from '../db/schema'
import type { NuevaUsuario, Usuario } from '../db/schema'

/**
 * Errores de dominio de `autenticacion`.
 *
 * Un unico error para "las credenciales no sirven", y no uno para "el usuario no
 * existe" y otro para "la contrasena no sirve": distinguirlos convierte la
 * pantalla de inicio de sesion en un oraculo de que nombres de usuario existen.
 */

export class CredencialesInvalidas extends Error {
  constructor() {
    super('El nombre de usuario o la contrasena no son correctos.')
    this.name = 'CredencialesInvalidas'
  }
}

export class CuentaBloqueada extends Error {
  /** Segundos que faltan para volver a intentar. */
  readonly segundos_restantes: number

  constructor(segundos_restantes: number) {
    super(
      `Demasiados intentos fallidos. Intenta de nuevo en ${segundos_restantes} segundos.`,
    )
    this.name = 'CuentaBloqueada'
    this.segundos_restantes = segundos_restantes
  }
}

export class UsuarioInactivo extends Error {
  constructor() {
    super('Esta cuenta esta desactivada.')
    this.name = 'UsuarioInactivo'
  }
}

export class DatosDuplicados extends Error {
  /** Que campo choco, para que la vista lo señale. */
  readonly campo: 'nombre_usuario' | 'correo'

  constructor(campo: 'nombre_usuario' | 'correo') {
    super(
      campo === 'nombre_usuario'
        ? 'Ese nombre de usuario ya esta en uso.'
        : 'Ese correo ya esta registrado.',
    )
    this.name = 'DatosDuplicados'
    this.campo = campo
  }
}

/**
 * Busca por nombre de usuario, insensible a mayusculas.
 *
 * El `lower()` del lado de Postgres no es una comodidad: es el mismo criterio con
 * el que se construyo el indice unico funcional. Si esta busqueda fuera sensible,
 * un usuario que se registro como `Alex` no podria entrar escribiendo `alex`.
 */
export async function buscarPorNombreUsuario(
  db: Base,
  nombre_usuario: string,
): Promise<Usuario | undefined> {
  const encontrado = await db
    .select()
    .from(usuarios)
    .where(sql`lower(${usuarios.nombre_usuario}) = lower(${nombre_usuario})`)
    .limit(1)

  return encontrado[0]
}

/** Busca un usuario por id. La pertenencia la fija quien llama, no el id. */
export async function buscarPorId(db: Base, usuario_id: number): Promise<Usuario | undefined> {
  const [encontrado] = await db.select().from(usuarios).where(eq(usuarios.id, usuario_id)).limit(1)
  return encontrado
}

/** Busca por correo. El correo es unico exacto, sin insensibilidad. */
export async function buscarPorCorreo(db: Base, correo: string): Promise<Usuario | undefined> {
  const encontrado = await db.select().from(usuarios).where(eq(usuarios.correo, correo)).limit(1)

  return encontrado[0]
}

/**
 * Crea un usuario, o falla indicando que campo choco.
 *
 * Se traduce la violacion del indice unico a un error de dominio. Sin esto, la
 * vista tendria que interpretar un codigo de Postgres, y el mensaje acabaria
 * mostrandose crudo al usuario.
 */
export async function crearUsuario(
  db: Base,
  datos: NuevaUsuario & { hash_contrasena: string },
): Promise<Usuario> {
  try {
    const [creado] = await db.insert(usuarios).values(datos).returning()
    if (!creado) throw new Error('crearUsuario no devolvio fila')
    return creado
  } catch (error) {
    throw traducirViolacion(error)
  }
}

/** Traduce una violacion de indice unico al campo que choco. */
function traducirViolacion(error: unknown): unknown {
  if (!esViolacionDeUnicidad(error)) return error

  const detalle = String((error as { cause?: unknown }).cause ?? error)

  if (detalle.includes('usuarios_nombre_usuario_lower')) {
    return new DatosDuplicados('nombre_usuario')
  }
  if (detalle.includes('usuarios_correo')) {
    return new DatosDuplicados('correo')
  }
  return error
}

/**
 * Detecta la violacion de un indice unico (SQLSTATE 23505).
 *
 * Se mira el codigo y no el texto del mensaje: el texto cambia entre versiones
 * de Postgres y entre pooled y unpooled.
 */
function esViolacionDeUnicidad(error: unknown): boolean {
  const causa = (error as { cause?: { code?: string } }).cause ?? (error as { code?: string })
  return causa?.code === '23505'
}

/** Reinicia el contador de intentos, tras un inicio de sesion exitoso. */
export async function reiniciarIntentos(db: Base, usuario_id: number): Promise<void> {
  await db
    .update(usuarios)
    .set({ intentos_fallidos: 0, bloqueado_hasta: null })
    .where(eq(usuarios.id, usuario_id))
}

/** Suma un intento fallido y bloquea al quinto. */
export async function registrarIntentoFallido(
  db: Base,
  usuario_id: number,
  maximo: number,
  segundos_bloqueo: number,
): Promise<void> {
  await db
    .update(usuarios)
    .set({
      intentos_fallidos: sql`${usuarios.intentos_fallidos} + 1`,
      bloqueado_hasta: sql`case when ${usuarios.intentos_fallidos} + 1 >= ${maximo}
        then now() + make_interval(secs => ${segundos_bloqueo})
        else ${usuarios.bloqueado_hasta} end`,
    })
    .where(eq(usuarios.id, usuario_id))
}

/**
 * Lee el estado de bloqueo, para decidir si la cuenta esta bloqueada ahora.
 *
 * La comparacion es `bloqueado_hasta > now()` y no un booleano guardado: asi el
 * bloqueo expira solo, sin un proceso que lo limpie.
 */
export async function estaBloqueado(db: Base, usuario_id: number): Promise<boolean> {
  const [fila] = await db
    .select({ bloqueado_hasta: usuarios.bloqueado_hasta })
    .from(usuarios)
    .where(eq(usuarios.id, usuario_id))

  if (!fila?.bloqueado_hasta) return false
  return fila.bloqueado_hasta.getTime() > Date.now()
}

/** Actualiza el hash de la contrasena, tras verificar la anterior. */
export async function actualizarContrasena(
  db: Base,
  usuario_id: number,
  hash_contrasena: string,
): Promise<void> {
  await db
    .update(usuarios)
    .set({ hash_contrasena })
    .where(and(eq(usuarios.id, usuario_id), eq(usuarios.activo, true)))
}

/** Cuentas del usuario. La cartera inicial se crea con la de registro. */
export async function carterasDe(db: Base, usuario_id: number) {
  return db.select().from(carteras).where(eq(carteras.usuario_id, usuario_id))
}
