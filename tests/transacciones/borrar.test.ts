/**
 * 060-transacciones, grupo 6: borrar, restaurar y la cascada de las patas.
 *
 * El borrado es **logico**, y por eso estas pruebas miran dos cosas que no son la misma: que
 * los derivados cambian —el saldo vuelve, el disponible sube— y que la fila **sigue
 * existiendo**. Un borrado fisico pasaria la primera y no la segunda.
 *
 * La cascada se verifica contando filas, no mirando saldos. La razon es que "los dos saldos
 * quedan restaurados" se cumple tambien con un `delete` de las dos patas, y con un bucle de
 * `update`, y con un trigger: lo unico que distingue la implementacion que exige D7 de las
 * otras es que **la fila sigue ahi**. Por eso el criterio es `eliminado_en` y `count(*)`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BaseDePruebas } from '../helpers/pg'
import { crearBaseDePruebas } from '../helpers/pg'
import { unaFila as consultar } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearTransferencia,
  crearUsuario,
} from '../helpers/fabricas'
import {
  MovimientoEliminado,
  MovimientoNoExiste,
  MovimientoYaEliminado,
  buscarMovimiento,
  eliminarMovimiento,
  listarMovimientos,
  listarMovimientosEliminados,
  restaurarMovimiento,
} from '@/repos/movimientos'
import { crearSobre, disponibleDeSobre } from '@/repos/sobres'
import { saldoDeCuenta } from '@/repos/cuentas'
import { dineroSuelto } from '@/repos/dinero-suelto'
import { movimientos } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

const ENERO = '2026-01'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number
let cuenta: number
let origen: number
let destino: number
let sobre: number

let cuentas = 0
function nombreCuenta(): string {
  return `Banco ${cuentas++}`
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '1000.00' })
  origen = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
  destino = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
  sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Comida')).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: ENERO })
})

afterEach(async () => {
  await base.cerrar()
})

function saldo(cuenta_id: number): Promise<string> {
  return saldoDeCuenta(base.db, usuario, cartera, cuenta_id)
}

function disponible(): Promise<string> {
  return disponibleDeSobre(base.db, usuario, cartera, sobre, ENERO)
}

function gastoDe450(): Promise<number> {
  return crearMovimiento(base.db, {
    cuenta_id: cuenta,
    sobre_id: sobre,
    monto: '-450',
    tipo: 'gasto',
    fecha: '2026-01-15',
    descripcion: 'Compra grande',
  })
}

/** Cuantas filas fisicas hay, borradas o no. El criterio del borrado logico. */
function filasTotales(): Promise<number> {
  return contar(sql`select count(*)::int as n from movimientos`)
}

/** Un `count(*)` de una consulta propia. Devuelve el numero, no la fila. */
async function contar(consulta: SQL): Promise<number> {
  const fila = await consultar<{ n: number }>(base.db, consulta)
  return fila.n
}

/** Cuantas filas del grupo siguen vivas. */
function vivasDelGrupo(grupo_id: number): Promise<number> {
  return contar(sql`
    select count(*)::int as n from movimientos
    where transferencia_id = ${grupo_id} and eliminado_en is null
  `)
}

/** Cuantas filas del grupo tienen `eliminado_en`. */
function borradasDelGrupo(grupo_id: number): Promise<number> {
  return contar(sql`
    select count(*)::int as n from movimientos
    where transferencia_id = ${grupo_id} and eliminado_en is not null
  `)
}

