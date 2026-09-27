/**
 * El UNICO lugar de `src/` donde se convierte texto en entero.
 *
 * Existe por una razon concreta: la regla del dinero prohibe `Number(` en todo `src/`
 * porque un importe que pasa por un float pierde centavos, y un id nunca se convierte
 * en dinero. Aun asi, un `Number(...)` suelto para leer `?cartera=7` seria una puerta
 * trasera de la regla, y una puerta trasera se usa.
 *
 * Entonces la conversion se concentra aca, con un modulo excluido de la regla por
 * nombre —no por linea, que se corre al tocar el archivo— y con dos pruebas que
 * vigilan que el modulo no hable de dinero:
 *
 *   - `tests/regla-del-dinero.test.ts` exige que no mencione `Dinero` ni importe.
 *   - `tests/enteros.test.ts` cubre los bordes.
 *
 * El resultado sigue siendo un `number` porque los ids son `integer` en Postgres y
 * todas las consultas los piden asi; lo que no se hace es dejar que ese `number` se
 * confunda con un importe en el resto del codigo.
 */

const ENTERO = /^-?\d{1,15}$/

export class EnteroInvalido extends Error {
  constructor(campo: string) {
    super(`El valor de "${campo}" no es un entero valido.`)
    this.name = 'EnteroInvalido'
  }
}

/**
 * De texto a entero, o `null` si no es un entero.
 *
 * El `null` es para las rutas: `/cartera/abc` tiene que dar `notFound()` y no un error
 * 500, y al reves: un id que no existe y uno que no es un numero dan la misma
 * respuesta, para no confirmar que el identificador existe.
 */
export function aEntero(crudo: string | null | undefined): number | null {
  if (crudo === null || crudo === undefined) return null
  const texto = crudo.trim()
  if (!ENTERO.test(texto)) return null

  // La conversion ocurre una sola vez, y solo sobre algo que ya se sabe entero y
  // corto: 15 digitos caben de sobra en el entero seguro de JavaScript, que tiene
  // 16. El rango se acota con el patron, no con una comparacion de numeros.
  const valor = Number(texto)
  return Number.isSafeInteger(valor) ? valor : null
}

/** Igual que `aEntero`, pero lanza en vez de devolver `null`: para formularios. */
export function exigirEntero(crudo: string | null | undefined, campo: string): number {
  const valor = aEntero(crudo)
  if (valor === null) throw new EnteroInvalido(campo)
  return valor
}
