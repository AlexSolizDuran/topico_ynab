import { and, asc, eq, isNull, ne, sql, type SQL } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { carteras, cuentas, movimientos } from '../db/schema'
import type { Cuenta, NuevaCuenta } from '../db/schema'
import type { Dinero } from '../dinero'
import { CarteraAjena, CarteraArchivada, operarSobreCartera } from './carteras'

/**
 * `cuentas` — los lugares fisicos del dinero.
 *
 * **El saldo no se almacena.** Se deriva en SQL: `saldo_inicial + sum(monto)` de
 * los movimientos vivos. Por eso `cuentas` no tiene columna `saldo` y por eso
 * borrar un movimiento recalcula el saldo sin intervencion manual: no hay nada que
 * recalcular, hay algo que volver a sumar.
 *
 * Toda cuenta pertenece a una cartera, y `usuario_id` acompana a `cartera_id` en
 * cada firma. Sin RLS, la pertenencia la demuestra el repositorio: una consulta
 * sin `cartera_id` podria devolver las cuentas de cualquier usuario, y una sin
 * `usuario_id` no podria demostrar nada.
 */

/** La cuenta es de otro usuario, o no existe. El mensaje no distingue los casos. */
export class CuentaAjena extends Error {
  constructor() {
    super('Esa cuenta no existe, o no es tuya.')
    this.name = 'CuentaAjena'
  }
}

/** El nombre ya lo usa otra cuenta de esa cartera. */
export class NombreDeCuentaDuplicado extends Error {
  readonly campo = 'nombre'

  constructor(nombre: string) {
    super(`Ya hay una cuenta llamada "${nombre}" en esta cartera.`)
    this.name = 'NombreDeCuentaDuplicado'
  }
}

/** Una cuenta con movimientos no puede cambiar de tipo. */
export class TipoConMovimientos extends Error {
  constructor() {
    super('Una cuenta con movimientos no puede cambiar de tipo: cambiaria el significado de su saldo.')
    this.name = 'TipoConMovimientos'
  }
}

/**
 * La cuenta tiene saldo y no se puede archivar.
 *
 * El nombre dice "saldo no cero" y no "cuenta con saldo" porque la precondicion de
 * `cuentas` R5 es sobre el saldo, no sobre la cuenta: el mismo error lo lanzaria
 * archivar una cuenta que quedo en negativo.
 */
export class SaldoNoCero extends Error {
  constructor(saldo: Dinero) {
    super(`No se puede archivar: la cuenta tiene saldo ${saldo}. Dejela en cero primero.`)
    this.name = 'SaldoNoCero'
  }
}

/** Una cuenta archivada no admite movimientos. */
export class CuentaArchivada extends Error {
  constructor() {
    super('Esta cuenta esta archivada.')
    this.name = 'CuentaArchivada'
  }
}

/** La cartera ya no tiene cuentas activas donde crear. */
export const SIN_CUENTRAS_ACTIVAS = 'La cartera no tiene cuentas activas.'

/**
 * El saldo de una cuenta, derivado en SQL y nunca como columna.
 *
 * Es `saldo_inicial + coalesce(sum(monto), 0)`: el `coalesce` esta porque una cuenta
 * recien creada no tiene movimientos y `sum` de nada es `null`, no cero. El tipo es
 * `string` porque Postgres devuelve `numeric` como texto, y el proyecto no hace
 * aritmetica con importes en JavaScript.
 *
 * El `left join` que lo acompaña lleva su condicion de `eliminado_en` en el ON, y
 * no en el WHERE: un filtro en el WHERE convertiria el `left join` en `inner`, y una
 * cuenta sin movimientos se quedaria sin fila cuando su saldo es justo el inicial.
 */
const saldoTotal = sql<string>`${cuentas.saldo_inicial} + coalesce(sum(${movimientos.monto}), 0)`

/**
 * `db.execute` devuelve `unknown`, y ademas `pg` (Neon) devuelve un array de filas
 * mientras PGlite devuelve `{ rows }`. Se normaliza en un solo lugar, igual que en
 * `carteras/saldos.ts`.
 */
async function filas<T>(db: Base, consulta: SQL): Promise<T[]> {
  const resultado = (await db.execute(consulta)) as T[] | { rows: T[] }
  return Array.isArray(resultado) ? resultado : (resultado.rows ?? [])
}