describe('060: borrar un movimiento', () => {
  it('deja de contar en las sumas sin borrar la fila', async () => {
    // Escenario `Borrado logico de un gasto`: el saldo sube 450 y el disponible tambien.
    const movimiento = await gastoDe450()
    expect(await saldo(cuenta)).toBe('550.00')
    expect(await disponible()).toBe('2550.00')

    const resultado = await eliminarMovimiento(base.db, usuario, movimiento)

    expect(resultado).toEqual({ id: movimiento, eliminados: 1 })
    expect(await saldo(cuenta)).toBe('1000.00')
    expect(await disponible()).toBe('3000.00')
    // Y el dinero suelto tambien deja de contar el importe.
    expect(await dineroSuelto(base.db, usuario, cartera, ENERO)).toBe('-2000.00')
  })

  it('la fila sigue en la tabla: el borrado es logico', async () => {
    const movimiento = await gastoDe450()
    const antes = await filasTotales()

    await eliminarMovimiento(base.db, usuario, movimiento)

    // Mismo numero de filas: nada se borro fisicamente.
    expect(await filasTotales()).toBe(antes)

    // Y el `eliminado_en` esta escrito, que es lo que el listado filtra.
    const fila = await consultar<{ eliminado_en: Date | null }>(base.db, sql`
      select eliminado_en from movimientos where id = ${movimiento}
    `)
    expect(fila.eliminado_en).not.toBeNull()

    // El listado —que excluye los eliminados— ya no lo trae.
    expect(await listarMovimientos(base.db, usuario)).toEqual([])
  })

  it('un movimiento sin grupo se borra solo a si mismo', async () => {
    // 6.4: la misma sentencia cubre el caso trivial, y esa es la parte delicada. La rama
    // "sin grupo" se ancla en `id`, no en "las filas sin grupo": con `transferencia_id is
    // not distinct from null` —que parece la forma obvia de unify las dos ramas— el `where`
    // daria verdadero para **todo** el historial sin grupo de la cartera y marcaria de mas.
    // Un gasto suelto, un ingreso suelto y un traspaso de fondo: solo el gasto queda marcado.
    const gasto = await gastoDe450()
    const ingreso = await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      monto: '900',
      tipo: 'ingreso',
      fecha: '2026-01-16',
    })
    const otrasPatas = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })

    const resultado = await eliminarMovimiento(base.db, usuario, gasto)

    expect(resultado.eliminados).toBe(1)
    expect(await filasTotales()).toBe(4)

    // Una sola fila marcada, de cuatro. Este es el criterio del 6.3: si el `where` agrupara
    // por "sin grupo" en vez de por `id`, las otras dos tambien habrian salido.
    expect(await contar(sql`
      select count(*)::int as n from movimientos where eliminado_en is not null
    `)).toBe(1)

    // Las otras dos, y las dos patas del traspaso, siguen vivas.
    expect(await vivasDelGrupo(otrasPatas.grupo_id)).toBe(2)
    expect((await buscarMovimiento(base.db, usuario, ingreso))?.eliminado_en).toBeNull()
  })

  it('no reactiva ni desactiva la cuenta', async () => {
    // 6.5: borrar un movimiento es un dato del movimiento. La cuenta queda exactamente como
    // estaba, y por eso la suite de `cuentas` sigue verde sin tocar una linea de ahi.
    const movimiento = await gastoDe450()
    const antes = await base.db
      .select({ eliminado_en: movimientos.eliminado_en })
      .from(movimientos)
      .where(eq(movimientos.id, movimiento))

    await eliminarMovimiento(base.db, usuario, movimiento)

    const cuentaDespues = await base.db.execute(sql`select eliminado_en, nombre from cuentas where id = ${cuenta}`)
    expect((cuentaDespues as unknown as { rows: unknown[] }).rows[0]).toMatchObject({
      eliminado_en: null,
    })
    expect(antes).toHaveLength(1)
  })

  it('rechaza borrar dos veces el mismo movimiento', async () => {
    const movimiento = await gastoDe450()
    await eliminarMovimiento(base.db, usuario, movimiento)

    await expect(eliminarMovimiento(base.db, usuario, movimiento)).rejects.toBeInstanceOf(
      MovimientoEliminado,
    )
    // Y el error es el de "ya esta eliminado", no el de "no existe": el boton de borrar
    // sobre una fila borrada es un bug de la vista, y necesita su propio mensaje.
    await expect(eliminarMovimiento(base.db, usuario, movimiento)).rejects.not.toBeInstanceOf(
      MovimientoNoExiste,
    )
  })

  it('no borra un movimiento de otro usuario', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta() })
    const movimientoAjeno = await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      monto: '-450',
      tipo: 'gasto',
      fecha: '2026-01-15',
    })

    await expect(eliminarMovimiento(base.db, usuario, movimientoAjeno)).rejects.toBeInstanceOf(
      MovimientoNoExiste,
    )

    // Sigue vivo para su dueno: el rechazo no escribio.
    expect((await buscarMovimiento(base.db, otro, movimientoAjeno))?.eliminado_en).toBeNull()
  })
})

