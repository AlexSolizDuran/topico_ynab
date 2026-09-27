/**
 * Monedas de una cartera.
 *
 * La columna `carteras.moneda` es `char(3)` con un codigo ISO 4217. Este modulo
 * decide dos cosas distintas y es importante no confundirlas:
 *
 * 1. **Que codigo se acepta.** Cualquier ISO 4217 de tres letras mayusculas. No se
 *    valida contra una lista cerrada, porque una lista cerrada rechaza monedas
 *    reales que no alguien se acordo de escribir, y el resultado es un usuario al
 *    que se le dice que su moneda no existe.
 * 2. **Que moneda se ofrece en el selector.** `MONEDAS_CONOCIDAS` es la lista que
 *    la vista usa, y se puede ampliar sin tocar el modelo.
 *
 * Y la tercera, que es la que protege el dominio: **la moneda de una cartera no se
 * cambia**. No es una validacion, es la ausencia deliberada de una operacion.
 */

/** Monedas que el selector ofrece. Ampliar aqui es una linea. */
export const MONEDAS_CONOCIDAS = [
  'MXN',
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'JPY',
  'CHF',
  'ARS',
  'CLP',
  'COP',
  'PEN',
  'UYU',
  'BRL',
  'DOP',
  'GTQ',
  'CRC',
  'HNL',
  'AUD',
  'NZD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
] as const

/**
 * Un codigo de moneda tiene forma: tres letras mayusculas.
 *
 * Se valida la FORMA y no la pertenencia a una lista, por lo ya explicado arriba.
 * Tres letras mayusculas filtran `mxn` y `pesos` y dejan pasar `MXN` y `BOB`.
 */
export function esCodigoMoneda(valor: string): boolean {
  return /^[A-Z]{3}$/.test(valor)
}

/**
 * La moneda de una cartera ya no se puede cambiar.
 *
 * El mensaje explica la razon en vez de decir "operacion no permitida": cambiar la
 * moneda no renombra un dato, reexpresa todos los saldos historicos, y el sistema
 * no tiene tipo de cambio con el que hacerlo. Sin esa explicacion el usuario
 * piensa que es un permiso que le falta.
 */
export class MonedaInmutable extends Error {
  constructor() {
    super('La moneda de una cartera solo puede definirse al crearla. No se puede cambiar despues.')
    this.name = 'MonedaInmutable'
  }
}

/**
 * Rechaza un intento de cambiar la moneda de una cartera.
 *
 * Vive en la capa de entrada y no en el repositorio a proposito: el repositorio no
 * tiene ningun metodo que cambie la moneda, porque no existe la operacion. Lo que
 * existe es un formulario que Podria enviarla, y ese es el punto donde se rechaza.
 *
 * Un `enviada` vacio o ausente no es un cambio: el renombrado no lleva moneda, y no
 * tiene por que. Solo se compara cuando el formulario manda algo.
 */
export function exigirMonedaNoCambiada(anterior: string, enviada: string | undefined): void {
  if (!enviada) return
  if (enviada !== anterior) throw new MonedaInmutable()
}

/**
 * Dos carteras con monedas distintas no se pueden mezclar en una operacion.
 *
 * El error nombra las dos monedas porque el mensaje tiene que decir que hacer:
 * abrir la otra cartera. Un "operacion invalida" deja al usuario adivinando.
 */
export class MonedaDistinta extends Error {
  readonly moneda_origen: string
  readonly moneda_destino: string

  constructor(uno: string, otro: string) {
    super(
      `No se puede mover dinero entre carteras con monedas distintas (${uno} y ${otro}). ` +
        'El sistema no hace conversion de moneda: opera cada cartera por separado.',
    )
    this.name = 'MonedaDistinta'
    this.moneda_origen = uno
    this.moneda_destino = otro
  }
}

/** Lo mínimo que hay que saber de una cartera para comparar su moneda. */
export interface ConMoneda {
  moneda: string
}

/**
 * Exige que dos carteras compartan moneda. La comparacion de monedas vive ACA y
 * en ningun otro lugar.
 *
 * `070-traspasos` y `080-recurrencias` la llaman en vez de repetir la comparacion:
 * dos comparaciones de monedas en el codigo divergen tarde, y cuando divergen el
 * error aparece en una operacion que si deberia haber pasado.
 */
export function exigirMismaMoneda<T extends ConMoneda>(una: T, otra: T): void {
  if (una.moneda !== otra.moneda) {
    throw new MonedaDistinta(una.moneda, otra.moneda)
  }
}