/**
 * Una cuenta con su saldo derivado. Se escribe a mano en vez de extender `Cuenta`
 * porque `$inferSelect` de Drizzle arrastra metodos de `Error` al tipo, y un
 * `interface ... extends` los haria parte de la forma de la fila.
 */
export type CuentaConSaldo = {
  id: number
  cartera_id: number
  nombre: string
  tipo: 'corriente' | 'ahorro' | 'efectivo' | 'credito'
  saldo_inicial: Dinero
  archivada: boolean
  orden: number
  creado_en: Date
  eliminado_en: Date | null
  /** Derivado en SQL. Nunca una columna. */
  saldo: Dinero
}

/**
 * Crea una cuenta en una cartera.
 *
 * La cartera se valida antes de insertar, por dos razones: para que el error sea el
 * de cartera y no una violacion de clave foranea, y para rechazar una cartera
 * ajena o archivada, que `carteras` R5 prohibe.
 */
export async function crearCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  datos: Omit<NuevaCuenta, 'cartera_id' | 'archivada' | 'orden' | 'saldo_inicial'> & {
    saldo_inicial?: Dinero
    orden?: number
  },
): Promise<Cuenta> {
  await operarSobreCartera(db, usuario_id, cartera_id)

  const repetida = await db
    .select({ id: cuentas.id })
    .from(cuentas)
    .where(and(eq(cuentas.cartera_id, cartera_id), eq(cuentas.nombre, datos.nombre), isNull(cuentas.eliminado_en)))
    .limit(1)

  if (repetida[0]) throw new NombreDeCuentaDuplicado(datos.nombre)

  const siguiente = await db
    .select({ siguiente: sql<number>`coalesce(max(${cuentas.orden}), -1) + 1` })
    .from(cuentas)
    .where(eq(cuentas.cartera_id, cartera_id))

  const [creada] = await db
    .insert(cuentas)
    .values({
      ...datos,
      cartera_id,
      saldo_inicial: datos.saldo_inicial ?? '0.00',
      orden: datos.orden ?? siguiente[0]?.siguiente ?? 0,
    })
    .returning()

  if (!creada) throw new Error('crearCuenta no devolvio fila')
  return creada
}

/**
 * Las cuentas de una cartera, con su saldo derivado, en el orden en que se
 * muestran. Las cuentas archivadas no salen en esta lista.
 */
