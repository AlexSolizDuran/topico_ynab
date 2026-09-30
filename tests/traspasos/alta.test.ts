import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas, unaFila } from '../helpers/pg'
import type { BaseDePruebas } from '../helpers/pg'
import {
  crearCartera,
  crearCuenta,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import { filas } from '@/repos/filas'
import { registrarMovimiento } from '@/repos/movimientos'
import { registrarTraspaso } from '@/repos/traspasos'
import { TraspasoNoRegistrable } from '@/repos/errores-movimientos'
import { CuentaAjena } from '@/repos/cuentas'

/**
 * 070-traspasos, grupo 1: el alta del grupo y sus patas.
 *
 * La pregunta que estas pruebas repiten es una sola: **¿las dos patas salen de la misma
 * sentencia?** Si el emparejamiento dependiera de que el codigo siga dos `insert`, habria
 * un camino en el que una se inserta y la otra no, y ese camino es un traspaso descuadrado.
 * Por eso casi todas las pruebas de aca miran las filas que quedaron, y no lo que la funcion
 * devolvio. Ver D1.
 *
 * Y la segunda, mas aburrida pero igual de importante: **¿la cartera se deduce?** La firma
 * de `registrarTraspaso` no tiene `cartera_id`, y estas pruebas pasan cuentas de otra
 * persona exigiendo que no se escriba nada. Ver D1 y D3.
 */

let base: BaseDePruebas
let usuario: number
let cartera: number
let origen: number
let destino: number

let cuentas = 0
/** `cuentas` exige nombre unico dentro de la cartera, asi que cada cuenta necesita el suyo. */
function nombreCuenta(prefijo = 'Cuenta'): string {
  return `${prefijo} ${cuentas++}`
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  origen = await crearCuenta(base.db, cartera, { nombre: nombreCuenta('Billetera'), saldo_inicial: '1000.00' })
  destino = await crearCuenta(base.db, cartera, { nombre: nombreCuenta('Banco'), saldo_inicial: '0.00' })
})

afterEach(async () => {
  await base.cerrar()
})

interface Pata {
  id: number
  cuenta_id: number
  monto: string
  descripcion: string
  fecha: string
  transferencia_id: number
  tipo: string
  sobre_id: number | null
}

/** Las patas del grupo, ordenadas por importe para que el par sea estable. */
async function patas(grupo_id: number): Promise<Pata[]> {
  return filas<Pata>(base.db, sql`
    select
      m.id::int as id,
      m.cuenta_id::int as cuenta_id,
      m.monto::text as monto,
      m.descripcion,
      to_char(m.fecha, 'YYYY-MM-DD') as fecha,
      m.transferencia_id::int as transferencia_id,
      m.tipo::text as tipo,
      m.sobre_id::int as sobre_id
    from movimientos m
    where m.transferencia_id = ${grupo_id}::int
    order by m.monto
  `)
}

/** La fila del grupo, tal como quedo en la base. */
async function grupo(grupo_id: number) {
  return unaFila<{ id: number; descripcion: string; fecha: string }>(base.db, sql`
    select
      g.id::int as id,
      g.descripcion,
      to_char(g.fecha, 'YYYY-MM-DD') as fecha
    from grupos_transferencia g
    where g.id = ${grupo_id}::int
  `)
}

async function totalDeGrupos(): Promise<number> {
  const [fila] = await filas<{ total: number }>(base.db, sql`
    select count(*)::int as total from grupos_transferencia
  `)
  return fila?.total ?? 0
}

