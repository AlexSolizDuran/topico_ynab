import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { grupos, metas, sobres } from '../db/schema'
import type { Dinero } from '../dinero'
import { operarSobreCartera } from './carteras'
import { disponibleDeSobre as disponibleDeSobreAlias, finDePeriodo } from './fragmentos'

/**
 * `sobres` y `asignaciones`: el corazon del reparto de dinero.
 *
 * Todo el dinero de este repositorio sale de una sola idea: **el disponible no esta
 * almacenado**. Es
 *
 *     disponible = sum(asignaciones.monto hasta el periodo)
 *                + sum(movimientos.monto hasta el periodo, sin traspasos, no borrados)
 *
 * y se calcula en cada lectura, en Postgres. De ahi sale casi todo lo que el
 * requerimiento pide: los periodos se acumulan solos, corregir un movimiento de hace
 * meses se refleja al instante, y no existe ninguna operacion de "recalcular" que
 * alguien pueda olvidar.
 *
 * El signo lo lleva `movimientos.monto` y las asignaciones son siempre positivas, que
 * es justo por lo que hay un `check` en la base: un sobregiro es un gasto sin asignar,
 * no una asignacion negativa. Si las asignaciones aceptaran negativos, la misma
 * realidad tendria dos expresiones y el disponible dependeria de cual se uso.
 *
 * Las asignaciones no se restringen por periodo: NO hay `unique (sobre_id, periodo)`.
 * Varias asignaciones al mismo sobre y mismo periodo se suman, y cada una queda
 * registrada. Un `unique` obligaria a un `upsert` y perderia el detalle de cuantas
 * veces el usuario asigno.
 *
 * Nota sobre el SQL crudo: los nombres de tabla en las subconsultas son texto, no
 * identificadores de Drizzle, asi que un renombre de tabla no los actualiza. Es el
 * precio de escribir la aritmetica en la base, y la alternativa �traer las filas y
 * sumarlas en JavaScript� esta expressly prohibida.
 */

export class SobreNoExiste extends Error {
  constructor() {
    super('El sobre no existe en esta cartera.')
    this.name = 'SobreNoExiste'
  }
}

export class NombreDeSobreDuplicado extends Error {
  constructor() {
    super('Ya hay un sobre con ese nombre en esta cartera.')
    this.name = 'NombreDeSobreDuplicado'
  }
}

export class GrupoDeOtraCartera extends Error {
  constructor() {
    super('Ese grupo no es de esta cartera.')
    this.name = 'GrupoDeOtraCartera'
  }
}

export class SinGrupo extends Error {
  constructor() {
    super('Elige un grupo: todos los sobres tienen que estar en uno.')
    this.name = 'SinGrupo'
  }
}

export class SobreArchivado extends Error {
  constructor() {
    super('Este sobre esta archivado. Desarchivalo antes de asignarle dinero.')
    this.name = 'SobreArchivado'
  }
}

export class OrdenDeSobreInvalido extends Error {
  constructor() {
    super('El orden de un sobre tiene que ser un entero igual o mayor que cero.')
    this.name = 'OrdenDeSobreInvalido'
  }
}

export class SobreConMovimientos extends Error {
  constructor() {
    super('Este sobre tiene movimientos, asi que no se elimina: se archiva.')
    this.name = 'SobreConMovimientos'
  }
}

export class SobreConSaldo extends Error {
  readonly disponible: Dinero

  constructor(disponible: Dinero) {
    super(`El disponible del sobre es ${disponible}. Vacialo antes de continuar.`)
    this.name = 'SobreConSaldo'
    this.disponible = disponible
  }
}

/** Un sobre con su disponible ya derivado, listo para pintar. */
export interface SobreVisto {
  id: number
  cartera_id: number
  grupo_id: number
  nombre: string
  archivado: boolean
  orden: number
  /** Derivado. String, nunca number. */
  disponible: Dinero
  /** Si el disponible es exactamente cero. Resuelto en SQL, no comparando strings. */
  cero: boolean
  /** Si el disponible es negativo. Un sobre archivado tambien puede estarlo, y el
   *  requerimiento pide que siga visible. Resuelto en SQL, como el resto. */
  negativo: boolean
  /** Sin movimientos y en cero: lo unico que se puede eliminar. */
  eliminable: boolean
}