export async function listarCuentas(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<CuentaConSaldo[]> {
  return db
    .select({
      id: cuentas.id,
      cartera_id: cuentas.cartera_id,
      nombre: cuentas.nombre,
      tipo: cuentas.tipo,
      saldo_inicial: cuentas.saldo_inicial,
      archivada: cuentas.archivada,
      orden: cuentas.orden,
      creado_en: cuentas.creado_en,
      eliminado_en: cuentas.eliminado_en,
      saldo: saldoTotal,
    })
    .from(cuentas)
    .innerJoin(carteras, eq(carteras.id, cuentas.cartera_id))
    .leftJoin(movimientos, and(eq(movimientos.cuenta_id, cuentas.id), isNull(movimientos.eliminado_en)))
    .where(
      and(
        eq(cuentas.cartera_id, cartera_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(cuentas.eliminado_en),
        eq(cuentas.archivada, false),
      ),
    )
    .groupBy(cuentas.id)
    .orderBy(asc(cuentas.orden), asc(cuentas.id))
}

/** Cuentas archivadas de la cartera, para poder restaurarlas. */
export async function listarCuentasArchivadas(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<Cuenta[]> {
  return db
    .select({ cuenta: cuentas })
    .from(cuentas)
    .innerJoin(carteras, eq(carteras.id, cuentas.cartera_id))
    .where(
      and(
        eq(cuentas.cartera_id, cartera_id),
        eq(carteras.usuario_id, usuario_id),
        eq(cuentas.archivada, true),
        isNull(cuentas.eliminado_en),
      ),
    )
    .orderBy(asc(cuentas.orden), asc(cuentas.id))
    .then((filas) => filas.map((f) => f.cuenta))
}

/**
 * El saldo de UNA cuenta, derivado. Devuelve el `string` de Postgres.
 *
 * Exige `usuario_id` y `cartera_id` aunque solo necesite `cuenta_id`, y el filtro va
 * en la misma consulta. Un saldo derivado sin prueba de pertenencia es una
 * pantalla que muestra la plata de otro: la cuenta sola no demuestra nada, y por eso
 * la firma la exige. La auditoria de firmas de `010-auth` lo verifica.
 */
export async function saldoDeCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<Dinero> {
  const [fila] = await filas<{ saldo: Dinero }>(db, sql`
    select (c.saldo_inicial + coalesce(sum(m.monto), 0))::text as saldo
    from cuentas c
    inner join carteras t on t.id = c.cartera_id
    left join movimientos m on m.cuenta_id = c.id and m.eliminado_en is null
    where c.id = ${cuenta_id} and c.cartera_id = ${cartera_id} and t.usuario_id = ${usuario_id}
    group by c.id
  `)

  if (!fila) throw new CuentaAjena()
  return fila.saldo
}

/**
 * Si el saldo de la cuenta es exactamente cero, resuelto en SQL.
 *
 * La comparacion se hace en Postgres y no en JavaScript a proposito: el saldo
 * vuelve como `'0.00'` o como `'-0.00'` segun como lo normalice el motor, y
 * comparar strings de importes en JS es donde aparecen los centavos perdidos.
 */
export async function saldoEsCero(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<boolean> {
  const [fila] = await filas<{ en_cero: boolean }>(db, sql`
    select (c.saldo_inicial + coalesce(sum(m.monto), 0)) = 0 as en_cero
    from cuentas c
    inner join carteras t on t.id = c.cartera_id
    left join movimientos m on m.cuenta_id = c.id and m.eliminado_en is null
    where c.id = ${cuenta_id} and c.cartera_id = ${cartera_id} and t.usuario_id = ${usuario_id}
    group by c.id
  `)

  if (!fila) throw new CuentaAjena()
  return fila.en_cero
}

/** La cuenta tiene movimientos vivos. Es lo que impide cambiar su tipo. */
export async function tieneMovimientos(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<boolean> {
  await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)

  const [fila] = await filas<{ total: number }>(db, sql`
    select count(*)::int as total
    from movimientos
    where cuenta_id = ${cuenta_id} and eliminado_en is null
  `)

  return (fila?.total ?? 0) > 0
}

/**
 * Lee UNA cuenta exigiendo `usuario_id` y `cartera_id`, por el camino corto de la
 * tabla `carteras`.
 *
 * Los dos filtros van en la MISMA consulta, y no uno y despues el otro: una cuenta
 * de otro usuario devuelve `undefined`, igual que un identificador inexistente, y
 * la vista no puede distinguir los casos.
 */
export async function buscarCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<Cuenta | undefined> {
  const [encontrada] = await db
    .select({ cuenta: cuentas })
    .from(cuentas)
    .innerJoin(carteras, eq(carteras.id, cuentas.cartera_id))
    .where(
      and(
        eq(cuentas.id, cuenta_id),
        eq(cuentas.cartera_id, cartera_id),
        eq(carteras.usuario_id, usuario_id),
        isNull(cuentas.eliminado_en),
      ),
    )
    .limit(1)

  return encontrada?.cuenta
}

/** Igual que `buscarCuenta`, pero lanza. Para escrituras. */
export async function obtenerCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<Cuenta> {
  const cuenta = await buscarCuenta(db, usuario_id, cartera_id, cuenta_id)
  if (!cuenta) throw new CuentaAjena()
  return cuenta
}

/** Renombra la cuenta. Su saldo y su historial quedan intactos. */
export async function cambiarNombreCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
  nombre: string,
): Promise<Cuenta> {
  await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)

  const repetida = await db
    .select({ id: cuentas.id })
    .from(cuentas)
    .where(
      and(
        eq(cuentas.cartera_id, cartera_id),
        eq(cuentas.nombre, nombre),
        ne(cuentas.id, cuenta_id),
        isNull(cuentas.eliminado_en),
      ),
    )
    .limit(1)

  if (repetida[0]) throw new NombreDeCuentaDuplicado(nombre)

  const [renombrada] = await db
    .update(cuentas)
    .set({ nombre })
    .where(and(eq(cuentas.id, cuenta_id), eq(cuentas.cartera_id, cartera_id)))
    .returning()

  if (!renombrada) throw new CuentaAjena()
  return renombrada
}

/**
 * Cambia el orden de presentacion. No toca el saldo ni el historial, porque no toca
 * nada de dinero.
 */
export async function cambiarOrdenCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
  orden: number,
): Promise<Cuenta> {
  await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)

  const [movida] = await db
    .update(cuentas)
    .set({ orden })
    .where(and(eq(cuentas.id, cuenta_id), eq(cuentas.cartera_id, cartera_id)))
    .returning()

  if (!movida) throw new CuentaAjena()
  return movida
}