describe('070: el alta de un traspaso', () => {
  it('registra las dos patas emparejadas, con signo opuesto y el mismo grupo', async () => {
    const creado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '5000',
      fecha: '2026-03-10',
      descripcion: 'Ahorro del mes',
    })

    const [, positiva] = await patas(creado.grupo_id)
    expect(creado.origen_id).toBeTypeOf('number')
    expect(creado.destino_id).toBeTypeOf('number')
    expect(creado.grupo_id).toBeTypeOf('number')

    // Las dos del mismo grupo, del mismo tipo, y cada una en su cuenta.
    expect(positiva?.transferencia_id).toBe(creado.grupo_id)
    expect(positiva?.tipo).toBe('traspaso')

    const todas = await patas(creado.grupo_id)
    expect(todas).toHaveLength(2)
    expect(todas.map((p) => p.monto).sort()).toEqual(['-5000.00', '5000.00'])
    expect(todas.find((p) => p.cuenta_id === origen)?.monto).toBe('-5000.00')
    expect(todas.find((p) => p.cuenta_id === destino)?.monto).toBe('5000.00')

    // Ninguna pata tiene sobre: un traspaso no se asigna. Ver R2, grupo 3.
    expect(todas.every((p) => p.sobre_id === null)).toBe(true)
  })

  it('el signo lo decide el lado, no el signo del importe', async () => {
    // Un `monto` negativo tiene que seguir dando la pata de origen negativa y la de destino
    // positiva. Si el signo saliera del input, las dos serian negativas y el traspaso moveria
    // dinero de las dos cuentas. Ver D2.
    const creado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '-450',
      fecha: '2026-03-10',
      descripcion: 'Con signo invertido',
    })

    const todas = await patas(creado.grupo_id)
    expect(todas.find((p) => p.cuenta_id === origen)?.monto).toBe('-450.00')
    expect(todas.find((p) => p.cuenta_id === destino)?.monto).toBe('450.00')
  })

  it('la magnitud que devuelve es el importe sin signo', async () => {
    const creado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '-725.50',
      fecha: '2026-03-10',
      descripcion: 'Con decimales',
    })

    // El `abs` es de Postgres. Un `slice` en JavaScript seria una segunda copia de la
    // decision de signo, que es lo que la regla del dinero prohibe.
    expect(creado.monto).toBe('725.50')
    expect(creado.periodo).toBe('2026-03')
  })

  it('el grupo y sus patas comparten descripcion y fecha', async () => {
    const creado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '120',
      fecha: '2026-03-31',
      descripcion: 'Un solo texto',
    })

    const fila = await grupo(creado.grupo_id)
    expect(fila.descripcion).toBe('Un solo texto')
    expect(fila.fecha).toBe('2026-03-31')

    // Si divergieran, el grupo dejaria de ser un traspaso y la suma por periodo no cerraria.
    for (const pata of await patas(creado.grupo_id)) {
      expect(pata.descripcion).toBe(fila.descripcion)
      expect(pata.fecha).toBe(fila.fecha)
    }
  })

  it('no acepta un importe cero', async () => {
    // R1 lo prohibe para las dos patas: un traspaso de cero existe por historial y no mueve
    // nada. La frontera es el repositorio, no el formulario.
    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: origen,
        destino_cuenta_id: destino,
        monto: '0',
        fecha: '2026-03-10',
        descripcion: 'Nada',
      }),
    ).rejects.toThrow('El importe debe ser distinto de cero.')

    expect(await totalDeGrupos()).toBe(0)
  })

  it('no impone importe minimo: un centimo es un traspaso valido', async () => {
    // Decision de `060` D9, que `070` hereda: la unica cota es que no sea cero.
    const creado = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '0.01',
      fecha: '2026-03-10',
      descripcion: 'Un centimo',
    })

    const todas = await patas(creado.grupo_id)
    expect(todas.map((p) => p.monto).sort()).toEqual(['-0.01', '0.01'])
  })

  it('guarda el comercio cuando viene, y null cuando no', async () => {
    const conComercio = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '100',
      fecha: '2026-03-10',
      descripcion: 'Con comercio',
      comercio: '  Cajero  ',
    })
    const sinComercio = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '100',
      fecha: '2026-03-10',
      descripcion: 'Sin comercio',
    })

    const leerComercio = async (grupo_id: number) =>
      (await unaFila<{ comercio: string | null }>(base.db, sql`
        select m.comercio from movimientos m where m.transferencia_id = ${grupo_id}::int limit 1
      `)).comercio

    expect(await leerComercio(conComercio.grupo_id)).toBe('Cajero')
    expect(await leerComercio(sinComercio.grupo_id)).toBeNull()
  })
})

