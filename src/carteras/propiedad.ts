/**
 * La cartera es duena de sus datos, y de ella se deduce la cartera de un
 * movimiento.
 *
 * `carteras` R3: cada cuenta, sobre, grupo y movimiento pertenece a una unica
 * cartera, y **el sistema deduce la cartera de un movimiento a partir de la cuenta
 * con la que opera**. Un movimiento con `cartera_id` propio podria contradecir el de
 * su cuenta; la forma de garantizar que no se contradice es que no exista el
 * campo.
 *
 * Aqui viven los tipos minimos y las dos reglas. Son deliberadamente
 * estructurales —solo `cartera_id`, sin importar tablas— para que se puedan probar
 * sin base de datos y para que `030-cuentas` y `050-sobres` los reutilicen tal
 * cual.
 */

/** Una cuenta, vista solo por la cartera a la que pertenece. */
export interface ConCartera {
  cartera_id: number
}

/**
 * La cartera de un movimiento es la de su cuenta.
 *
 * Se deduce; no se acepta como parametro ni se compara contra otro valor. Comparar
 * lo que no puede divergir es trabajo de mas que ademas devolveria un error
 * incomprensible.
 */
export function carteraDeCuenta(cuenta: ConCartera): number {
  return cuenta.cartera_id
}

/** Dos elementos de carteras distintas no pueden aparecer en la misma operacion. */
export class CarterasDistintas extends Error {
  readonly cartera_una: number
  readonly cartera_otra: number

  constructor(una: number, otra: number) {
    super(
      `No se puede mezclar una cuenta de la cartera ${una} con un sobre de la cartera ${otra}. ` +
        'Cada elemento tiene que pertenecer a la misma cartera.',
    )
    this.name = 'CarterasDistintas'
    this.cartera_una = una
    this.cartera_otra = otra
  }
}

/**
 * Exige que una cuenta y un sobre pertenezcan a la misma cartera.
 *
 * Sin este control, un traspaso moveria dinero de una cartera MXN a un sobre de
 * una cartera USD y el saldo dejaria de cuadrar sin que nada lo advierta.
 */
export function exigirMismaCartera(uno: ConCartera, otro: ConCartera): void {
  if (uno.cartera_id !== otro.cartera_id) {
    throw new CarterasDistintas(uno.cartera_id, otro.cartera_id)
  }
}
