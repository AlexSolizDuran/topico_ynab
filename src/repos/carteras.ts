import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { carteras } from '../db/schema'
import type { Cartera, NuevaCartera } from '../db/schema'
import { saldosDistintosDeCero } from '../carteras/saldos'

/**
 * `carteras` — el contenedor raiz.
 *
 * `usuario_id` es obligatorio en todas las firmas. Sin RLS, la unica frontera de
 * seguridad es el repositorio, asi que un metodo que acepta solo un identificador
 * es un bug, no una excepcion. La prueba de firmas de `010-auth` lo hace
 * explicito.
 *
 * El nombre de una cartera es unico DENTRO del usuario, por el indice
 * `carteras_usuario_nombre`: la misma palabra puede existir en dos carteras
 * distintas de la misma persona, que es exactamente lo que hace util tener varias.
 */

/** La cartera es de otro usuario, o no existe. El mensaje no distingue los casos. */
export class CarteraAjena extends Error {
  constructor() {
    super('Esa cartera no existe, o no es tuya.')
    this.name = 'CarteraAjena'
  }
}

/** El nombre ya lo usa otra cartera del mismo usuario. */
export class NombreDeCarteraDuplicado extends Error {
  readonly campo = 'nombre'

  constructor(nombre: string) {
    super(`Ya tienes una cartera llamada "${nombre}".`)
    this.name = 'NombreDeCarteraDuplicado'
  }
}

/**
 * Una cartera archivada no admite movimientos. Es `carteras` R5: operar sobre una
 * cartera archivada se rechaza mientras permanezca archivada.
 */
export class CarteraArchivada extends Error {
  constructor() {
    super('Esta cartera esta archivada. Restaurala para volver a usarla.')
    this.name = 'CarteraArchivada'
  }
}

/**
 * La cartera tiene saldos y no se puede archivar. `carteras` R5 lo pide
 * explicitamente: hay que vaciar cuentas y sobres primero.
 */
export class CarteraConSaldos extends Error {
  constructor(detalle: number) {
    super(
      `No se puede archivar: quedan ${detalle} ${
        detalle === 1 ? 'movimiento con saldo' : 'movimientos con saldo'
      }. Vacia las cuentas y los sobres primero.`,
    )
    this.name = 'CarteraConSaldos'
  }
}

/**
 * No se puede afirmar que la cartera este en cero, porque las tablas de cuentas,
 * movimientos y asignaciones todavia no existen. Se rechaza en vez de archivar a
 * ciegas. Cuando `050-sobres` las cree, este error deja de ocurrir.
 */
export class ArchivadoSinVerificar extends Error {
  constructor() {
    super('No se puede archivar todavia: la comprobacion de saldos no esta disponible.')
    this.name = 'ArchivadoSinVerificar'
  }
}

/**
 * Crea una cartera para UN usuario.
 *
 * `usuario_id` es un parametro aparte y no un campo de `datos`, a proposito: si
 * fuera parte del objeto, un llamador podria crear una cartera para cualquier
 * usuario escribiendo su id ahi. Al fijarlo en la firma, la pertenencia la decide
 * el repositorio y no quien llama. La cartera inicial del registro sale de aca.
 *
 * La cartera nueva se crea ya activa, vacia y con `orden` al final de la lista.
 */
export async function crearCartera(
  db: Base,
  usuario_id: number,
  datos: Omit<NuevaCartera, 'usuario_id' | 'archivada' | 'orden'> & { orden?: number },
): Promise<Cartera> {
  const repetida = await db
    .select({ id: carteras.id })
    .from(carteras)
    .where(
      and(
        eq(carteras.usuario_id, usuario_id),
        eq(carteras.nombre, datos.nombre),
        isNull(carteras.eliminado_en),
      ),
    )
    .limit(1)

  if (repetida[0]) throw new NombreDeCarteraDuplicado(datos.nombre)

  const ultima = await db
    .select({ siguiente: sql<number>`coalesce(max(${carteras.orden}), -1) + 1` })
    .from(carteras)
    .where(eq(carteras.usuario_id, usuario_id))

  const [creada] = await db
    .insert(carteras)
    .values({ ...datos, usuario_id, orden: datos.orden ?? ultima[0]?.siguiente ?? 0 })
    .returning()

  if (!creada) throw new Error('crearCartera no devolvio fila')
  return creada
}

/** Carteras del usuario, en el orden en que el las muestra. */
export async function listarCarteras(db: Base, usuario_id: number): Promise<Cartera[]> {
  return db
    .select()
    .from(carteras)
    .where(and(eq(carteras.usuario_id, usuario_id), isNull(carteras.eliminado_en)))
    .orderBy(carteras.orden, carteras.id)
}

/**
 * Carteras activas, que son las unicas que se ofrecen para operar. Una cartera
 * archivada desaparece de la lista sin que sus datos se borren: el archivo conserva
 * el historial.
 */
export async function listarCarterasActivas(db: Base, usuario_id: number): Promise<Cartera[]> {
  return (await listarCarteras(db, usuario_id)).filter((cartera) => !cartera.archivada)
}

/** Carteras archivadas, para poder restaurarlas. */
export async function listarCarterasArchivadas(db: Base, usuario_id: number): Promise<Cartera[]> {
  return (await listarCarteras(db, usuario_id)).filter((cartera) => cartera.archivada)
}

