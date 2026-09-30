import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { crearBaseDePruebas } from '../helpers/pg'
import type { BaseDePruebas } from '../helpers/pg'
import { crearCartera, crearCuenta, crearUsuario } from '../helpers/fabricas'
import { CuentaAjena, saldoDeCuenta } from '@/repos/cuentas'
import { filas } from '@/repos/filas'
import { comprobarInvariante, resumenDeCartera } from '@/repos/dinero-suelto'
import {
  TraspasoNoAsignable,
  buscarMovimiento,
  editarMovimiento,
  eliminarMovimiento,
  restaurarMovimiento,
} from '@/repos/movimientos'
import { CuentasDeCarterasDistintas, registrarTraspaso } from '@/repos/traspasos'

/**
 * `070` grupo 5: la edicion en espejo, y el ciclo completo de una pata.
 *
 * Este es el archivo que justifica que `patrimonio` siga siendo una suma confiable. Editar una
 * pata sin tocar la otra dejaria un par desemparejado, y el defecto **no** se veria en el
 * historial —las dos filas estan ahi, se ven bien— sino en el patrimonio, que de golpe no
 * cuadra con lo que el usuario movio. Por eso casi cada prueba termina mirando la cartera y
 * no solo las dos filas.
 */

const PERIODO = '2026-03'

let base: BaseDePruebas
let usuario: number
let cartera: number
let corriente: number
let ahorro: number
let otraCartera: number
let cuentaDeOtraCartera: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Principal' })
  corriente = await crearCuenta(base.db, cartera, { nombre: 'Corriente', saldo_inicial: '10000.00' })
  ahorro = await crearCuenta(base.db, cartera, { nombre: 'Ahorro', saldo_inicial: '2000.00' })

  otraCartera = await crearCartera(base.db, usuario, { nombre: 'Segunda' })
  cuentaDeOtraCartera = await crearCuenta(base.db, otraCartera, {
    nombre: 'Corriente 2',
    saldo_inicial: '0.00',
  })
})

afterEach(async () => {
  await base.cerrar()
})

/** Las dos patas de un traspaso de 5,000 de `corriente` a `ahorro`, del 2026-03-10. */
async function traspasoDe5000(): Promise<{
  grupo_id: number
  origen_id: number
  destino_id: number
}> {
  const r = await registrarTraspaso(base.db, usuario, {
    origen_cuenta_id: corriente,
    destino_cuenta_id: ahorro,
    monto: '5000.00',
    fecha: '2026-03-10',
    descripcion: 'Ahorro de marzo',
  })
  if (r.destino_id === null) throw new Error('este traspaso deberia tener dos patas')
  return { grupo_id: r.grupo_id, origen_id: r.origen_id, destino_id: r.destino_id }
}

/** El grupo tal como quedo en la base, para compararlo con sus patas. */
async function grupo(id: number): Promise<{ descripcion: string; fecha: string }> {
  const [fila] = await filas<{ descripcion: string; fecha: string }>(base.db, sql`
    select descripcion, fecha::text as fecha from grupos_transferencia where id = ${id}::int
  `)
  if (!fila) throw new Error(`el grupo ${id} no existe`)
  return fila
}

