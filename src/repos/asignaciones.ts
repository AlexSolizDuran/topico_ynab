import { and, desc, eq, sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import { asignaciones, sobres } from '../db/schema'
import type { Dinero } from '../dinero'
import { esCero, esNegativo } from '../dinero'
import { buscarSobre, disponibleDeSobre, existeSobre, SobreArchivado } from './sobres'
import { filas as filasDe } from './filas'
import {
  AsignacionNoExiste,
  AsignacionNoPositiva,
  DisponibleInsuficiente,
  ImporteInvalido,
  MismoSobre,
  NoHayDesborde,
  TapaDemasiado,
} from './errores-asignaciones'

/**
 * Asignaciones: cuanto dinero se le poke al sobre, y en que periodo.
 *
 * Los errores se reexportan desde aca porque quien llama a estas operaciones es quien
 * decide que mensaje ver, y no tiene por que saber en que archivo esta cada clase.
 *
 * Las asignaciones son la mitad positiva del disponible. El usuario solo puede crear
 * filas **positivas** —lo valida el formulario y lo vuelve a imponer un `check` de
 * Postgres— y la unica fila negativa posible es la que escribe `moverEntreSobres` en el
 * sobre de origen, con `motivo = 'reasignacion'`. Ver el comentario de la tabla para
 * por que hace falta.
 *
 * El disponible no se guarda. Este archivo **agrega filas** y, al corregir, cambia el
 * importe de una. No hay ningun `update` de saldo ni ninguna operacion de recalculo,
 * porque no hay nada que recalcular: borrar o corregir una fila basta para que el
 * disponible de la siguiente lectura salga distinto.
 *
 * Y antes de arreglar el disponible se decide si hay que arreglar algo mas. Por eso
 * el importe de cada sobre se consulta al mismo periodo que la pantalla que lo pide:
 * agregar a un sobre de mayo mirando junio daria disponible de junio con plata de mayo.
 */

/**
 * El importe es un numero valido para Postgres.
 *
 * Antes de castearlo a `numeric` hay que asegurarse de que el string lo sea, porque
 * `"12,50"::numeric` es un error de Postgres y no un `false`: si el importe llega mal
 * desde el formulario, la operacion revienta con un 500 en vez de con el mensaje que
 * el usuario necesita leer. El mismo cuidado aplica a cualquier `::numeric` de este
 * archivo.
 *
 * Esto no convierte nada a `number`. El `Number` con el que se comparaba queda
 * justamente por esta linea: comparar `"100" < "50"` como texto da `true`.
 */
const IMPORTE = /^-?\d{1,14}(\.\d{1,2})?$/

function comoImporte(importe: string): Dinero {
  if (!IMPORTE.test(importe.trim())) throw new ImporteInvalido()
  return importe.trim()
}

/**
 * Asigna dinero a un sobre para un periodo.
 *
 * Las comprobaciones van en el orden de los mensajes que ve el usuario: primero que el
 * sobre exista y sea de esta cartera, despues que no este archivado, y por ultimo que
 * el importe sea positivo. Al reves, asignarle a un sobre archivado responderia "el
 * importe tiene que ser positivo", que es cierto y no ayuda a nadie.
 */
export async function asignarASobre(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
  monto: string,
): Promise<{ id: number; monto: Dinero; periodo: string }> {
  const sobre = await buscarSobre(db, usuario_id, cartera_id, sobre_id, periodo)
  if (sobre.archivado) throw new SobreArchivado()
  if (!esPositivo(comoImporte(monto))) throw new AsignacionNoPositiva()

  const [creada] = await db
    .insert(asignaciones)
    .values({ sobre_id, periodo, monto: comoImporte(monto) })
    .returning({
      id: asignaciones.id,
      monto: asignaciones.monto,
      periodo: asignaciones.periodo,
    })

  if (!creada) throw new Error('asignarASobre no devolvio la asignacion')
  return creada
}

/** Un importe es positivo si no lleva signo y no es cero. `src/dinero.ts` lo sabe. */
function esPositivo(importe: Dinero): boolean {
  return !esNegativo(importe) && !esCero(importe)
}

/** Corrijo el importe de una asignacion. El disponible se ajusta solo. */
export async function corregirAsignacion(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  asignacion_id: number,
  monto: string,
): Promise<{ id: number; monto: Dinero }> {
  const importe = comoImporte(monto)
  // Una reasignacion es la contraparte de un movimiento entre sobres, y corregir su
  // importe dejaria el disponible descuadrado respecto del sobre destino. Se corrige
  // el par completo, con `corregirReasignacion`.
  if (!esPositivo(importe)) throw new AsignacionNoPositiva()

  const [corregida] = await db
    .update(asignaciones)
    .set({ monto: importe })
    .where(
      and(
        eq(asignaciones.id, asignacion_id),
        eq(asignaciones.motivo, 'usuario'),
        sql`exists (
          select 1 from sobres s
          join carteras c on c.id = s.cartera_id
          where s.id = ${asignaciones.sobre_id}
            and s.cartera_id = ${cartera_id}
            and c.usuario_id = ${usuario_id}
        )`,
      ),
    )
    .returning({ id: asignaciones.id, monto: asignaciones.monto })

  if (!corregida) throw new AsignacionNoExiste()
  return corregida
}

/**
 * Las asignaciones de un sobre, de la mas reciente a la mas antigua.
 *
 * El disponible no interviene: son las filas, con su periodo y su motivo, para que la
 * pantalla pueda mostrar de donde sale cada parte del saldo.
 */
export async function listarAsignaciones(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
): Promise<
  Array<{
    id: number
    periodo: string
    monto: Dinero
    motivo: 'usuario' | 'reasignacion'
    creado_en: Date
  }>
> {
  await existeSobre(db, usuario_id, cartera_id, sobre_id)

  return db
    .select({
      id: asignaciones.id,
      periodo: asignaciones.periodo,
      monto: asignaciones.monto,
      motivo: asignaciones.motivo,
      creado_en: asignaciones.creado_en,
    })
    .from(asignaciones)
    .where(eq(asignaciones.sobre_id, sobre_id))
    .orderBy(desc(asignaciones.periodo), desc(asignaciones.id))
}

/**
 * Tapa un desborde asignandole dinero al sobre que esta en negativo.
 *
 * El monto no puede exceder al negativo: es lo que pide el requerimiento y tambien lo
 * que evita que "tapar" termine siendo "asignar de mas". Tapar parcialmente si se
 * permite, y el disponible queda en negativo todavia.
 *
 * La precondicion y la escritura van en la misma transaccion porque se comprueban
 * sobre el mismo valor. Si se hicieran por separado, dos taps a la vez podrian pasar
 * los dos la comprobacion sobre el mismo disponible y tapar el doble.
 */
export async function taparDesborde(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
  monto: string,
): Promise<{ disponible: Dinero; tapado: Dinero }> {
  const importe = comoImporte(monto)
  if (!esPositivo(importe)) throw new AsignacionNoPositiva()

  return db.transaction(async (tx) => {
    const conexion = tx as Base
    const sobre = await buscarSobre(conexion, usuario_id, cartera_id, sobre_id, periodo)
    if (sobre.archivado) throw new SobreArchivado()
    if (!sobre.negativo) throw new NoHayDesborde(sobre.nombre)

    if (!(await cabeEnDesborde(conexion, importe, sobre.disponible))) {
      throw new TapaDemasiado(sobre.disponible)
    }

    await asignar(conexion, sobre_id, periodo, importe)
    return {
      disponible: await disponibleDeSobre(conexion, usuario_id, cartera_id, sobre_id, periodo),
      tapado: importe,
    }
  })
}

/** El monto a tapar no excede al negativo, comparado en la base. */
async function cabeEnDesborde(
  db: Base,
  monto: Dinero,
  disponible: Dinero,
): Promise<boolean> {
  const [fila] = await filasDe<{ cabe: boolean }>(
    db,
    sql`select (${monto}::numeric <= -(${disponible})::numeric) as cabe`,
  )
  return fila?.cabe === true
}

/**
 * Mueve dinero de un sobre a otro.
 *
 * No crea ni destruye dinero: la suma de los disponibles de la cartera no se mueve, ni
 * el dinero suelto, ni el patrimonio. El destino recibe una asignacion positiva, igual
 * que si el usuario la hubiera hecho a mano, y el origen recibe la contraparte con
 * `motivo = 'reasignacion'`, que es la unica fila del sistema que puede ser negativa.
 *
 * El disponible del origen se comprueba contra el valor de la base y no contra el de
 * la pantalla, y la comprobacion y las dos escrituras van en la misma transaccion: dos
 * movimientos a la vez no pueden pasar los dos sobre el mismo disponible.
 */
export async function moverEntreSobres(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  origen_id: number,
  destino_id: number,
  periodo: string,
  monto: string,
): Promise<{ origen: Dinero; destino: Dinero; movido: Dinero }> {
  const importe = comoImporte(monto)
  if (!esPositivo(importe)) throw new AsignacionNoPositiva()
  if (origen_id === destino_id) throw new MismoSobre()

  return db.transaction(async (tx) => {
    const conexion = tx as Base
    const origen = await buscarSobre(conexion, usuario_id, cartera_id, origen_id, periodo)
    const destino = await buscarSobre(conexion, usuario_id, cartera_id, destino_id, periodo)

    // El destino recibe una asignacion, y R4 y R11 dicen que un sobre archivado no
    // recibe asignaciones. `asignarASobre` ya lo rechaza; esta ruta escribe con el
    // helper privado y se saltaria el chequeo, asi que se repite aca.
    //
    // El origen, en cambio, solo pierde disponible: eso es una reasignacion, no una
    // asignacion del usuario, y R11 no lo prohibe. Asi que el dinero de una devolucion
    // de un sobre archivado se puede mudar a otro sobre, que es lo que el usuario
    // querria hacer.
    if (destino.archivado) throw new SobreArchivado()

    const disponibleOrigen = origen.disponible
    if (!(await alcanza(conexion, importe, disponibleOrigen))) {
      throw new DisponibleInsuficiente(disponibleOrigen)
    }

    await asignar(conexion, destino_id, periodo, importe)
    await reasignarDesde(conexion, origen_id, periodo, importe)

    return {
      origen: await disponibleDeSobre(conexion, usuario_id, cartera_id, origen_id, periodo),
      destino: await disponibleDeSobre(conexion, usuario_id, cartera_id, destino_id, periodo),
      movido: importe,
    }
  })
}

/** El disponible del origen alcanza para mover ese monto, comparado en la base. */
async function alcanza(db: Base, monto: Dinero, disponible: Dinero): Promise<boolean> {
  const [fila] = await filasDe<{ alcanza: boolean }>(
    db,
    sql`select (${disponible}::numeric >= ${monto}::numeric) as alcanza`,
  )
  return fila?.alcanza === true
}

async function asignar(
  db: Base,
  sobre_id: number,
  periodo: string,
  monto: Dinero,
): Promise<void> {
  const [creada] = await db
    .insert(asignaciones)
    .values({ sobre_id, periodo, monto, motivo: 'usuario' })
    .returning({ id: asignaciones.id })

  if (!creada) throw new Error('no se registro la asignacion')
}

/**
 * La contraparte que sale del origen, con el signo cambiado.
 *
 * El signo se invierte en SQL y no en JavaScript por la misma razon de siempre: restar
 * sobre un string de importe es aritmetica sobre dinero fuera de la base, y
 * `-('100.00')` en JS es un number con la perdida de cents que arrastra.
 */
async function reasignarDesde(
  db: Base,
  sobre_id: number,
  periodo: string,
  monto: Dinero,
): Promise<void> {
  const [salida] = await filasDe<{ id: number }>(db, sql`
    insert into asignaciones (sobre_id, periodo, motivo, monto)
    values (${sobre_id}, ${periodo}, 'reasignacion', -(${monto}::numeric))
    returning id
  `)

  if (!salida) throw new Error('no se registro la reasignacion')
}

/**
 * El importe que se puede mover desde un sobre sin dejarlo negativo.
 *
 * Es el disponible completo, no un tope mas conveniente: mover mas de lo que hay es
 * justamente lo que el requerimiento manda rechazar.
 */
export async function disponibleMovible(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  sobre_id: number,
  periodo: string,
): Promise<Dinero> {
  const disponible = await disponibleDeSobre(db, usuario_id, cartera_id, sobre_id, periodo)
  return esNegativo(disponible) ? '0.00' : disponible
}

export {
  AsignacionNoExiste,
  AsignacionNoPositiva,
  DisponibleInsuficiente,
  ImporteInvalido,
  MismoSobre,
  NoHayDesborde,
  TapaDemasiado,
} from './errores-asignaciones'