/**
 * Lee UNA cartera exigiendo a la vez `usuario_id` y `cartera_id`.
 *
 * Los dos filtros van en la misma consulta, y no uno y despues el otro: una
 * cartera de otro usuario devuelve `undefined`, igual que un identificador que no
 * existe. La vista no puede distinguir los casos, y esa es la intencion.
 */
export async function buscarCartera(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<Cartera | undefined> {
  const [encontrada] = await db
    .select()
    .from(carteras)
    .where(
      and(
        eq(carteras.usuario_id, usuario_id),
        eq(carteras.id, cartera_id),
        isNull(carteras.eliminado_en),
      ),
    )
    .limit(1)

  return encontrada
}

/**
 * Igual que `buscarCartera`, pero lanza en vez de devolver `undefined`.
 *
 * Para las escrituras, donde `undefined` obligaria a que cada llamador decidiera
 * que error mostrar. Y el mensaje es el MISMO para una cartera ajena y para una que
 * no existe: responder distinto confirmaria que el identificador existe.
 */
export async function obtenerCartera(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<Cartera> {
  const cartera = await buscarCartera(db, usuario_id, cartera_id)
  if (!cartera) throw new CarteraAjena()
  return cartera
}

/**
 * Exige que la cartera exista, sea del usuario y **no este archivada**.
 *
 * Toda escritura de una cartera pasa por aca. Concentrar la comprobacion en una
 * funcion es lo que hace que "operar sobre una cartera archivada se rechaza" sea
 * una regla y no un recordatorio en cada metodo.
 */
export async function operarSobreCartera(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<Cartera> {
  const cartera = await obtenerCartera(db, usuario_id, cartera_id)
  if (cartera.archivada) throw new CarteraArchivada()
  return cartera
}

/** Renombra la cartera. La moneda y todo su contenido quedan intactos. */
export async function cambiarNombre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  nombre: string,
): Promise<Cartera> {
  await operarSobreCartera(db, usuario_id, cartera_id)

  const repetida = await db
    .select({ id: carteras.id })
    .from(carteras)
    .where(
      and(
        eq(carteras.usuario_id, usuario_id),
        eq(carteras.nombre, nombre),
        ne(carteras.id, cartera_id),
        isNull(carteras.eliminado_en),
      ),
    )
    .limit(1)

  if (repetida[0]) throw new NombreDeCarteraDuplicado(nombre)

  const [renombrada] = await db
    .update(carteras)
    .set({ nombre })
    .where(and(eq(carteras.id, cartera_id), eq(carteras.usuario_id, usuario_id)))
    .returning()

  if (!renombrada) throw new CarteraAjena()
  return renombrada
}

/*
 * NO hay metodo para cambiar `carteras.moneda`, y esa es la forma de que no se
 * pueda cambiar. El unico codigo del repositorio que toca esa columna es el
 * `insert` de `crearCartera`. Un intento de cambio entra por el formulario y lo
 * rechaza `exigirMonedaNoCambiada`, en `carteras/monedas.ts`, que es donde vive el
 * mensaje que lo explica.
 *
 * La prueba de `020-carteras` lee este fuente y falla si aparece un `set` con
 * `moneda`, de modo que agregar el metodo despues rompe la suite a proposito.
 */

/**
 * Archiva una cartera. Solo si todas sus cuentas y sobres estan en cero.
 *
 * La comprobacion de saldos vive en `carteras/saldos.ts` y devuelve `undefined`
 * mientras las tablas que debe consultar no existan; ese `undefined` se traduce en
 * `ArchivadoSinVerificar` y NO en un archivado sin control.
 *
 * Archivar no borra: marca `archivada` y sus datos quedan. Es lo que permite
 * restaurarla despues y consultar su historial.
 */
export async function archivarCartera(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<Cartera> {
  const cartera = await obtenerCartera(db, usuario_id, cartera_id)
  if (cartera.archivada) throw new CarteraArchivada()

  const saldos = await saldosDistintosDeCero(db, cartera_id)
  if (saldos === undefined) throw new ArchivadoSinVerificar()
  if (saldos > 0) throw new CarteraConSaldos(saldos)

  const [archivada] = await db
    .update(carteras)
    .set({ archivada: true })
    .where(and(eq(carteras.id, cartera_id), eq(carteras.usuario_id, usuario_id)))
    .returning()

  if (!archivada) throw new CarteraAjena()
  return archivada
}

/** Devuelve una cartera archivada a la lista activa, sin perder nada. */
export async function restaurarCartera(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<Cartera> {
  const cartera = await obtenerCartera(db, usuario_id, cartera_id)
  if (!cartera.archivada) throw new Error('La cartera ya esta activa.')

  const [restaurada] = await db
    .update(carteras)
    .set({ archivada: false })
    .where(and(eq(carteras.id, cartera_id), eq(carteras.usuario_id, usuario_id)))
    .returning()

  if (!restaurada) throw new CarteraAjena()
  return restaurada
}

/** Cuenta las carteras del usuario. Lo usa el registro para idempotencia. */
export async function contarCarteras(db: Base, usuario_id: number): Promise<number> {
  const filas = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(carteras)
    .where(eq(carteras.usuario_id, usuario_id))

  return filas[0]?.total ?? 0
}