/**
 * El instante que cierra un periodo `YYYY-MM`, como fragmento SQL.
 *
 * El disponible de `2026-03` incluye todo marzo, asi que el corte es el **primer dia
 * del mes siguiente**, no el ultimo de marzo: `fecha < '2026-04-01'` incluye el 31 de
 * marzo a las 23:59:59 y excluye el 1 de abril a las 00:00:00. Comparar contra
 * `to_char(fecha, 'YYYY-MM')` seria equivalente y mas legible, pero impediria que
 * Postgres usara el rango del indice de `fecha`.
 *
 * El corte se arma en SQL y no en JavaScript. Restar un mes en JS significa restar uno a
 * un `Number`, y con ahi es donde empiezan los `Number(anio)`: el caso de diciembre,
 * en el que el mes siguiente es enero del ano siguiente, es un `if` mas que se puede
 * olvidar, y un forgot esperando a que el primer tap�n de enero lo encuentre.
 */
function topeDePeriodo(periodo: string) {
  return sql`(${periodo} || '-01')::date + interval '1 month'`
}

/**
 * El disponible de un sobre, como fragmento SQL.
 *
 * `sobre_id` es un fragmento, no un `number`, porque hay dos callers legitimos y cada
 * uno necesita algo distinto: uno pasa el id como parametro, y el otro necesita
 * referirse a la fila que la consulta exterior esta armando.
 */
function disponible(sobre_id: SQL, periodo: string) {
  return disponibleDeSobreAlias(sobre_id, periodo)
}

/** El disponible de un sobre por id, con el id como parametro. */
export function disponibleDeSobreSql(sobre_id: number, periodo: string) {
  return disponible(sql`${sobre_id}`, periodo)
}

/**
 * El disponible de la fila que se esta armando, para una consulta `from sobres`.
 *
 * `sql.raw` y no `${sobres.id}`, y la razon es la trampa mas silenciosa de este
 * archivo: Drizzle renderiza una columna entre `${}` **sin calificarla**, asi que
 * queda `"id"`. Adentro del subquery, `a.sobre_id = "id"` se resuelve a la columna de
 * la tabla **interna** �`asignaciones.id`� y no a la de la fila de afuera. La consulta
 * no da error: corre, y suma el disponible de **todos** los sobres.
 *
 * Por eso el `check` de la regla del dinero no alcanza para encontrarlo, y por eso hay
 * una prueba que compara el disponible de dos sobres con asignaciones distintas y exige
 * numeros distintos.
 */
export function disponibleDeFilaSql(periodo: string) {
  return disponibleDeSobreAlias(sql.raw('sobres.id'), periodo)
}

/** Si el sobre tiene movimientos vivos. Sin este dato no se puede eliminar. */
function tieneMovimientosSql() {
  return sql`exists (
    select 1 from movimientos m where m.sobre_id = sobres.id and m.eliminado_en is null
  )`
}

/** Cruce de pertenencia: el sobre tiene que ser de la cartera de este usuario. */
function pertenencia(usuario_id: number, cartera_id: number) {
  return sql`exists (
    select 1 from carteras c
    where c.id = ${sobres.cartera_id}
      and c.id = ${cartera_id}
      and c.usuario_id = ${usuario_id}
      and c.eliminado_en is null
  )`
}

/**
 * El mismo listado, con el disponible derivado.
 *
 * `cero` y `eliminable` se calculan en la misma consulta y en SQL, con `= 0` sobre la
 * suma derivada. La alternativa �traer el disponible como string y compararlo en
 * JavaScript� es exactamente la conversion que el proyecto prohibe, y Postgres
 * devuelve `-0.00` o `0.00` segun normalice, que es donde se cuelan los centavos.
 */
const COLUMNAS = {
  id: sobres.id,
  cartera_id: sobres.cartera_id,
  grupo_id: sobres.grupo_id,
  nombre: sobres.nombre,
  archivado: sobres.archivado,
  orden: sobres.orden,
}

