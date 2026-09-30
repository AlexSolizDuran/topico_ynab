/**
 * Los errores de dominio de los movimientos.
 *
 * En un solo archivo y no junto a cada operacion, por el mismo motivo que
 * `errores-asignaciones.ts`: las operaciones que fallan necesitan distinguir los mismos
 * casos, y duplicar las clases por archivo haria que un `catch (e) { if (e instanceof
 * MovimientoNoExiste) }` dependa de que dos modulos importen la misma clase y no dos
 * copias.
 *
 * Los errores de cartera ajena y de sobre de otra cartera son **distintos a proposito**.
 * R3 pide rechazar cuando la cuenta y el sobre son de carteras distintas, y "ese sobre no
 * existe en esta cartera" seria verdad pero no ayudaria: el usuario tiene el sobre a la
 * vista, sabe que existe, y la respuesta lo mandaria a buscar un error de tipeo. Ver D2.
 */

/** El movimiento no existe, no es de este usuario, o ya fue eliminado. */
export class MovimientoNoExiste extends Error {
  constructor() {
    super('Ese movimiento no existe, o no es tuyo.')
    this.name = 'MovimientoNoExiste'
  }
}

/** El movimiento ya fue borrado. Hay que restaurarlo antes de tocarlo. */
export class MovimientoEliminado extends Error {
  constructor() {
    super('Este movimiento esta eliminado: restauralo antes de corregirlo.')
    this.name = 'MovimientoEliminado'
  }
}

/**
 * El movimiento no estaba eliminado, y el pedido era restaurarlo.
 *
 * El hermano de `MovimientoEliminado`, y va en sentido contrario: ese dice "primero
 * restauralo", este dice "ya esta vivo". Son errores distintos porque el que recibe la
 * peticion tiene que distinguirlos —un boton de "restaurar" que aparece sobre un movimiento
 * vivo es un bug de la vista— y un unico error con dos mensajes posibles no lo permitiria.
 */
export class MovimientoYaEliminado extends Error {
  constructor() {
    super('Este movimiento no esta eliminado.')
    this.name = 'MovimientoYaEliminado'
  }
}

/** El sobre existe, pero es de otra cartera que la de la cuenta del movimiento. */
export class SobreDeOtraCartera extends Error {
  constructor() {
    super('El sobre es de otra cartera que la de la cuenta.')
    this.name = 'SobreDeOtraCartera'
  }
}

/** El importe es cero. R1 lo prohibe: un movimiento de cero existe por historial y no mueve nada. */
export class ImporteCero extends Error {
  constructor() {
    super('El importe debe ser distinto de cero.')
    this.name = 'ImporteCero'
  }
}

/**
 * Una pata de un traspaso no se edita.
 *
 * No es una limitacion disfrazada: en `060` no hay forma de crear un traspaso, asi que
 * ninguna pata existe todavia en la interfaz. Editar el importe de una sola rompe el
 * emparejamiento de las dos, que es lo que `traspasos` R1 exige. Ver D6.
 */
export class PataDeTraspaso extends Error {
  constructor() {
    super('Este movimiento es una pata de un traspaso: no se puede editar por separado.')
    this.name = 'PataDeTraspaso'
  }
}

/**
 * El alta de un traspaso todavia no existe.
 *
 * R1 pide distinguir entre gasto, ingreso y traspaso, y `060` lo hace en la columna y en
 * el filtro. Lo que **no** hace es el formulario de las dos patas: ese es `070-traspasos`,
 * que es quien sabe hacerlas. Ver D5.
 */
export class TraspasoNoRegistrable extends Error {
  constructor() {
    super('Un traspaso se registra con su par de movimientos, no con un alta simple.')
    this.name = 'TraspasoNoRegistrable'
  }
}

/**
 * Un traspaso no recibe sobre.
 *
 * El dinero de una pata de traspaso entro a la cuenta desde otro lugar, y meterla en un
 * sobre descuenta el disponible de un sobre al que nunca se le asigno nada.
 */
export class TraspasoNoAsignable extends Error {
  constructor() {
    super('Un traspaso no se asigna a un sobre.')
    this.name = 'TraspasoNoAsignable'
  }
}