describe('060: restaurar un movimiento', () => {
  it('lo devuelve a todas las sumas', async () => {
    // Escenario `Restaurar un movimiento eliminado`.
    const movimiento = await gastoDe450()
    const saldoAntes = await saldo(cuenta)
    const disponibleAntes = await disponible()
    const sueltoAntes = await dineroSuelto(base.db, usuario, cartera, ENERO)

    await eliminarMovimiento(base.db, usuario, movimiento)
    expect(await saldo(cuenta)).toBe('1000.00')
    expect(await disponible()).toBe('3000.00')

    const resultado = await restaurarMovimiento(base.db, usuario, movimiento)

    expect(resultado).toEqual({ id: movimiento, restaurados: 1 })
    // Vuelve exactamente a donde estaba, sin recalcular nada: la fila es la misma que era.
    expect(await saldo(cuenta)).toBe(saldoAntes)
    expect(await disponible()).toBe(disponibleAntes)
    expect(await dineroSuelto(base.db, usuario, cartera, ENERO)).toBe(sueltoAntes)
    expect((await buscarMovimiento(base.db, usuario, movimiento))?.eliminado_en).toBeNull()
    expect(await listarMovimientos(base.db, usuario)).toHaveLength(1)
  })

  it('rechaza restaurar lo que no esta eliminado', async () => {
    const movimiento = await gastoDe450()

    await expect(restaurarMovimiento(base.db, usuario, movimiento)).rejects.toBeInstanceOf(
      MovimientoYaEliminado,
    )
  })

  it('un movimiento restaurado vuelve a ser editable', async () => {
    // El orden que pide 5.6: editar lo borrado se rechaza, restaurar lo deja editable. La
    // segunda parte de esa tarea se verifica aca, con el mismo par de operaciones.
    const { editarMovimiento } = await import('@/repos/movimientos')
    const movimiento = await gastoDe450()

    await eliminarMovimiento(base.db, usuario, movimiento)
    await expect(editarMovimiento(base.db, usuario, movimiento, { monto: '380' })).rejects.toBeInstanceOf(
      MovimientoEliminado,
    )

    await restaurarMovimiento(base.db, usuario, movimiento)
    const corregido = await editarMovimiento(base.db, usuario, movimiento, { monto: '380' })

    expect(corregido.monto).toBe('-380.00')
    expect(await saldo(cuenta)).toBe('620.00')
  })

  it('no restaura un movimiento de otro usuario', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta() })
    const movimientoAjeno = await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      monto: '-450',
      tipo: 'gasto',
      fecha: '2026-01-15',
      eliminado_en: new Date('2026-02-01T00:00:00Z'),
    })

    await expect(restaurarMovimiento(base.db, usuario, movimientoAjeno)).rejects.toBeInstanceOf(
      MovimientoNoExiste,
    )
    expect((await buscarMovimiento(base.db, otro, movimientoAjeno))?.eliminado_en).not.toBeNull()
  })
})

describe('060: la cascada de un traspaso', () => {
  it('borra las dos patas de una con un solo update', async () => {
    // Escenario `Borrar un traspaso completo`: al borrar una pata, la otra tambien desaparece
    // y ambos saldos quedan restaurados.
    const { origen_id, destino_id, grupo_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })
    expect(await saldo(origen)).toBe('-500.00')
    expect(await saldo(destino)).toBe('500.00')

    // Se borra **una** pata. El `eliminados` dice cuantas filas marco la sentencia.
    const resultado = await eliminarMovimiento(base.db, usuario, origen_id)

    expect(resultado.eliminados).toBe(2)
    // Las dos filas siguen existiendo, marcadas.
    expect(await borradasDelGrupo(grupo_id)).toBe(2)
    expect(await vivasDelGrupo(grupo_id)).toBe(0)
    // Y los dos saldos volvieron a su valor de partida.
    expect(await saldo(origen)).toBe('0.00')
    expect(await saldo(destino)).toBe('0.00')
    // Y el patrimonio de la cartera quedo intacto: un traspaso no crea ni destruye dinero, asi
    // que el dinero suelto es el mismo antes y despues del borrado.
    // `suma(saldos)` = 1000 de `cuenta` y 0 + 0 en las dos patas; `suma(disponibles)` hasta
    // enero = los 3000 asignados. 1000 - 3000.
    expect(await dineroSuelto(base.db, usuario, cartera, ENERO)).toBe('-2000.00')
  })

  it('no toca las patas de otro grupo', async () => {
    // El criterio del 6.3: la cascada es por `transferencia_id`, no "borra todo lo que vea".
    const uno = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })
    const otro_ = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '700.00',
    })

    await eliminarMovimiento(base.db, usuario, uno.origen_id)

    expect(await borradasDelGrupo(uno.grupo_id)).toBe(2)
    expect(await borradasDelGrupo(otro_.grupo_id)).toBe(0)
    expect(await vivasDelGrupo(otro_.grupo_id)).toBe(2)
    // Y las cuatro filas siguen en la tabla: logico las cuatro.
    expect(await filasTotales()).toBe(4)
  })

  it('restaura las dos patas juntas', async () => {
    const { origen_id, destino_id, grupo_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })
    await eliminarMovimiento(base.db, usuario, origen_id)

    const resultado = await restaurarMovimiento(base.db, usuario, destino_id)

    expect(resultado.restaurados).toBe(2)
    expect(await vivasDelGrupo(grupo_id)).toBe(2)
    expect(await saldo(origen)).toBe('-500.00')
    expect(await saldo(destino)).toBe('500.00')
  })

  it('no borra las patas de otro usuario', async () => {
    // La cascada cruza la pertenencia en el mismo `where`: si se hiciera filtrando por id en
    // JavaScript, bastaria un `update` sin pertenencia para vacar la cartera de al lado.
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const origenAjeno = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta() })
    const destinoAjeno = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta() })
    const { origen_id, grupo_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origenAjeno,
      destino_cuenta_id: destinoAjeno,
      monto: '500.00',
    })

    await expect(eliminarMovimiento(base.db, usuario, origen_id)).rejects.toBeInstanceOf(
      MovimientoNoExiste,
    )
    expect(await vivasDelGrupo(grupo_id)).toBe(2)
    expect((await buscarMovimiento(base.db, otro, origen_id))?.eliminado_en).toBeNull()
    // Las cuentas de este usuario tampoco se tocaron al intentar borrar el traspaso ajeno.
    expect(await saldo(origen)).toBe('0.00')
    expect(await saldo(destino)).toBe('0.00')
  })

  it('despues de borrar el traspaso, el listado no muestra ninguna pata', async () => {
    const { origen_id, destino_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })
    const gasto = await gastoDe450()

    await eliminarMovimiento(base.db, usuario, origen_id)

    const vivos = await listarMovimientos(base.db, usuario)
    expect(vivos.map((m) => m.id)).toEqual([gasto])
    expect(vivos.some((m) => m.id === origen_id || m.id === destino_id)).toBe(false)
    // Y ningun disponible se movio: las patas nunca estuvieron en un sobre.
    expect(await disponible()).toBe('2550.00')
  })
})