describe('070: el alta respeta la pertenencia', () => {
  it('no escribe nada si una de las cuentas es de otro usuario', async () => {
    const ajena = await crearCartera(base.db, (await crearUsuario(base.db)), { nombre: 'Suyo' })
    const cuentaAjena = await crearCuenta(base.db, ajena, { nombre: nombreCuenta('Ajena') })

    const gruposAntes = await totalDeGrupos()

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: origen,
        destino_cuenta_id: cuentaAjena,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentaAjena)

    // Ni el grupo ni las patas: el `where` de pertenencia esta en la sentencia de las patas,
    // y el grupo se revierte con la transaccion. Ver D1 y D3.
    expect(await totalDeGrupos()).toBe(gruposAntes)
  })

  it('un fallo al escribir las patas no deja el grupo a medias', async () => {
    const ajena = await crearCartera(base.db, (await crearUsuario(base.db)), { nombre: 'Otro' })
    const cuentaAjena = await crearCuenta(base.db, ajena, { nombre: nombreCuenta('Ajena') })

    const gruposAntes = await totalDeGrupos()

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: cuentaAjena,
        destino_cuenta_id: destino,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentaAjena)

    // El grupo se habia insertado ya: lo que prueba esto es que la transaccion lo revierte.
    expect(await totalDeGrupos()).toBe(gruposAntes)
  })

  it('no acepta una cuenta eliminada', async () => {
    await base.db.execute(sql`update cuentas set eliminado_en = now() where id = ${destino}::int`)

    await expect(
      registrarTraspaso(base.db, usuario, {
        origen_cuenta_id: origen,
        destino_cuenta_id: destino,
        monto: '500',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentaAjena)
  })

  it('la firma no acepta una cartera declarada', () => {
    // La cartera se deduce de las cuentas. Un `cartera_id` en la firma seria un parametro que
    // controla el formulario y que la base no puede contrastar. La aridad lo deja escrito:
    // `db`, `usuario_id` y los datos, y nada mas. Ver D1 y D3.
    expect(registrarTraspaso.length).toBe(3)
  })
})

describe('070: el alta simple sigue sin poder registrar un traspaso', () => {
  it('rechaza el tipo traspaso con su propio error', async () => {
    // Un traspaso sin par es exactamente lo que este error evita: el alta simple no sabe
    // fabricar la contraparte. Ver D2.
    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: destino,
        monto: '500',
        tipo: 'traspaso',
        fecha: '2026-03-10',
        descripcion: 'Una pata sola a mano',
      }),
    ).rejects.toBeInstanceOf(TraspasoNoRegistrable)
  })

  it('y el alta simple sigue funcionando con el helper compartido', async () => {
    // El `insert` crudo se extrajo para que las dos altas compartan la pertenencia. Esta
    // prueba es la que falla si la extraccion rompio el camino viejo. Ver D2.
    const creado = await registrarMovimiento(base.db, usuario, {
      cuenta_id: origen,
      monto: '300',
      tipo: 'gasto',
      fecha: '2026-03-10',
      descripcion: 'Un gasto de verdad',
    })

    expect(creado.monto).toBe('-300.00')
    expect(creado.periodo).toBe('2026-03')

    const [crudo] = await filas<{ transferencia_id: number | null }>(base.db, sql`
      select transferencia_id::int as transferencia_id from movimientos where id = ${creado.id}::int
    `)
    expect(crudo?.transferencia_id).toBeNull()
  })

  it('el alta simple sigue rechazando una cuenta ajena', async () => {
    const otroUsuario = await crearUsuario(base.db)
    const ajena = await crearCartera(base.db, otroUsuario, { nombre: 'Suya' })
    const cuentaAjena = await crearCuenta(base.db, ajena, { nombre: nombreCuenta('Ajena') })

    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: cuentaAjena,
        monto: '300',
        fecha: '2026-03-10',
        descripcion: 'No deberia',
      }),
    ).rejects.toBeInstanceOf(CuentaAjena)
  })
})

describe('070: el helpers compartido no se puede usar parasaltarse el tipo', () => {
  it('una pata con tipo traspaso y sin grupo no se cuela por el alta simple', async () => {
    // Sanidad del `tipo`: el helper comparte la sentencia, no las reglas. Un movimiento con
    // `tipo = 'traspaso'` escrito por la fabrica tiene que seguir sin poder editarse ni
    // asignarse como si fuera un gasto. Ver R2, grupo 3.
    const id = await crearMovimiento(base.db, {
      cuenta_id: destino,
      monto: '-10.00',
      tipo: 'traspaso',
    })

    const [crudo] = await filas<{ tipo: string; sobre_id: number | null }>(base.db, sql`
      select tipo::text as tipo, sobre_id::int as sobre_id from movimientos where id = ${id}::int
    `)

    expect(crudo?.tipo).toBe('traspaso')
    expect(crudo?.sobre_id).toBeNull()
  })
})