function seleccion(periodo: string) {
  return {
    ...COLUMNAS,
    disponible: disponibleDeFilaSql(periodo),
    cero: sql<boolean>`${disponibleDeFilaSql(periodo)} = 0`,
    negativo: sql<boolean>`${disponibleDeFilaSql(periodo)} < 0`,
    eliminable: sql<boolean>`not ${tieneMovimientosSql()} and ${disponibleDeFilaSql(periodo)} = 0`,
  }
}

function comoVisto(fila: {
  id: number
  cartera_id: number
  grupo_id: number
  nombre: string
  archivado: boolean
  orden: number
  disponible: Dinero
  cero: boolean
  negativo: boolean
  eliminable: boolean
}): SobreVisto {
  return {
    id: fila.id,
    cartera_id: fila.cartera_id,
    grupo_id: fila.grupo_id,
    nombre: fila.nombre,
    archivado: fila.archivado,
    orden: fila.orden,
    disponible: fila.disponible,
    cero: fila.cero,
    negativo: fila.negativo,
    eliminable: fila.eliminable,
  }
}

/** Sobres vivos con el filtro de archivado indicado, en el orden del usuario. */
async function listar(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
  archivados: boolean,
): Promise<SobreVisto[]> {
  const filas = await db
    .select(seleccion(periodo))
    .from(sobres)
    .where(
      and(pertenencia(usuario_id, cartera_id), isNull(sobres.eliminado_en), eq(sobres.archivado, archivados)),
    )
    .orderBy(asc(sobres.orden), asc(sobres.id))

  return filas.map(comoVisto)
}

export async function listarSobres(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<SobreVisto[]> {
  return listar(db, usuario_id, cartera_id, periodo, false)
}

export async function listarSobresArchivados(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<SobreVisto[]> {
  return listar(db, usuario_id, cartera_id, periodo, true)
}

/**
 * Todos los sobres en negativo, **archivados o no**.
 *
 * R11 pide que un sobre archivado que acumula movimientos hasta quedar en negativo se
 * siga mostrando y se destaque en rojo, y R6 pide que todo desborde se presente de
 * forma destacada. Con el listado partido en "archivados" y "no archivados", ese
 * sobre cae entre los dos y no lo muestra ninguno: queda invisible justo cuando el
 * usuario mas lo necesita ver.
 *
 * Por eso este listado no consulta por `archivado` sino por el disponible derivado, y
 * por eso el filtro se escribe en SQL sobre la suma y no en JavaScript sobre el string.
 */
export async function listarSobresEnNegativo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<SobreVisto[]> {
  const filas = await db
    .select(seleccion(periodo))
    .from(sobres)
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        isNull(sobres.eliminado_en),
        sql`${disponibleDeFilaSql(periodo)} < 0`,
      ),
    )
    .orderBy(asc(sobres.orden), asc(sobres.id))

  return filas.map(comoVisto)
}

/**
 * Los sobres archivados que acumulaste algo: devoluciones y reembolsos.
 *
 * R11: un sobre archivado no recibe asignaciones, pero si devoluciones, y en cuanto
 * tiene disponible distinto de cero el sistema lo muestra de nuevo. Un archivado no
 * aparece en el listado normal, asi que sin esta consulta la devolucion queda
 * registrada y el usuario no se entera de que tiene 200 sin destinar ahi.
 */
export async function listarSobresArchivadosConSaldo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  periodo: string,
): Promise<SobreVisto[]> {
  const filas = await db
    .select(seleccion(periodo))
    .from(sobres)
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        isNull(sobres.eliminado_en),
        eq(sobres.archivado, true),
        sql`${disponibleDeFilaSql(periodo)} <> 0`,
      ),
    )
    .orderBy(asc(sobres.orden), asc(sobres.id))

  return filas.map(comoVisto)
}

/** El disponible de un sobre, derivado. Lanza si el sobre no es de esta cartera. */
export async function disponibleDeSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
): Promise<Dinero> {
  const [fila] = await db
    .select({ disponible: disponibleDeFilaSql(periodo) })
    .from(sobres)
    .where(and(pertenencia(usuario_id, cartera_id), eq(sobres.id, sobre_id), isNull(sobres.eliminado_en)))
    .limit(1)

  if (!fila) throw new SobreNoExiste()
  return fila.disponible
}