describe('070: editar una pata reescribe el grupo', () => {
  it('R6 el importe se refleja en la otra pata con el signo dado la vuelta', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    await editarMovimiento(base.db, usuario, origen_id, { monto: '450' })

    expect((await buscarMovimiento(base.db, usuario, origen_id))?.monto).toBe('-450.00')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.monto).toBe('450.00')
  })

  it('R6 el signo de la pata editada se conserva, se edite la que se edite', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    // Editar la pata **positiva**: sigue positiva, y la otra pasa a negativa. El signo no
    // depende de cual se edito sino de como estaba el par.
    await editarMovimiento(base.db, usuario, destino_id, { monto: '750' })

    expect((await buscarMovimiento(base.db, usuario, destino_id))?.monto).toBe('750.00')
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.monto).toBe('-750.00')

    await comprobarInvariante(base.db, usuario, cartera, PERIODO)
  })

  it('R6 el importe en negativo se normaliza con el signo que le toca', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    // Mandar `-450` para la pata negativa no puede terminar en `+450`: el signo lo decide el
    // lado, no lo que el formulario escribio.
    await editarMovimiento(base.db, usuario, origen_id, { monto: '-450' })

    expect((await buscarMovimiento(base.db, usuario, origen_id))?.monto).toBe('-450.00')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.monto).toBe('450.00')
  })

  it('R6 la fecha se refleja y las dos patas caen en el mismo periodo', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    await editarMovimiento(base.db, usuario, origen_id, { fecha: '2026-05-20' })

    expect((await buscarMovimiento(base.db, usuario, origen_id))?.fecha).toBe('2026-05-20')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.fecha).toBe('2026-05-20')

    const origen = await buscarMovimiento(base.db, usuario, origen_id)
    const destino = await buscarMovimiento(base.db, usuario, destino_id)
    expect(origen?.periodo).toBe('2026-05')
    expect(destino?.periodo).toBe(origen?.periodo)
  })

  it('R6 la descripcion se refleja en las dos patas', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    await editarMovimiento(base.db, usuario, destino_id, { descripcion: 'Ahorro de abril' })

    expect((await buscarMovimiento(base.db, usuario, origen_id))?.descripcion).toBe('Ahorro de abril')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.descripcion).toBe('Ahorro de abril')
  })

  it('R6 el comercio se refleja, y ausente se guarda como null en las dos', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    await editarMovimiento(base.db, usuario, origen_id, { comercio: '  Banco  ' })
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.comercio).toBe('Banco')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.comercio).toBe('Banco')

    await editarMovimiento(base.db, usuario, origen_id, { comercio: null })
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.comercio).toBeNull()
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.comercio).toBeNull()
  })

  it('R6 los cuatro campos cambian juntos en una sola pasada', async () => {
    const { grupo_id, origen_id, destino_id } = await traspasoDe5000()

    await editarMovimiento(base.db, usuario, origen_id, {
      monto: '1234.56',
      fecha: '2026-07-01',
      descripcion: 'Todo junto',
      comercio: 'Casa de cambio',
    })

    for (const id of [origen_id, destino_id]) {
      const fila = await buscarMovimiento(base.db, usuario, id)
      expect(fila?.fecha).toBe('2026-07-01')
      expect(fila?.descripcion).toBe('Todo junto')
      expect(fila?.comercio).toBe('Casa de cambio')
    }
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.monto).toBe('-1234.56')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.monto).toBe('1234.56')

    const g = await grupo(grupo_id)
    expect(g.fecha).toBe('2026-07-01')
    expect(g.descripcion).toBe('Todo junto')
  })
})

