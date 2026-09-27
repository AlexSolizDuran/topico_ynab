import { sql } from 'drizzle-orm'
import type { Base } from '@/db/tipos'
import { crearCuenta, crearGrupo, crearMovimiento } from '../helpers/fabricas'
import { crearSobre } from '@/repos/sobres'

/**
 * Sobres de pruebas para `carteras`.
 *
 * Antes de `050-sobres` esto crea unas tablas **falsas** de `sobres` y `asignaciones`,
 * porque las de verdad no existian. Esas falsas tenian una columna `importe` en vez de
 * `monto`, y `saldos.ts` consultaba la que las pruebas tenian. Una copia que se parece
 * lo suficiente para pasar y no lo suficiente para funcionar es peor que no tener copia:
 * `050-sobres` creo las tablas de verdad y la consulta dejo de encontrar la columna en
 * produccion.
 *
 * Asi que ahora **no se falsea nada**. `crearSobreDePrueba` y `crearAsignacionDePrueba`
 * usan las tablas reales, con sus FK, sus `check` y sus columnas `not null`. Si el
 * modelo cambia, estas pruebas lo detectan.
 */
export async function crearTablasDeDinero(db: Base): Promise<void> {
  // Se mantiene por compatibilidad con las pruebas de `carteras`, que lo invocan para
  // dejar claro que las tablas existen. Ya existen de verdad, asi que no hay nada que
  // crear. La funcion se borra cuando se limpien esas llamadas.
}

/**
 * Inserta un sobre REAL de `050-sobres` y devuelve su id.
 *
 * El `grupo_id` es obligatorio, asi que se crea un grupo antes. Y el disponible se
 * deriva, asi que se pide leyendo el sobre de vuelta y no inventando un cero.
 */
export async function crearSobreDePrueba(
  db: Base,
  usuario_id: number,
  cartera_id: number,
  nombre = 'Comida',
): Promise<number> {
  const grupo_id = await crearGrupo(db, cartera_id, { nombre: `Grupo de ${nombre}` })
  const sobre = await crearSobre(db, usuario_id, cartera_id, grupo_id, nombre)
  return sobre.id
}

/** Inserta una cuenta REAL de `030-cuentas` y devuelve su id. */
export async function crearCuentaDePrueba(
  db: Base,
  cartera_id: number,
  saldo_inicial: string,
  nombre = 'Banco',
): Promise<number> {
  return crearCuenta(db, cartera_id, { nombre, saldo_inicial })
}

/** Inserta un movimiento real de `030-cuentas`, con su signo. */
export async function crearMovimientoDePrueba(
  db: Base,
  cuenta_id: number,
  monto: string,
): Promise<number> {
  return crearMovimiento(db, { cuenta_id, monto })
}

/** Inserta una asignacion real de `050-sobres`. El importe va como texto. */
export async function crearAsignacionDePrueba(
  db: Base,
  sobre_id: number,
  monto: string,
  periodo = '2026-01',
): Promise<void> {
  await db.execute(sql`
    insert into asignaciones (sobre_id, periodo, monto)
    values (${sobre_id}, ${periodo}, ${monto}::numeric)
  `)
}