/** Un sobre por id, con su disponible derivado. */
export async function buscarSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
): Promise<SobreVisto> {
  const [fila] = await db
    .select(seleccion(periodo))
    .from(sobres)
    .where(and(pertenencia(usuario_id, cartera_id), eq(sobres.id, sobre_id), isNull(sobres.eliminado_en)))
    .limit(1)

  if (!fila) throw new SobreNoExiste()
  return comoVisto(fila)
}

/** Un sobre por id, sin derivar dinero. Para renombrar, reordenar o mover de grupo. */
export async function existeSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
): Promise<{ id: number; cartera_id: number; grupo_id: number }> {
  const [fila] = await db
    .select({ id: sobres.id, cartera_id: sobres.cartera_id, grupo_id: sobres.grupo_id })
    .from(sobres)
    .where(and(pertenencia(usuario_id, cartera_id), eq(sobres.id, sobre_id), isNull(sobres.eliminado_en)))
    .limit(1)

  if (!fila) throw new SobreNoExiste()
  return fila
}

export async function crearSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  grupo_id: number | null,
  nombre: string,
): Promise<SobreVisto> {
  await operarSobreCartera(db, usuario_id, cartera_id)

  // Un sobre sin grupo no existe como estado: la columna es `not null` y el
  // requerimiento pide que se rechace la creacion REQUESTING un grupo, no que se acepte
  // y se esconda. Por eso el parametro acepta `null` y se responde aca, con el mensaje
  // que corresponde, en vez de dejar que el formulario lo rechace por su cuenta con un
  // "no se pudo identificar el sobre" que no dice nada util.
  if (grupo_id === null) throw new SinGrupo()

  // El grupo tiene que ser de esta cartera. Sin esta comprobacion, un `grupo_id` de
  // otra cartera dejaria un sobre que no aparece en ninguna lista.
  const [grupo] = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(and(eq(grupos.id, grupo_id), eq(grupos.cartera_id, cartera_id)))
    .limit(1)

  if (!grupo) throw new GrupoDeOtraCartera()

  const [creado] = await db
    .insert(sobres)
    .values({ cartera_id, grupo_id, nombre })
    .onConflictDoNothing()
    .returning({ id: sobres.id })

  if (!creado) throw new NombreDeSobreDuplicado()

  return {
    id: creado.id,
    cartera_id,
    grupo_id,
    nombre,
    archivado: false,
    orden: 0,
    // Un sobre recien creado tiene disponible cero, y no porque este codigo lo ponga en
    // cero: porque no tiene asignaciones ni movimientos. Es el mismo derivado de
    // siempre, con la tabla vacia.
    disponible: '0.00',
    cero: true,
    negativo: false,
    eliminable: true,
  }
}

export async function cambiarNombreSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  nombre: string,
): Promise<void> {
  await existeSobre(db, usuario_id, cartera_id, sobre_id)

  const [actualizado] = await db
    .update(sobres)
    .set({ nombre })
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        eq(sobres.id, sobre_id),
        isNull(sobres.eliminado_en),
        sql`not exists (
          select 1 from sobres otro
          where otro.cartera_id = ${sobres.cartera_id}
            and otro.id <> ${sobres.id}
            and otro.eliminado_en is null
            and lower(otro.nombre) = lower(${nombre})
        )`,
      ),
    )
    .returning({ id: sobres.id })

  if (!actualizado) throw new NombreDeSobreDuplicado()
}

export async function cambiarOrdenSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  orden: number,
): Promise<void> {
  if (!Number.isInteger(orden) || orden < 0) throw new OrdenDeSobreInvalido()

  const [movido] = await db
    .update(sobres)
    .set({ orden })
    .where(and(pertenencia(usuario_id, cartera_id), eq(sobres.id, sobre_id), isNull(sobres.eliminado_en)))
    .returning({ id: sobres.id })

  if (!movido) throw new SobreNoExiste()
}