describe('070: la cuenta de cada pata es suya y no se propaga', () => {
  it('R6 cambiar la cuenta de una pata no mueve la cuenta de la otra', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()
    const nueva = await crearCuenta(base.db, cartera, { nombre: 'Nueva', saldo_inicial: '0.00' })

    await editarMovimiento(base.db, usuario, origen_id, { cuenta_id: nueva })

    // La pata editada cambio de cuenta y la otra no: si el `case` hubiera tocado `cuenta_id`
    // para todas las filas del grupo, las dos habrian quedado en `nueva` y el traspaso se
    // anularia a si mismo.
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.cuenta_id).toBe(nueva)
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.cuenta_id).toBe(ahorro)
  })

  it('R6 mover la pata de origen a otra cuenta de la misma cartera deja el traspaso valido', async () => {
    const { origen_id } = await traspasoDe5000()
    const nueva = await crearCuenta(base.db, cartera, { nombre: 'Nueva', saldo_inicial: '1000.00' })
    const antes = await resumenDeCartera(base.db, usuario, cartera, PERIODO)

    await editarMovimiento(base.db, usuario, origen_id, { cuenta_id: nueva, monto: '300' })

    // Los tres saldos cuadran con lo que paso: la pata negativa se fue de `corriente` a
    // `nueva`, asi que `corriente` vuelve a su saldo inicial, `nueva` baja 300 y el ahorro sube
    // 300.
    expect(await saldoDeCuenta(base.db, usuario, cartera, corriente)).toBe('10000.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, nueva)).toBe('700.00')
    expect(await saldoDeCuenta(base.db, usuario, cartera, ahorro)).toBe('2300.00')

    // Y el patrimonio no se movio: lo que sale de una cuenta entra en otra. Se compara con el
    // estado previo y no con un numero fijo, porque la cuenta nueva trae saldo inicial y eso
    // ya suma al patrimonio antes de que exista el traspaso.
    const resumen = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    expect(resumen.patrimonio).toBe(antes.patrimonio)
    expect(resumen.dinero_suelto).toBe(antes.dinero_suelto)
    await comprobarInvariante(base.db, usuario, cartera, PERIODO)
  })

  it('R6 una cuenta de otra cartera del mismo usuario se rechaza con el error del alta', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    await expect(
      editarMovimiento(base.db, usuario, origen_id, { cuenta_id: cuentaDeOtraCartera }),
    ).rejects.toBeInstanceOf(CuentasDeCarterasDistintas)

    // Nada cambio: el rechazo es de la transaccion entera.
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.cuenta_id).toBe(corriente)
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.monto).toBe('5000.00')
  })

  it('R6 una cuenta que no es del usuario se rechaza', async () => {
    const { origen_id } = await traspasoDe5000()
    const otro = await crearUsuario(base.db)
    const ajena = await crearCuenta(base.db, await crearCartera(base.db, otro), {
      nombre: 'Ajena',
    })

    await expect(
      editarMovimiento(base.db, usuario, origen_id, { cuenta_id: ajena }),
    ).rejects.toBeInstanceOf(CuentaAjena)
  })
})

describe('070: el grupo no diverge de sus patas', () => {
  it('R6 la fecha y la descripcion del grupo se actualizan con las de las patas', async () => {
    const { grupo_id, origen_id, destino_id } = await traspasoDe5000()

    expect(await grupo(grupo_id)).toEqual({
      descripcion: 'Ahorro de marzo',
      fecha: '2026-03-10',
    })

    await editarMovimiento(base.db, usuario, origen_id, {
      fecha: '2026-09-09',
      descripcion: 'Corregido',
    })

    const g = await grupo(grupo_id)
    const origen = await buscarMovimiento(base.db, usuario, origen_id)
    const destino = await buscarMovimiento(base.db, usuario, destino_id)

    // El grupo, las dos patas: los tres dicen lo mismo. Si divergieran, el listado mostraria
    // una fecha que ninguna fila tiene.
    expect(g).toEqual({ descripcion: 'Corregido', fecha: '2026-09-09' })
    expect(origen?.fecha).toBe(g.fecha)
    expect(destino?.fecha).toBe(g.fecha)
    expect(origen?.descripcion).toBe(g.descripcion)
    expect(destino?.descripcion).toBe(g.descripcion)
  })

  it('R6 editar solo el importe no toca la fecha ni la descripcion del grupo', async () => {
    const r = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: ahorro,
      monto: '100.00',
      fecha: '2026-04-11',
      descripcion: 'Otro',
    })

    await editarMovimiento(base.db, usuario, r.origen_id, { monto: '120' })

    // El `coalesce` del update del grupo deja intactos los campos que no llegan: editar el
    // importe no puede resetear la fecha a la de hoy.
    expect(await grupo(r.grupo_id)).toEqual({ descripcion: 'Otro', fecha: '2026-04-11' })
  })
})

