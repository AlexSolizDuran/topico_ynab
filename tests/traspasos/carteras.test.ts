import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas, unaFila } from '../helpers/pg'
import type { BaseDePruebas } from '../helpers/pg'
import { crearCartera, crearCuenta, crearUsuario } from '../helpers/fabricas'
import { CuentaAjena } from '@/repos/cuentas'
import { CuentasDeCarterasDistintas } from '@/repos/errores-traspasos'
import { filas } from '@/repos/filas'
import { registrarTraspaso } from '@/repos/traspasos'

/**
 * 070-traspasos, grupo 2: carteras, prohibicion y cuenta archivada.
 *
 * Lo que se verifica aca tiene dos mitades, y las dos importan:
 *
 * - **Que el traspaso entre carteras no se puede.** La confirmacion de `PREGUNTAS.md` #1 lo
 *   prohibio **por completo**, sin la excepcion de la misma moneda que alguna vez se
 *   estudiaron. Por eso hay una prueba con dos carteras de la misma moneda: si alguien
 *   reintrodujera la excepcion, esa prueba es la que cae.
 * - **Que los dos rechazos tienen mensajes distintos.** "No es tuya" y "son de carteras
 *   distintas" son cosas distintas para quien esta usando la pantalla: una manda a buscar un
 *   error de tipeo, la otra a entender que un traspaso no cruza carteras. Ver D3 y D7.
 */

let base: BaseDePruebas
let usuario: number
let cartera: number
let origen: number

let cuentas = 0
function nombreCuenta(prefijo = 'Cuenta'): string {
  return `${prefijo} ${cuentas++}`
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  origen = await crearCuenta(base.db, cartera, { nombre: nombreCuenta('Billetera'), saldo_inicial: '1000.00' })
})

afterEach(async () => {
  await base.cerrar()
})

/** Una cuenta en una segunda cartera **del mismo usuario**. */
async function cuentaEnOtraCartera(nombreCartera: string, opciones: { moneda?: string; archivada?: boolean } = {}): Promise<number> {
  const otra = await crearCartera(base.db, usuario, { nombre: nombreCartera, moneda: opciones.moneda })
  return crearCuenta(base.db, otra, { nombre: nombreCuenta('Lejos'), archivada: opciones.archivada ?? false })
}

async function cuentaEnCarteraAjena(archivada = false): Promise<number> {
  const ajena = await crearCartera(base.db, await crearUsuario(base.db), { nombre: 'Suyo' })
  return crearCuenta(base.db, ajena, { nombre: nombreCuenta('Ajena'), archivada })
}

async function totalDeGrupos(): Promise<number> {
  const [fila] = await filas<{ total: number }>(base.db, sql`
    select count(*)::int as total from grupos_transferencia
  `)
  return fila?.total ?? 0
}

async function estaArchivada(cuenta_id: number): Promise<boolean> {
  const fila = await unaFila<{ archivada: boolean }>(base.db, sql`
    select archivada from cuentas where id = ${cuenta_id}::int
  `)
  return fila.archivada
}

describe('070: el traspaso entre carteras esta prohibido por completo', () => {
  it('rechaza dos cuentas de carteras distintas del mismo usuario', async () => {
    const destino = await cuentaEnOtraCartera('Viajes')

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: origen,
        destino_cuenta_id: destino,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentasDeCarterasDistintas)

    expect(await totalDeGrupos()).toBe(0)
  })

  it('tambien lo rechaza cuando las dos carteras tienen la misma moneda', async () => {
    // Es la prueba que sostiene la confirmacion de `PREGUNTAS.md` #1. Con la excepcion de la
    // misma moneda, estas dos cuentas serian validas y el traspaso tendria que salir.
    const destino = await cuentaEnOtraCartera('Igual', { moneda: 'MXN' })

    const propia = await crearCuenta(base.db, cartera, { nombre: nombreCuenta('Propia'), saldo_inicial: '1000.00' })

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: propia,
        destino_cuenta_id: destino,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'Misma moneda, distinta cartera',
      }),
    ).rejects.toBeInstanceOf(CuentasDeCarterasDistintas)
  })

  it('el mensaje de carteras distintas es propio y no el de cuenta ajena', async () => {
    const destino = await cuentaEnOtraCartera('Viajes')

    const porCarteras = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500',
      fecha: '2026-03-10',
      descripcion: 'No deberia',
    }).catch((e: unknown) => e)

    const ajena = await cuentaEnCarteraAjena()
    const porCuenta = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: ajena,
      monto: '500',
      fecha: '2026-03-10',
      descripcion: 'No deberia',
    }).catch((e: unknown) => e)

    expect(porCarteras).toBeInstanceOf(CuentasDeCarterasDistintas)
    expect(porCuenta).toBeInstanceOf(CuentaAjena)
    expect((porCarteras as Error).message).not.toBe((porCuenta as Error).message)
    expect((porCarteras as Error).message).toContain('no puede cruzar carteras')
  })
})