describe('060: el listado de eliminados', () => {
  it('sale lo borrado y no sale lo que cuenta', async () => {
    // El listado de eliminados es la contraparte de `listarMovimientos`: las dos listas
    // juntas dan todos los movimientos del usuario, y ninguna se solapa.
    const vivo = await gastoDe450()
    const borrado = await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      monto: '-20',
      tipo: 'gasto',
      fecha: '2026-01-16',
    })

    await eliminarMovimiento(base.db, usuario, borrado)

    const eliminados = await listarMovimientosEliminados(base.db, usuario)
    expect(eliminados.map((m) => m.id)).toEqual([borrado])
    expect(eliminados[0]?.eliminado_en).toBeInstanceOf(Date)
    expect((await listarMovimientos(base.db, usuario)).map((m) => m.id)).toEqual([vivo])
  })

  it('trae las dos patas de un traspaso borrado', async () => {
    // Si solo saliera la pata que se borro, la otra quedaria sin forma de restaurarse: R6
    // dice que se van las dos, y por eso las dos tienen que aparecer.
    const { origen_id, destino_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })

    await eliminarMovimiento(base.db, usuario, origen_id)

    const eliminados = await listarMovimientosEliminados(base.db, usuario)
    expect(eliminados.map((m) => m.id).sort((a, b) => a - b)).toEqual(
      [origen_id, destino_id].sort((a, b) => a - b),
    )
    expect(eliminados.every((m) => m.transferencia_id !== null)).toBe(true)
  })

  it('la misma fila antes y despues de restaurar', async () => {
    // La vista de eliminados y la que cuenta comparten la seleccion del repositorio, asi que
    // un movimiento no puede verse distinto segun desde donde se mire.
    const movimiento = await gastoDe450()

    await eliminarMovimiento(base.db, usuario, movimiento)
    const [eliminada] = await listarMovimientosEliminados(base.db, usuario)
    if (!eliminada) throw new Error('el movimiento borrado deberia salir en los eliminados')

    await restaurarMovimiento(base.db, usuario, movimiento)
    const [restaurado] = await listarMovimientos(base.db, usuario)
    if (!restaurado) throw new Error('el restaurado deberia salir en la lista que cuenta')

    expect({ ...restaurado, eliminado_en: eliminada.eliminado_en }).toEqual({
      ...eliminada,
      eliminado_en: eliminada.eliminado_en,
    })
  })

  it('no mezcla los eliminados de otro usuario', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta() })
    const movimientoAjeno = await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      monto: '-450',
      tipo: 'gasto',
      fecha: '2026-01-15',
      eliminado_en: new Date('2026-02-01T00:00:00Z'),
    })

    expect(await listarMovimientosEliminados(base.db, usuario)).toEqual([])
    expect(
      (await listarMovimientosEliminados(base.db, otro)).map((m) => m.id),
    ).toEqual([movimientoAjeno])
  })
})