describe('070: una pata no acepta sobre', () => {
  it('R2 asignarle un sobre a una pata se rechaza, y el grupo no cambia', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    await expect(
      editarMovimiento(base.db, usuario, origen_id, { sobre_id: 1 }),
    ).rejects.toBeInstanceOf(TraspasoNoAsignable)

    expect((await buscarMovimiento(base.db, usuario, origen_id))?.sobre_id).toBeNull()
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.sobre_id).toBeNull()
  })

  it('R2 mandar `sobre_id: null` a una pata es inocuo, no un error', async () => {
    const { origen_id, destino_id } = await traspasoDe5000()

    await editarMovimiento(base.db, usuario, origen_id, { sobre_id: null })

    expect((await buscarMovimiento(base.db, usuario, origen_id))?.sobre_id).toBeNull()
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.sobre_id).toBeNull()
  })
})

describe('070: editar una pata de una sola pata vuelve a avisar', () => {
  it('R1 el aviso sigue apareciendo despues de editar el importe de la pata unica', async () => {
    const alta = await registrarTraspaso(base.db, usuario, {
      origen_cuenta_id: corriente,
      destino_cuenta_id: null,
      monto: '500.00',
      fecha: '2026-03-10',
      descripcion: 'Sin contraparte',
    })
    expect(alta.aviso).toContain('500.00')

    // R1 exige el aviso en cada operacion que deja el grupo con una sola pata. Editar el
    // importe de 500 a 800 deja el grupo igual de solo, asi que el aviso vuelve con 800.
    const editado = await editarMovimiento(base.db, usuario, alta.origen_id, { monto: '800' })

    expect(editado.aviso).toContain('contraparte')
    expect(editado.aviso).toContain('800.00')
    expect(editado.monto).toBe('-800.00')
  })

  it('R6 un traspaso de dos patas no genera aviso al editar', async () => {
    const { origen_id } = await traspasoDe5000()

    const editado = await editarMovimiento(base.db, usuario, origen_id, { monto: '4000' })

    expect(editado.aviso).toBeUndefined()
  })
})

describe('070: el ciclo completo de una pata', () => {
  it('R6 alta, edicion, borrado y restauracion dejan el grupo como estaba', async () => {
    const antes = await resumenDeCartera(base.db, usuario, cartera, PERIODO)
    const { origen_id, destino_id } = await traspasoDe5000()

    expect((await resumenDeCartera(base.db, usuario, cartera, PERIODO)).patrimonio).toBe(
      antes.patrimonio,
    )

    // Editar.
    await editarMovimiento(base.db, usuario, origen_id, { monto: '2500', fecha: '2026-03-15' })
    expect((await resumenDeCartera(base.db, usuario, cartera, PERIODO)).patrimonio).toBe(
      antes.patrimonio,
    )

    // Borrar una pata borra el grupo entero.
    const borrado = await eliminarMovimiento(base.db, usuario, origen_id)
    expect(borrado.eliminados).toBe(2)
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.eliminado_en).not.toBeNull()
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.eliminado_en).not.toBeNull()

    // Borrado el grupo, los saldos volvieron a como estaban: es lo que compra un par entero.
    expect((await resumenDeCartera(base.db, usuario, cartera, PERIODO)).patrimonio).toBe(
      antes.patrimonio,
    )
    await comprobarInvariante(base.db, usuario, cartera, PERIODO)

    // Restaurar una pata restaura el grupo entero.
    const restaurado = await restaurarMovimiento(base.db, usuario, origen_id)
    expect(restaurado.restaurados).toBe(2)
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.eliminado_en).toBeNull()
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.eliminado_en).toBeNull()

    // Y el importe editado es el que volvio, no el del alta.
    expect((await buscarMovimiento(base.db, usuario, origen_id))?.monto).toBe('-2500.00')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.monto).toBe('2500.00')
    expect((await resumenDeCartera(base.db, usuario, cartera, PERIODO)).patrimonio).toBe(
      antes.patrimonio,
    )
    await comprobarInvariante(base.db, usuario, cartera, PERIODO)
  })
})
