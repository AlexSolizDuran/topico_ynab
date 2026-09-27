/**
 * Los errores de dominio de las asignaciones.
 *
 * En un solo archivo y no junto a cada operacion, porque las tres operaciones que fallan
 * —tapar, mover y corregir— necesitan distinguir los mismos casos, y duplicar las
 * clases por archivo haria que `catch (e) { if (e instanceof TapaDemasiado) }` dependa
 * de que dos modulos importen la misma clase y no dos copias.
 *
 * Todos llevan el dato que hace falta para el mensaje. `TapaDemasiado` y
 * `DisponibleInsuficiente` reciben el disponible real, y quien los muestra formatea ese
 * string con la moneda de la cartera: el error no formatea, porque no sabe la moneda.
 */

/** El importe no es un numero que Postgres pueda castear a `numeric`. */
export class ImporteInvalido extends Error {
  constructor() {
    super('El importe no es un numero valido.')
    this.name = 'ImporteInvalido'
  }
}

/** El importe es cero o negativo, y una asignacion del usuario tiene que ser positiva. */
export class AsignacionNoPositiva extends Error {
  constructor() {
    super('El importe tiene que ser positivo.')
    this.name = 'AsignacionNoPositiva'
  }
}

export class AsignacionNoExiste extends Error {
  constructor() {
    super('Esa asignacion no existe, o no es una asignacion tuya.')
    this.name = 'AsignacionNoExiste'
  }
}

/** El sobre ya no esta en negativo, asi que no hay desborde que tapar. */
export class NoHayDesborde extends Error {
  constructor(nombre: string) {
    super(`"${nombre}" no esta en negativo, asi que no hay nada que tapar.`)
    this.name = 'NoHayDesborde'
  }
}

/** El monto a tapar excede al negativo. `negativo` es el disponible, en negativo. */
export class TapaDemasiado extends Error {
  constructor(negativo: string) {
    super(`No podes tapar mas de lo que el sobre debe: ${negativo}.`)
    this.name = 'TapaDemasiado'
  }
}

/** El disponible del origen no alcanza. `disponible` es lo que hay. */
export class DisponibleInsuficiente extends Error {
  constructor(disponible: string) {
    super(`El sobre de origen solo tiene ${disponible} disponibles.`)
    this.name = 'DisponibleInsuficiente'
  }
}

export class MismoSobre extends Error {
  constructor() {
    super('El origen y el destino son el mismo sobre.')
    this.name = 'MismoSobre'
  }
}
