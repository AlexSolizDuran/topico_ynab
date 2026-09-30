/**
 * 060-transacciones, grupo 7: devoluciones.
 *
 * Una devolucion **no es un tipo nuevo**. Es un `ingreso` de importe positivo con
 * `sobre_id`, y por eso este archivo no toca el repositorio: registra con
 * `registrarMovimiento` como cualquier otro ingreso y despues mira que se comporte como
 * exige R4. Si hiciera falta una funcion aparte para esto, seria la senal de que el
 * diseno se separo de la base de datos.
 *
 * Lo que estas pruebas miden es la diferencia **con y sin `sobre_id`**, que es donde esta
 * toda la semantica:
 *
 * | devolucion con `sobre_id` | devolucion sin `sobre_id` |
 * |---|---|
 * | `sum(saldos)` +200 | `sum(saldos)` +200 |
 * | `sum(disponibles)` +200 | `sum(disponibles)` igual |
 * | `dinero_suelto` igual | `dinero_suelto` +200 |
 *
 * `dinero_suelto` es `sum(saldos) - sum(disponibles)`, asi que en el primer caso los dos
 * sumandos suben y se cancelan, y en el segundo sube solo uno. Ese es el unico rasgo que
 * distingue las dos, y por eso el contraste entre las dos mitades del archivo es la
 * prueba, no las aserciones sueltas.
 *
 * Ver D3. El detalle de por que `patrimonio` **si** se mueve con una devolucion esta en el
 * 7.3, y es deliberado: la cuenta que recibio el reembolso tiene esa plata, y un saldo de
 * cuenta que no lo refleja miente.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BaseDePruebas } from '../helpers/pg'
import { crearBaseDePruebas, unaFila } from '../helpers/pg'
import { crearAsignacion, crearCartera, crearCuenta, crearGrupo, crearUsuario } from '../helpers/fabricas'
import { buscarMovimiento, registrarMovimiento } from '@/repos/movimientos'
import { archivarSobre, crearSobre, disponibleDeSobre, listarSobresArchivadosConSaldo } from '@/repos/sobres'
import { saldoDeCuenta } from '@/repos/cuentas'
import { comprobarInvariante, resumenDeCartera } from '@/repos/dinero-suelto'
import { sql } from 'drizzle-orm'

const ENERO = '2026-01'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number
let cuenta: number
let sobre: number
let sobreArchivado: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: 'Banco', saldo_inicial: '1000.00' })
  sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Comida')).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: ENERO })

  // Un sobre sin asignacion: disponible cero, que es la unica forma de archivarlo.
  sobreArchivado = (await crearSobre(base.db, usuario, cartera, grupo, 'Ocio')).id
})

afterEach(async () => {
  await base.cerrar()
})

function saldo(): Promise<string> {
  return saldoDeCuenta(base.db, usuario, cartera, cuenta)
}

function disponible(sobre_id: number): Promise<string> {
  return disponibleDeSobre(base.db, usuario, cartera, sobre_id, ENERO)
}

function resumen() {
  return resumenDeCartera(base.db, usuario, cartera, ENERO)
}

/** El estado que D3 llama "antes de la compra", el punto de comparacion del par. */
async function estadoInicial() {
  return {
    saldo: await saldo(),
    disponible: await disponible(sobre),
    dinero_suelto: (await resumen()).dinero_suelto,
  }
}

function compra(): Promise<number> {
  return registrarMovimiento(base.db, usuario, {
    cuenta_id: cuenta,
    sobre_id: sobre,
    monto: '-200',
    fecha: '2026-01-15',
    descripcion: 'Compra en la tienda',
  }).then((r) => r.id)
}

function devolucion(sobre_id: number | null): Promise<number> {
  return registrarMovimiento(base.db, usuario, {
    cuenta_id: cuenta,
    sobre_id,
    monto: '200',
    fecha: '2026-01-20',
    descripcion: 'Devolucion de la compra',
  }).then((r) => r.id)
}

