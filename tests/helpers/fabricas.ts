/**
 * Fabricas de datos de prueba.
 *
 * Cada change que agrega tablas las anade aca. Reglas:
 *
 * 1. Devuelven IDs reales, insertando de verdad. Un `id` inventado que no existe
 *    en la base hace que la prueba pase por el motivo equivocado.
 * 2. Cada fabrica acepta el cliente Drizzle, igual que los repositorios, para que
 *    las pruebas corran contra PGlite sin tocar variables de entorno.
 * 3. Los valores por defecto son validos y razonables. Una prueba que necesita un
 *    caso raro lo pide explicitamente.
 */

import { sql } from 'drizzle-orm'
import {
  asignaciones,
  carteras,
  cuentas,
  grupos,
  movimientos,
  sesiones,
  usuarios,
} from '../../src/db/schema'
import type { Base } from '../../src/db/tipos'
import { hashearContrasena } from '../../src/sesion/argon'
import { generarToken, hashearToken } from '../../src/sesion/tokens'

/** Contrasena por defecto. Pasa el minimo de 6 caracteres de `autenticacion`. */
export const CONTRASENA_POR_DEFECTO = 'prueba123'

let contador = 0

/** Un sufijo unico, para que dos usuarios de prueba no colisionen. */
function unico(etiqueta: string): string {
  contador += 1
  return `${etiqueta}${contador}`
}

export interface OpcionesUsuario {
  nombre?: string
  apellido?: string
  nombre_usuario?: string
  correo?: string
  contrasena?: string
  zona_horaria?: string
  activo?: boolean
  intentos_fallidos?: number
  bloqueado_hasta?: Date | null
}

/**
 * Inserta un usuario y devuelve su id.
 *
 * El hash se calcula con Argon2id, el mismo camino que el registro real. Si la
 * fabrica usara un hash falso, las pruebas de inicio de sesion estarian probando
 * una base de datos que el producto no tiene.
 */
export async function crearUsuario(db: Base, opciones: OpcionesUsuario = {}): Promise<number> {
  const nombre_usuario = opciones.nombre_usuario ?? unico('usuario')
  const correo = opciones.correo ?? `${nombre_usuario}@ejemplo.test`

  const [creado] = await db
    .insert(usuarios)
    .values({
      nombre: opciones.nombre ?? 'Ana',
      apellido: opciones.apellido ?? 'Diaz',
      nombre_usuario,
      correo,
      hash_contrasena: await hashearContrasena(opciones.contrasena ?? CONTRASENA_POR_DEFECTO),
      zona_horaria: opciones.zona_horaria ?? 'America/Mexico_City',
      activo: opciones.activo ?? true,
      intentos_fallidos: opciones.intentos_fallidos ?? 0,
      bloqueado_hasta: opciones.bloqueado_hasta ?? null,
    })
    .returning({ id: usuarios.id })

  if (!creado) throw new Error('crearUsuario no devolvio id')
  return creado.id
}

export interface OpcionesCartera {
  nombre?: string
  moneda?: string
  archivada?: boolean
  orden?: number
  eliminado_en?: Date | null
}

/**
 * Inserta una cartera. Misma firma que el repositorio a proposito: si la
 * fabrica aceptara un objeto mas laxo, las pruebas no estarian cubriendo la
 * firma que el producto usa.
 */
export async function crearCartera(
  db: Base,
  usuario_id: number,
  opciones: OpcionesCartera = {},
): Promise<number> {
  const [creada] = await db
    .insert(carteras)
    .values({
      usuario_id,
      nombre: opciones.nombre ?? unico('Cartera'),
      moneda: opciones.moneda ?? 'MXN',
      archivada: opciones.archivada ?? false,
      orden: opciones.orden ?? 0,
      eliminado_en: opciones.eliminado_en ?? null,
    })
    .returning({ id: carteras.id })

  if (!creada) throw new Error('crearCartera no devolvio id')
  return creada.id
}

export interface OpcionesSesion {
  usuario_id: number
  /** Caduca en 30 dias si no se indica otra cosa. */
  segundos_validez?: number
  token?: string
  token_proteccion?: string
}

/**
 * Inserta una sesion y devuelve el par de tokens EN CLARO.
 *
 * Lo guardado es siempre el hash. Devolver el token en claro es lo que permite
 * que la prueba lo use como lo usaria un navegador, y no como lo guardo el
 * servidor.
 */
export async function crearSesion(
  db: Base,
  opciones: OpcionesSesion,
): Promise<{ id: number; token: string; token_proteccion: string }> {
  const token = opciones.token ?? generarToken()
  const token_proteccion = opciones.token_proteccion ?? generarToken()

  const [creada] = await db
    .insert(sesiones)
    .values({
      usuario_id: opciones.usuario_id,
      token_hash: hashearToken(token),
      token_proteccion: hashearToken(token_proteccion),
      expira_en: new Date(Date.now() + (opciones.segundos_validez ?? 2_592_000) * 1000),
    })
    .returning({ id: sesiones.id })

  if (!creada) throw new Error('crearSesion no devolvio id')
  return { id: creada.id, token, token_proteccion }
}