/**
 * Cambia el tipo de una cuenta SOLO si no tiene movimientos.
 *
 * El tipo decide si la cuenta es dinero o deuda, y los movimientos ya registrados
 * se interpretaron con el tipo viejo. Convertir una cuenta con historial de gasto a
 * `credito` reescribiria el significado de cada saldo ya mostrado, y el
 * almacenamiento no guarda el tipo de cada movimiento, asi que no habria forma de
 * deshacerlo.
 */
export async function cambiarTipoCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
  tipo: NuevaCuenta['tipo'],
): Promise<Cuenta> {
  await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)

  if (await tieneMovimientos(db, usuario_id, cartera_id, cuenta_id)) {
    throw new TipoConMovimientos()
  }

  const [cambiada] = await db
    .update(cuentas)
    .set({ tipo })
    .where(and(eq(cuentas.id, cuenta_id), eq(cuentas.cartera_id, cartera_id)))
    .returning()

  if (!cambiada) throw new CuentaAjena()
  return cambiada
}

/**
 * Corrige el `saldo_inicial` de una cuenta.
 *
 * No recalcula nada: el saldo **es** `saldo_inicial + movimientos`, asi que cambiar
 * el inicial lo mueve de inmediato y el mismo valor a todos los derivados. Ese
 * requisito lo cumple la ausencia de columna `saldo`, no una linea de este metodo.
 */
export async function corregirSaldoInicial(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
  saldo_inicial: Dinero,
): Promise<Cuenta> {
  await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)

  const [corregida] = await db
    .update(cuentas)
    .set({ saldo_inicial })
    .where(and(eq(cuentas.id, cuenta_id), eq(cuentas.cartera_id, cartera_id)))
    .returning()

  if (!corregida) throw new CuentaAjena()
  return corregida
}

/**
 * Archiva una cuenta, solo si su saldo es cero.
 *
 * Archivar no borra: el historial sigue, y `restaurarCuenta` lo devuelve a la lista
 * activa. El requerimiento pide ademas que la cuenta **siga aceptando movimientos
 * hasta llegar al cero**, asi que archivar es solo una etiqueta de la lista.
 */
export async function archivarCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<Cuenta> {
  const cuenta = await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)
  if (cuenta.archivada) throw new CuentaArchivada()

  if (!(await saldoEsCero(db, usuario_id, cartera_id, cuenta_id))) {
    throw new SaldoNoCero(await saldoDeCuenta(db, usuario_id, cartera_id, cuenta_id))
  }

  const [archivada] = await db
    .update(cuentas)
    .set({ archivada: true })
    .where(and(eq(cuentas.id, cuenta_id), eq(cuentas.cartera_id, cartera_id)))
    .returning()

  if (!archivada) throw new CuentaAjena()
  return archivada
}

/** Devuelve una cuenta archivada a la lista activa, sin perder su historial. */
export async function restaurarCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<Cuenta> {
  const cuenta = await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)
  if (!cuenta.archivada) throw new Error('La cuenta ya esta activa.')

  const [restaurada] = await db
    .update(cuentas)
    .set({ archivada: false })
    .where(and(eq(cuentas.id, cuenta_id), eq(cuentas.cartera_id, cartera_id)))
    .returning()

  if (!restaurada) throw new CuentaAjena()
  return restaurada
}

/**
 * Reactiva una cuenta archivada, y lo hace ella sola.
 *
 * `cuentas` R5: un traspaso recibido en una cuenta archivada se registra y la
 * reactiva en la lista activa. Que la reactivacion sea parte de registrar el
 * movimiento, y no una accion aparte del usuario, es lo que hace que la cuenta
 * "siga aceptando movimientos hasta alcanzar el cero".
 */
export async function reactivarCuenta(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  cuenta_id: number,
): Promise<void> {
  await obtenerCuenta(db, usuario_id, cartera_id, cuenta_id)

  await db
    .update(cuentas)
    .set({ archivada: false })
    .where(and(eq(cuentas.id, cuenta_id), eq(cuentas.archivada, true)))
}
