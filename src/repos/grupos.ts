import { and, asc, eq, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { grupos } from '../db/schema'
import type { Dinero } from '../dinero'
import { CarteraAjena, CarteraArchivada, operarSobreCartera } from './carteras'
import { disponibleDeSobre } from './fragmentos'
import { filas as filasDe } from './filas'

/**
 * `grupos`: categorias visuales de sobres.
 *
 * Un grupo es exactamente eso: un nombre, un orden y una bandera. No tiene saldo, ni
 * presupuesto, ni total guardado. Por eso no hay ni una columna de total: la suma de los
 * disponibles de sus sobres se consulta cada vez que se pinta, y sale de la misma
 * funcion de disponible que usa cada sobre suelto. Un total guardado se desincroniza en
 * el primer movimiento, y el usuario ve un numero que no es el de la suma.
 *
 * Lo que si tiene es el aislamiento. Igual que en `cuentas`, cada lectura y cada
 * escritura recibe `usuario_id` y `cartera_id`, y el filtro se cruza contra `carteras`
 * en la misma consulta. Un `cartera_id` sin comprobar no es un parametro de filtro: es
 * una forma de preguntar por la cartera de otro.
 */

export class GrupoNoExiste extends Error {
  constructor() {
    super('El grupo no existe en esta cartera.')
    this.name = 'GrupoNoExiste'
  }
}

export class OrdenDeGrupoInvalido extends Error {
  constructor() {
    super('El orden de un grupo tiene que ser un entero igual o mayor que cero.')
    this.name = 'OrdenDeGrupoInvalido'
  }
}

export class NombreDeGrupoEnUso extends Error {
  constructor() {
    super('Ya hay un grupo con ese nombre en esta cartera.')
    this.name = 'NombreDeGrupoEnUso'
  }
}

/**
 * El total de un grupo en un periodo: la suma de los disponibles de sus sobres.
 *
 * Se cuenta solo sobre los sobres **no archivados**, porque los archivados ya no
 * aparecen en el agrupamiento y el total tiene que ser el de lo que el usuario ve
 * desplegado. Los sobres archivados en negativo si se muestran aparte, en el panel de
 * desbordes, y no se restan del total: R11 pide que sigan visibles, no que el total del
 * grupo los oculte.
 *
 * La suma sale de `fragmentos.ts`, la misma funcion que cada sobre suelto, y por eso
 * el total y los disponibles de la fila siempre dan el mismo numero.
 */
export async function totalDeGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  grupo_id: number,
  periodo: string,
): Promise<Dinero> {
  const [fila] = await filasDe<{ total: Dinero }>(db, sql`
    select coalesce(sum(${disponibleDeSobre(sql.raw('s.id'), periodo)}), 0) as total
    from sobres s
    where s.grupo_id = ${grupo_id}
      and s.archivado = false
      and s.eliminado_en is null
      and exists (
        select 1 from grupos g
        join carteras c on c.id = g.cartera_id
        where g.id = s.grupo_id
          and g.cartera_id = ${cartera_id}
          and c.usuario_id = ${usuario_id}
          and c.eliminado_en is null
      )
  `)

  return fila?.total ?? '0.00'
}

/** Un grupo visto desde la cartera del usuario. */
export interface GrupoVisto {
  id: number
  nombre: string
  archivado: boolean
  orden: number
  creado_en: Date
}

function comoVisto(fila: typeof grupos.$inferSelect): GrupoVisto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    archivado: fila.archivado,
    orden: fila.orden,
    creado_en: fila.creado_en,
  }
}

/** Cruza el grupo con la cartera del usuario. Es el filtro de aislamiento. */
function pertenencia(usuario_id: number, cartera_id: number) {
  return and(
    sql`exists (
      select 1 from carteras c
      where c.id = ${grupos.cartera_id}
        and c.usuario_id = ${usuario_id}
        and c.id = ${cartera_id}
    )`,
  )
}

export async function crearGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  nombre: string,
): Promise<GrupoVisto> {
  await operarSobreCartera(db, usuario_id, cartera_id)

  const [creado] = await db
    .insert(grupos)
    .values({ cartera_id, nombre })
    .onConflictDoNothing()
    .returning()

  if (!creado) throw new NombreDeGrupoEnUso()
  return comoVisto(creado)
}