/**
 * Deja un usuario bloqueado hasta `hasta`, con el contador que lo produjo.
 *
 * `autenticacion` R4 son 5 intentos y 60 segundos. La constante vive aca para que
 * un cambio en el umbral se vea en un solo lugar.
 */
export const INTENTOS_MAXIMOS = 5
export const SEGUNDOS_BLOQUEO = 60

/** Deja la cuenta en el estado que produce el quinto fallo. */
export async function bloquearUsuario(db: Base, usuario_id: number): Promise<void> {
  await db
    .update(usuarios)
    .set({
      intentos_fallidos: INTENTOS_MAXIMOS,
      bloqueado_hasta: new Date(Date.now() + SEGUNDOS_BLOQUEO * 1000),
    })
    .where(sql`${usuarios.id} = ${usuario_id}`)
}

/* -------------------------------------------------------------------------- */
/* 030-cuentas                                                                */
/* -------------------------------------------------------------------------- */

export interface OpcionesCuenta {
  nombre?: string
  tipo?: 'corriente' | 'ahorro' | 'efectivo' | 'credito'
  /** Siempre un string: es `numeric(16,2)` y la regla del dinero no admite number. */
  saldo_inicial?: string
  archivada?: boolean
  orden?: number
}

/** Inserta una cuenta y devuelve su id. El saldo inicial viaja como texto. */
export async function crearCuenta(
  db: Base,
  cartera_id: number,
  opciones: OpcionesCuenta = {},
): Promise<number> {
  const [creada] = await db
    .insert(cuentas)
    .values({
      cartera_id,
      nombre: opciones.nombre ?? unico('Cuenta'),
      tipo: opciones.tipo ?? 'corriente',
      saldo_inicial: opciones.saldo_inicial ?? '0.00',
      archivada: opciones.archivada ?? false,
      orden: opciones.orden ?? 0,
    })
    .returning({ id: cuentas.id })

  if (!creada) throw new Error('crearCuenta no devolvio id')
  return creada.id
}

export interface OpcionesGrupo {
  nombre?: string
  archivado?: boolean
  orden?: number
}

export async function crearGrupo(
  db: Base,
  cartera_id: number,
  opciones: OpcionesGrupo = {},
): Promise<number> {
  const [creado] = await db
    .insert(grupos)
    .values({
      cartera_id,
      nombre: opciones.nombre ?? unico('Grupo'),
      archivado: opciones.archivado ?? false,
      orden: opciones.orden ?? 0,
    })
    .returning({ id: grupos.id })

  if (!creado) throw new Error('crearGrupo no devolvio id')
  return creado.id
}

export interface OpcionesMovimiento {
  cuenta_id: number
  /** Con signo: negativo gasto, positivo ingreso. String, nunca number. */
  monto: string
  tipo?: 'gasto' | 'ingreso' | 'traspaso'
  sobre_id?: number
  fecha?: string
  descripcion?: string
  comercio?: string
  origen?: 'manual' | 'recurrente'
  eliminado_en?: Date | null
}

/**
 * Inserta un movimiento y devuelve su id.
 *
 * `monto` lleva el signo, porque el saldo se deriva sumando y no restando: un gasto
 * de 450 se guarda como `'-450.00'`. Asi el mismo `sum` sirve para las dos
 * direcciones y no hace falta un `case` por tipo.
 */
export async function crearMovimiento(
  db: Base,
  opciones: OpcionesMovimiento,
): Promise<number> {
  const monto = opciones.monto
  const [creado] = await db
    .insert(movimientos)
    .values({
      cuenta_id: opciones.cuenta_id,
      sobre_id: opciones.sobre_id ?? null,
      tipo: opciones.tipo ?? (monto.trim().startsWith('-') ? 'gasto' : 'ingreso'),
      monto,
      fecha: opciones.fecha ?? '2026-09-27',
      descripcion: opciones.descripcion ?? unico('Movimiento'),
      comercio: opciones.comercio ?? null,
      origen: opciones.origen ?? 'manual',
      eliminado_en: opciones.eliminado_en ?? null,
    })
    .returning({ id: movimientos.id })

  if (!creado) throw new Error('crearMovimiento no devolvio id')
  return creado.id
}

export interface OpcionesAsignacion {
  sobre_id: number
  monto: string
  periodo?: string
  motivo?: 'usuario' | 'reasignacion'
}

/**
 * Inserta una asignacion y devuelve su id.
 *
 * La firma incluye `motivo` porque `asignaciones` admite un importe negativo solo
 * cuando la fila dice que es una reasignacion. Una prueba que quiera esa fila la pide
 * con `motivo: 'reasignacion'`; el `check` de la base no deja pasar el negativo de otra
 * forma, asi que la prueba no puede mentir sobre el estado del saldo.
 */
export async function crearAsignacion(
  db: Base,
  opciones: OpcionesAsignacion,
): Promise<number> {
  const [creada] = await db
    .insert(asignaciones)
    .values({
      sobre_id: opciones.sobre_id,
      monto: opciones.monto,
      periodo: opciones.periodo ?? '2026-09',
      motivo: opciones.motivo ?? 'usuario',
    })
    .returning({ id: asignaciones.id })

  if (!creada) throw new Error('crearAsignacion no devolvio id')
  return creada.id
}