/**
 * Mueve un sobre a otro grupo.
 *
 * No toca el disponible ni el historial, y no puede tocarlos: se cambia una columna.
 * Que sigan igual lo verifica una prueba, porque es el tipo de efecto colateral que
 * aparece cuando a la tabla le agregan un campo mas.
 */
export async function moverSobreDeGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  grupo_id: number | null,
): Promise<void> {
  // Igual que al crear: un grupo vacio se rechaza con el mensaje del dominio, no con
  // un error de forma. Mover un sobre "a ningun lado" no es una operacion.
  if (grupo_id === null) throw new SinGrupo()

  const [grupo] = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(and(eq(grupos.id, grupo_id), eq(grupos.cartera_id, cartera_id)))
    .limit(1)

  if (!grupo) throw new GrupoDeOtraCartera()

  const [movido] = await db
    .update(sobres)
    .set({ grupo_id })
    .where(and(pertenencia(usuario_id, cartera_id), eq(sobres.id, sobre_id), isNull(sobres.eliminado_en)))
    .returning({ id: sobres.id })

  if (!movido) throw new SobreNoExiste()
}

/**
 * Archiva un sobre, y solo si su disponible es cero.
 *
 * Archivar es reversible y **no** es vaciar: un sobre archivado conserva su historial
 * y, por requerimiento, sigue recibiendo devoluciones, que se acumulan en su
 * disponible. Por eso archivar no exige que no tenga movimientos, solo que no deba.
 */
export async function archivarSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
): Promise<void> {
  const sobre = await buscarSobre(db, usuario_id, cartera_id, sobre_id, periodo)
  if (!sobre.cero) throw new SobreConSaldo(sobre.disponible)

  const [archivado] = await db
    .update(sobres)
    .set({ archivado: true })
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        eq(sobres.id, sobre_id),
        isNull(sobres.eliminado_en),
        eq(sobres.archivado, false),
      ),
    )
    .returning({ id: sobres.id })

  if (!archivado) throw new SobreNoExiste()

  await db
    .update(metas)
    .set({
      estado: 'abandonada',
      abandonada_en: new Date(),
      actualizado_en: new Date(),
    })
    .where(and(eq(metas.sobre_id, sobre_id), eq(metas.estado, 'activa')))
}

export async function restaurarSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
): Promise<void> {
  const [restaurado] = await db
    .update(sobres)
    .set({ archivado: false })
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        eq(sobres.id, sobre_id),
        isNull(sobres.eliminado_en),
        eq(sobres.archivado, true),
      ),
    )
    .returning({ id: sobres.id })

  if (!restaurado) throw new SobreNoExiste()
}

/**
 * Elimina un sobre de forma definitiva.
 *
 * Las dos condiciones son distintas y las dos hacen falta. Sin movimientos, porque un
 * sobre con historial se archiva. Y con disponible cero, porque un sobre sin
 * movimientos puede tener asignaciones �y entonces tiene plata adentro que se
 * perderia sin dejar rastro.
 *
 * Las asignaciones se van con el sobre por la FK en cascada, y solo se llega aqui
 * cuando no hay nada que perder.
 */
export async function eliminarSobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
): Promise<void> {
  const sobre = await buscarSobre(db, usuario_id, cartera_id, sobre_id, periodo)
  if (!sobre.eliminable) {
    // El saldo manda el mensaje primero: si ademas debe dinero, "vaciarlo" es lo que
    // el usuario tiene que hacer antes que cualquier otra cosa.
    if (!sobre.cero) throw new SobreConSaldo(sobre.disponible)
    throw new SobreConMovimientos()
  }

  const [borrado] = await db
    .delete(sobres)
    .where(and(pertenencia(usuario_id, cartera_id), eq(sobres.id, sobre_id)))
    .returning({ id: sobres.id })

  if (!borrado) throw new SobreNoExiste()
}

/** Si el disponible del sobre es negativo. Atajo sobre la vista del sobre. */
export async function disponibleEsNegativo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
): Promise<boolean> {
  return (await buscarSobre(db, usuario_id, cartera_id, sobre_id, periodo)).negativo
}

export { pertenencia as pertenenciaDeSobre }