/** Grupos activos, en el orden que el usuario fijo. Los archivados no salen. */
export async function listarGrupos(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<GrupoVisto[]> {
  const filas = await db
    .select({ grupo: grupos })
    .from(grupos)
    .where(and(pertenencia(usuario_id, cartera_id), eq(grupos.archivado, false)))
    .orderBy(asc(grupos.orden), asc(grupos.id))

  return filas.map((f) => comoVisto(f.grupo))
}

/**
 * Grupos archivados, tambien en su orden.
 *
 * Archivar un grupo no lo borra ni toca sus sobres, asi que el sistema tiene que poder
 * devolverlo: un grupo archivado con sobres en rojo se sigue mostrando, y el unico
 * modo de deshacer el archivado es tener a mano el grupo.
 */
export async function listarGruposArchivados(
  db: Base,
  usuario_id: number,
  cartera_id: number,
): Promise<GrupoVisto[]> {
  const filas = await db
    .select({ grupo: grupos })
    .from(grupos)
    .where(and(pertenencia(usuario_id, cartera_id), eq(grupos.archivado, true)))
    .orderBy(asc(grupos.orden), asc(grupos.id))

  return filas.map((f) => comoVisto(f.grupo))
}

/** Un grupo por id, ya comprobado contra la cartera del usuario. */
export async function buscarGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  grupo_id: number,
): Promise<GrupoVisto> {
  const [fila] = await db
    .select({ grupo: grupos })
    .from(grupos)
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        eq(grupos.id, grupo_id),
      ),
    )
    .limit(1)

  if (!fila) throw new GrupoNoExiste()
  return comoVisto(fila.grupo)
}

export async function cambiarNombreGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  grupo_id: number,
  nombre: string,
): Promise<GrupoVisto> {
  const [renombrado] = await db
    .update(grupos)
    .set({ nombre })
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        eq(grupos.id, grupo_id),
        sql`not exists (
          select 1 from grupos otro
          where otro.cartera_id = ${grupos.cartera_id}
            and otro.id <> ${grupos.id}
            and lower(otro.nombre) = lower(${nombre})
        )`,
      ),
    )
    .returning()

  if (renombrado) return comoVisto(renombrado)

  // Cero filas tiene dos causas distintas y dan errores distintos: el grupo no es de
  // esta cartera, o el nombre ya lo usa otro grupo. Preguntar cual de las dos es, en
  // vez de asumir la primera, evita leakyar la pertenencia: un grupo ajeno no puede
  // terminar respondiendo "ese nombre ya existe", que confirmaria que el id existe.
  await buscarGrupo(db, usuario_id, cartera_id, grupo_id)
  throw new NombreDeGrupoEnUso()
}

/**
 * Cambia el orden.
 *
 * No toca nada mas. Un grupo no tiene saldo, y su total lo derivan sus sobres, asi que
 * reordenar no puede alterar ninguna cifra: y eso se verifica con una prueba, porque
 * es exactamente el tipo de efecto colateral que aparece cuando se agrega un campo mas
 * a la tabla.
 */
export async function cambiarOrdenGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  grupo_id: number,
  orden: number,
): Promise<GrupoVisto> {
  // El orden se valida en el repositorio y no solo en el formulario: es el unico
  // numero que escribe la aplicacion en esta tabla, y un `orden` negativo terminaria
  // primero en la lista con un `order by asc`. Que se note antes.
  if (!Number.isInteger(orden) || orden < 0) throw new OrdenDeGrupoInvalido()

  const [movido] = await db
    .update(grupos)
    .set({ orden })
    .where(and(pertenencia(usuario_id, cartera_id), eq(grupos.id, grupo_id)))
    .returning()

  if (!movido) throw new GrupoNoExiste()
  return comoVisto(movido)
}

/**
 * Archiva un grupo.
 *
 * Sin precondiciones. Archivar no es cerrar: los sobres que contiene siguen existiendo
 * con su disponible y su historial, y quedan fuera del agrupamiento visible. Por eso
 * aqui no se comprueba el saldo del grupo —no tiene— ni el de sus sobres, que es
 * justamente lo que el requerimiento dice que debe sobrevivir al archivado.
 *
 * Lo que si se rechaza es archivar dos veces, por la misma razon que en `cuentas`:
 * archivar algo ya archivado no es un error de estado, es una peticion redundante.
 */
export async function archivarGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  grupo_id: number,
): Promise<GrupoVisto> {
  const [archivado] = await db
    .update(grupos)
    .set({ archivado: true })
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        eq(grupos.id, grupo_id),
        eq(grupos.archivado, false),
      ),
    )
    .returning()

  if (!archivado) throw new GrupoNoExiste()
  return comoVisto(archivado)
}

export async function restaurarGrupo(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  grupo_id: number,
): Promise<GrupoVisto> {
  const [restaurado] = await db
    .update(grupos)
    .set({ archivado: false })
    .where(
      and(
        pertenencia(usuario_id, cartera_id),
        eq(grupos.id, grupo_id),
        eq(grupos.archivado, true),
      ),
    )
    .returning()

  if (!restaurado) throw new GrupoNoExiste()
  return comoVisto(restaurado)
}