describe('070: el diagnostico distingue los rechazos', () => {
  it('una cuenta de otro usuario es "no es tuya"', async () => {
    const ajena = await cuentaEnCarteraAjena()

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: origen,
        destino_cuenta_id: ajena,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentaAjena)
  })

  it('una cuenta que no existe da el mismo error que una ajena, y el mismo mensaje', async () => {
    const ajena = await cuentaEnCarteraAjena()

    const porInexistente = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: 999_999,
      monto: '500',
      fecha: '2026-03-10',
      descripcion: 'No deberia',
    }).catch((e: unknown) => e)

    const porAjena = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: ajena,
      monto: '500',
      fecha: '2026-03-10',
      descripcion: 'No deberia',
    }).catch((e: unknown) => e)

    // Distinguirlas revelaria que el id existe, que es informacion de la cartera de otro.
    expect(porInexistente).toBeInstanceOf(CuentaAjena)
    expect((porInexistente as Error).message).toBe((porAjena as Error).message)
  })

  it('tampoco revela la cartera ajena cuando la cuenta es de otro usuario', async () => {
    // Al reves: una cuenta mia y otra ajena, y una ajena y otra mia. Los dos casos son
    // "no es tuya", y ninguno dice quantas cuentas propias habia.
    const ajena = await cuentaEnCarteraAjena()

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: ajena,
        destino_cuenta_id: origen,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentaAjena)
  })
})

describe('070: la cuenta de destino archivada vuelve a la lista', () => {
  it('reactiva una cuenta archivada que recibe el traspaso', async () => {
    const destino = await crearCuenta(base.db, cartera, {
      nombre: nombreCuenta('Vieja'),
      archivada: true,
    })
    expect(await estaArchivada(destino)).toBe(true)

    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500',
      fecha: '2026-03-10',
      descripcion: 'A una cuenta archivada',
    })

    // `cuentas` R5: la cuenta "sigue aceptando movimientos hasta alcanzar el cero". Ver D4.
    expect(await estaArchivada(destino)).toBe(false)
  })

  it('no toca una cuenta que no estaba archivada', async () => {
    // `reactivarCuenta` es idempotente: su `where` pide `archivada = true`, asi que una cuenta
    // activa no cambia. Ver D4 y la prueba 6.5 de `060-cuentas`.
    const destino = await crearCuenta(base.db, cartera, { nombre: nombreCuenta('Normal') })
    expect(await estaArchivada(destino)).toBe(false)

    await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500',
      fecha: '2026-03-10',
      descripcion: 'A una cuenta normal',
    })

    expect(await estaArchivada(destino)).toBe(false)
  })

  it('un traspaso rechazado no reactiva una cuenta archivada', async () => {
    // La prueba de que la reactivacion esta **adentro** de la transaccion y no despues: si
    // fuera una accion aparte, la cuenta archivada de la cartera ajena quedaria activa y con
    // el estado a medio camino. Ver D4.
    const ajena = await cuentaEnCarteraAjena(true)

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: origen,
        destino_cuenta_id: ajena,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentaAjena)

    expect(await estaArchivada(ajena)).toBe(true)
  })
})

describe('070: el comentario de la tabla ya no afirma que un traspaso cruce carteras', () => {
  /**
   * El bloque de comentario que precede a `gruposTransferencia`.
   *
   * Se corta por la declaracion de la tabla y para 2000 caracteres hacia atras, en vez de
   * usar un archivo aparte: la interesa el comentario **de esa tabla**, y el resto del
   * archivo no tiene que ver con esto.
   */
  function comentarioDelGrupo(): string {
    const fuente = readFileSync('src/db/tablas/cuentas.ts', 'utf8')
    const corte = fuente.indexOf('export const gruposTransferencia')
    return fuente.slice(Math.max(0, corte - 2000), corte)
  }

  it('no queda la afirmacion de que las dos patas pueden estar en carteras distintas', () => {
    // Decía "las dos pueden estar en carteras distintas -de hecho es el caso normal-", y era
    // la clase de comentario que induce a error justo al leer `070`. `060` ya corrigio el
    // equivalente de `fragmentos.ts` por lo mismo. Ver D7.
    const bloque = comentarioDelGrupo()
    expect(bloque).toContain('grupos_transferencia')
    expect(bloque.toLowerCase()).not.toContain('el caso normal')
    expect(bloque.toLowerCase()).not.toMatch(/pueden estar en carteras distintas/)
  })

  it('y el comentario dice que la prohibicion es total, sin excepcion de moneda', () => {
    const bloque = comentarioDelGrupo()
    expect(bloque).toContain('prohibicion total')
    expect(bloque).toContain('misma moneda')
  })
})