describe('060: devoluciones', () => {
  it('una devolucion es un ingreso positivo con sobre_id', async () => {
    const id = await devolucion(sobre)

    const fila = await buscarMovimiento(base.db, usuario, id)
    if (!fila) throw new Error('la devolucion no salio de la base')
    expect(fila.tipo).toBe('ingreso')
    // El monto guardado es el que manda el tipo: positivo, sin signo de gasto escondido.
    expect(fila.monto).toBe('200.00')
    expect(fila.sobre_id).toBe(sobre)
    expect(fila.eliminado_en).toBeNull()

    // Y el enum de Postgres sigue teniendo tres etiquetas: no se sumo `devolucion`.
    // Se lee `pg_enum` y no el schema de Drizzle, porque lo que importa es lo que la base
    // acepta, no lo que el codigo cree que acepta.
    const etiquetas = await unaFila<{ etiqueta: string }>(base.db, sql`
      select string_agg(e.enumlabel, ',' order by e.enumsortorder) as etiqueta
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'tipo_movimiento'
    `)
    expect(etiquetas.etiqueta).toBe('gasto,ingreso,traspaso')
  })

  it('la devolucion sube el disponible del sobre', async () => {
    // Escenario `Devolucion de una compra`: el sobre recupera lo gastado.
    await compra()
    expect(await disponible(sobre)).toBe('2800.00')

    await devolucion(sobre)

    expect(await disponible(sobre)).toBe('3000.00')
  })

  it('una devolucion a un sobre archivado se acumula y el sobre reaparece', async () => {
    await archivarSobre(base.db, usuario, cartera, sobreArchivado, ENERO)

    // Archivado y en cero: no aparece, porque no hay nada que mostrar. El cero sale de
    // `coalesce(..., 0)` y Postgres lo escribe `0`, no `0.00`: son el mismo importe.
    expect(await disponible(sobreArchivado)).toBe('0')
    expect(await listarSobresArchivadosConSaldo(base.db, usuario, cartera, ENERO)).toEqual([])

    await devolucion(sobreArchivado)

    // R11: el archivado no recibe asignaciones, pero si devoluciones.
    expect(await disponible(sobreArchivado)).toBe('200.00')
    const reaparecidos = await listarSobresArchivadosConSaldo(base.db, usuario, cartera, ENERO)
    expect(reaparecidos.map((s) => s.id)).toEqual([sobreArchivado])
    // El `toEqual` de arriba ya acoto la lista a uno. El corte explicito es para que el type
    // checker lo sepa tambien, en vez de dejar un `!` escondido.
    const reaparecido = reaparecidos[0]
    if (!reaparecido) throw new Error('el listado venia vacio')
    expect(reaparecido.disponible).toBe('200.00')
    // Sigue archivado: reaparecer en esta consulta no es desarchivar.
    expect(reaparecido.archivado).toBe(true)

    // Y no se coló en el listado de los vivos: los archivados se piden a proposito.
    expect(await disponible(sobre)).toBe('3000.00')
  })

  it('una devolucion no crea dinero: el dinero suelto no se mueve', async () => {
    // D3, primera mitad: la devolucion sola no cambia `dinero_suelto`. Es que `sum(saldos)`
    // y `sum(disponibles)` suben los dos 200 y se cancelan.
    await compra()
    const antes = await resumen()

    await devolucion(sobre)
    const despues = await resumen()

    expect(despues.dinero_suelto).toBe(antes.dinero_suelto)
    // Y lo que si se mueve, que es lo medido y no un error: el dinero vuelve a la cuenta.
    expect(despues.patrimonio).toBe('1000.00')
    expect(antes.patrimonio).toBe('800.00')
    await comprobarInvariante(base.db, usuario, cartera, ENERO)
  })

  it('el par compra mas devolucion suma cero contra el estado previo a la compra', async () => {
    // D3, segunda mitad: "no es dinero nuevo" significa que el par no deja al usuario con
    // mas plata de la que tenia, no que la devolucion no toque el patrimonio.
    const antes = await estadoInicial()

    await compra()
    await devolucion(sobre)

    expect(await estadoInicial()).toEqual(antes)
    expect(antes).toEqual({ saldo: '1000.00', disponible: '3000.00', dinero_suelto: '-2000.00' })
  })

  it('una devolucion sin sobre_id es un ingreso normal y no toca ningun sobre', async () => {
    await devolucion(null)

    // El disponible no se mueve: el dinero volvio a la cartera, no al sobre.
    expect(await disponible(sobre)).toBe('3000.00')
    expect(await disponible(sobreArchivado)).toBe('0')

    // Y aqui `dinero_suelto` **si** cambia, +200, porque subio un sumando y no el otro.
    // Es el rasgo que separa las dos mitades de este archivo.
    expect((await resumen()).dinero_suelto).toBe('-1800.00')
  })

  it('la devolucion no rompe la invariante del patrimonio', async () => {
    await compra()
    await devolucion(sobre)
    await devolucion(sobreArchivado)

    await comprobarInvariante(base.db, usuario, cartera, ENERO)
    const { patrimonio, asignado, dinero_suelto } = await resumen()
    expect(dinero_suelto).toBe('-2000.00')
    expect(asignado).toBe('3200.00')
    expect(patrimonio).toBe('1200.00')
  })
})
