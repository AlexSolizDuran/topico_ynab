/**
 * Los errores de dominio de `traspasos`.
 *
 * En un archivo propio, y no agregado a `errores-movimientos.ts`, por el mismo motivo que
 * `errores-asignaciones.ts` esta aparte: las operaciones que fallan necesitan distinguir
 * los mismos casos, y duplicar las clases por archivo haria que un
 * `catch (e) { if (e instanceof CuentaAjena) }` dependa de que dos modulos importen la
 * misma clase y no dos copias.
 *
 * Lo que **no** esta aca, a proposito, y conviene tener presente al leer la lista corta:
 *
 * - `CuentaAjena` vive en `cuentas.ts` y la usan todos los repositorios.
 * - `ImporteCero` e `ImporteInvalido` viven en `errores-movimientos.ts` y
 *   `errores-asignaciones.ts`, porque el alta de traspaso valida el importe con el mismo
 *   `comoImporte` que el alta simple. Ver `D2`.
 *
 * El unico error propio es el de carteras distintas, y existe porque R1 lo pide **por
 * separado** de "esa cuenta no es tuya". Ver el comentario de la clase.
 */

/**
 * Las dos cuentas son de este usuario, pero de **carteras distintas**.
 *
 * R1 prohibe el traspaso entre carteras, y R1 lo prohibe como un caso propio: "esa cuenta
 * no es tuya" seria verdad —"las dos son suyas"— y no ayudaria. El usuario eligio dos
 * cuentas que tiene a la vista en carteras que el sistema mantiene separadas, y la
 * respuesta correcta es decirle que un traspaso no cruza carteras, no mandarlo a buscar un
 * error de tipeo. Es el mismo criterio con el que `SobreDeOtraCartera` existe en
 * `errores-movimientos.ts`.
 *
 * La confirmacion de `PREGUNTAS.md` #1 hace que el mensaje sea **este** y no "salvo que
 * sean de la misma moneda": la prohibicion es total, sin la excepcion de la misma moneda.
 * Ver D7.
 */
export class CuentasDeCarterasDistintas extends Error {
  constructor() {
    super('Un traspaso no puede cruzar carteras: las dos cuentas tienen que ser de la misma.')
    this.name = 'CuentasDeCarterasDistintas'
  }
}
