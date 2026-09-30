import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearTransferencia,
  crearUsuario,
} from '../helpers/fabricas'
import { crearSobre } from '@/repos/sobres'
import { eliminarMovimiento } from '@/repos/movimientos'
import type { Base } from '@/db/tipos'

/**
 * La seccion de movimientos dentro de la pagina de la cartera.
 *
 * Tres cosas se comprueban aca, y las tres son de la pagina y no del repositorio:
 *
 * 1. **El aislamiento sigue entero.** Una cartera ajena da `notFound` —igual que antes de
 *    que existiera esta seccion— y los movimientos de otra cartera del **mismo** usuario no
 *    se cuelan en la lista. Lo segundo es lo interesante: `listarMovimientos` devuelve, a
 *    proposito, los movimientos de todas las carteras del usuario (R10 prohibe que acepte una
 *    cartera declarada), asi que el recorte lo hace la pagina sobre el `cartera_id` derivado.
 *    Si ese recorte se rompe, el filtro de pruebas de abajo no lo detecta: por eso esta
 *    prueba mira el HTML y no solo que la consulta no falle.
 * 2. **El filtro vive en la URL.** Un `GET` en la pagina se renderiza con `searchParams`, y
 *    lo que se ve depende de ellos. "Sobrevive a una recarga" es justamente eso: no hay
 *    estado que recargar, la URL *es* el estado.
 * 3. Los movimientos van con sus botones, y los pendientes marcados como "sin asignar".
 */

const dbPorDefecto = { valor: null as Base | null }
const sesionPorDefecto = { usuario_id: 0 }

vi.mock('@/db/cliente', () => ({
  obtenerCliente: () => {
    if (!dbPorDefecto.valor) throw new Error('la prueba no fijo la base')
    return dbPorDefecto.valor
  },
}))

vi.mock('@/sesion/server', () => ({
  sesionActual: async () => ({ usuario_id: sesionPorDefecto.usuario_id }),
  exigirSesion: async () => ({ usuario_id: sesionPorDefecto.usuario_id }),
  SesionRequerida: class extends Error {},
}))

const { default: PaginaCartera } = await import('@/app/(app)/cartera/[cartera]/page')

let base: BaseDePruebas
let mio: number
let cartera: number
let cuenta: number
let sobre: number

/** El mes en curso, que es el periodo que la pagina mira. */
function periodo(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  dbPorDefecto.valor = base.db

  mio = await crearUsuario(base.db)
  sesionPorDefecto.usuario_id = mio
  cartera = await crearCartera(base.db, mio, { nombre: 'Mia' })
  const grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: 'Banco', saldo_inicial: '10000.00' })
  sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: periodo() })
})

afterEach(async () => {
  dbPorDefecto.valor = null
  await base.cerrar()
})

/** El HTML de la cartera, con los `searchParams` que se le pasen. */
async function html(searchParams: Record<string, string> = {}): Promise<string> {
  const pagina = PaginaCartera({
    params: Promise.resolve({ cartera: String(cartera) }),
    searchParams: Promise.resolve(searchParams),
  } as never)
  return renderToStaticMarkup(await pagina)
}

async function movimiento(extra: Record<string, unknown> = {}): Promise<number> {
  return crearMovimiento(base.db, {
    cuenta_id: cuenta,
    sobre_id: sobre,
    monto: '-100.00',
    fecha: `${periodo()}-15`,
    descripcion: 'Compra',
    ...extra,
  })
}

describe('la pagina de la cartera, con movimientos', () => {
  it('da notFound en una cartera ajena, sin decir cual de las dos cosas fallo', async () => {
    const otroUsuario = await crearUsuario(base.db)
    const ajena = await crearCartera(base.db, otroUsuario, { nombre: 'Suyos' })
    sesionPorDefecto.usuario_id = mio

    const pagina = PaginaCartera({
      params: Promise.resolve({ cartera: String(ajena) }),
      searchParams: Promise.resolve({}),
    } as never)

    // El mensaje importa: si el `notFound` distinguiera "no existe" de "no es tuya",
    // confirmaria que el identificador existe.
    await expect(pagina).rejects.toThrow(/404/)
  })

  it('muestra los movimientos de la cartera, con su botonera', async () => {
    await movimiento({ descripcion: 'Supermercado', comercio: 'Carrefour' })

    const marcado = await html()

    expect(marcado).toContain('Supermercado')
    expect(marcado).toContain('Carrefour')
    expect(marcado).toContain('Banco')
    // El formulario de alta, con los cuatro campos que la accion valida.
    expect(marcado).toContain('name="cuenta_id"')
    expect(marcado).toContain('name="monto"')
    expect(marcado).toContain('name="fecha"')
    // Y los botones de la fila.
    expect(marcado).toContain('Corregir')
    expect(marcado).toContain('Borrar')
  })

  it('no trae los movimientos de otra cartera del mismo usuario', async () => {
    const segunda = await crearCartera(base.db, mio, { nombre: 'Segunda' })
    const grupoSegundo = await crearGrupo(base.db, segunda, { nombre: 'Otros' })
    const cuentaSegunda = await crearCuenta(base.db, segunda, { nombre: 'Otro banco' })
    await crearMovimiento(base.db, {
      cuenta_id: cuentaSegunda,
      monto: '-77.00',
      fecha: `${periodo()}-15`,
      descripcion: 'Movimiento de la otra cartera',
    })

    await movimiento({ descripcion: 'Movimiento de esta cartera' })

    const marcado = await html()

    expect(marcado).toContain('Movimiento de esta cartera')
    // `listarMovimientos` los devuelve a los dos, porque filtra por usuario y no por cartera.
    // Lo que los para es el recorte de la pagina sobre el `cartera_id` derivado de la cuenta.
    expect(marcado).not.toContain('Movimiento de la otra cartera')
    expect(marcado).not.toContain('Otro banco')
  })

  it('no trae los movimientos de otro usuario', async () => {
    const otroUsuario = await crearUsuario(base.db)
    const ajena = await crearCartera(base.db, otroUsuario, { nombre: 'Suyos' })
    const grupoAjeno = await crearGrupo(base.db, ajena, { nombre: 'Ajeno' })
    const cuentaAjena = await crearCuenta(base.db, ajena, { nombre: 'Su banco' })
    await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      monto: '-55.00',
      fecha: `${periodo()}-15`,
      descripcion: 'Movimiento de otro usuario',
    })

    const marcado = await html()

    expect(marcado).not.toContain('Movimiento de otro usuario')
    expect(marcado).not.toContain('Su banco')
  })

  it('marca el pendiente como "sin asignar" y ofrece darle un sobre', async () => {
    // R2: sin sobre es pendiente, no incompleto. Y la accion se ofrece en la misma fila,
    // que es donde el usuario la va a necesitar.
    await movimiento({ sobre_id: null, descripcion: 'Gasto sin sobre' })

    const marcado = await html()

    expect(marcado).toContain('sin asignar')
    expect(marcado).toContain('Asignar sobre')
    // Y sin "quitar sobre": no hay nada que quitar.
    expect(marcado).not.toContain('Quitar sobre')
  })

  it('un movimiento con sobre ofrece quitarlo, y no marcarlo pendiente', async () => {
    await movimiento({ descripcion: 'Gasto con sobre' })

    const marcado = await html()

    expect(marcado).toContain('Quitar sobre')
    expect(marcado).not.toContain('sin asignar')
  })

  it('una pata de traspaso no se edita, y su boton dice que se van las dos', async () => {
    const otra = await crearCuenta(base.db, cartera, { nombre: 'Efectivo' })
    const { origen_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: cuenta,
      destino_cuenta_id: otra,
      monto: '500.00',
    })

    const marcado = await html()

    expect(marcado).toContain('pata de un traspaso')
    expect(marcado).toContain('Borrar las dos patas')
    // R6 y el repositorio: una pata no se edita sola. Ahora con 070 D5 la edicion es en
    // espejo, pero el test no busca "Corregir": busca que no haya asignacion y que el
    // boton diga que se van las dos. La pagina muestra el formulario de traspasos cuando es
    // una pata, que ya lo prueba `vista.test.tsx` de traspasos.
    expect(marcado).not.toContain('Asignar sobre')
  })

  it('la seccion de traspasos sale con dos cuentas y no con una', async () => {
    // Con una sola cuenta no hay traspaso posible: R1 prohibe el alta vacia, y un formulario
    // que solo ofrece "Elegi la cuenta" y "Sin contraparte" seria una invitation a un error
    // forzado.
    const conUna = await html()
    expect(conUna).not.toContain('Nuevo traspaso')

    await crearCuenta(base.db, cartera, { nombre: 'Efectivo' })

    const conDos = await html()
    expect(conDos).toContain('Nuevo traspaso')
    // Y el texto dice lo que R1 prohibe, antes de que el usuario intente: no hay conversion
    // entre carteras, asi que cada una se mueve por separado.
    expect(conDos).toContain('No puede cruzar carteras')
  })
})

describe('los filtros viven en la URL', () => {
  beforeEach(async () => {
    await movimiento({ descripcion: 'Uber al trabajo', comercio: 'Uber' })
    await movimiento({ descripcion: 'Supermercado', comercio: 'Carrefour', monto: '-250.00' })
  })

  it('sin filtro salen todos los movimientos de la cartera', async () => {
    const marcado = await html()

    expect(marcado).toContain('Uber al trabajo')
    expect(marcado).toContain('Supermercado')
    // Y no hay nada que limpiar.
    expect(marcado).not.toContain('Limpiar')
  })

  it('el texto de la URL filtra por descripcion y por comercio', async () => {
    const marcado = await html({ texto: 'Uber' })

    expect(marcado).toContain('Uber al trabajo')
    expect(marcado).not.toContain('Supermercado')
    // El campo vuelve con lo que se escribio: eso es lo que hace que la recarga se vea igual.
    expect(marcado).toContain('value="Uber"')
    expect(marcado).toContain('Limpiar')
  })

  it('filtra por cuenta', async () => {
    const otra = await crearCuenta(base.db, cartera, { nombre: 'Efectivo' })
    await crearMovimiento(base.db, {
      cuenta_id: otra,
      monto: '-30.00',
      fecha: `${periodo()}-16`,
      descripcion: 'Cafe',
    })

    const marcado = await html({ cuenta_id: String(otra) })

    expect(marcado).toContain('Cafe')
    expect(marcado).not.toContain('Uber al trabajo')
  })

  it('filtra por tipo', async () => {
    await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '900.00',
      fecha: `${periodo()}-16`,
      descripcion: 'Sueldo',
    })

    const marcado = await html({ tipo: 'ingreso' })

    expect(marcado).toContain('Sueldo')
    expect(marcado).not.toContain('Uber al trabajo')
  })

  it('los filtros se combinan, y todos a la vez', async () => {
    const marcado = await html({ tipo: 'gasto', desde: `${periodo()}-01`, hasta: `${periodo()}-15` })

    // Ambos movimientos son de gasto y estan dentro del rango: los dos salen.
    expect(marcado).toContain('Uber al trabajo')
    expect(marcado).toContain('Supermercado')

    // Con `hasta` en el 14 no entra ninguno, y la lista avisa en vez de mostrar todo.
    const fueraDeRango = await html({ tipo: 'gasto', hasta: `${periodo()}-14` })
    expect(fueraDeRango).not.toContain('Uber al trabajo')
    expect(fueraDeRango).not.toContain('Supermercado')
    expect(fueraDeRango).toContain('Ningún movimiento coincide con el filtro')
  })

  it('un filtro mal escrito no desarma la pagina: avisa y deja limpiar', async () => {
    // Un `tipo=inventado` o un id que no es entero. Ignorarlo y mostrar todo seria peor que
    // no ver nada: el usuario creeria que filtro y son sus datos los que faltan.
    const marcado = await html({ tipo: 'inventado' })

    expect(marcado).toContain('Movimientos')
    expect(marcado).toContain('Ningún movimiento coincide con el filtro')
    // Y el link de limpiar apunta a la cartera sin parametros.
    expect(marcado).toContain(`href="/cartera/${cartera}"`)
  })

  it('el filtro no alcanza a los eliminados: no hay forma de que se escondan', async () => {
    // El listado de eliminados va **sin filtros**, y el de la lista que cuenta va con ellos.
    // Un filtro que oculta el unico movimiento que se puede deshacer es peor que no tener
    // filtro: el usuario no tendria de donde volver.
    const borrado = await movimiento({ descripcion: 'Supermercado borrado' })
    await eliminarMovimiento(base.db, mio, borrado)

    const marcado = await html({ texto: 'Uber' })

    expect(marcado).toContain('Uber al trabajo')
    // El borrado sale igual, sin filtro que lo esconda.
    expect(marcado).toContain('Supermercado borrado')
    expect(marcado).toContain('Restaurar')
    // Y la lista que cuenta si obeyece el filtro: de los dos "Supermercado" que hay en la
    // base, el del `beforeEach` no se dibuja y solo sobrevive el que esta en eliminados.
    expect(marcado.split('Supermercado')).toHaveLength(2)
  })
})

describe('los eliminados, con su boton de restaurar', () => {
  it('el borrado sale de la lista y aparece abajo, con Restaurar', async () => {
    // R6: el borrado es logico y el registro se conserva, asi que tiene que haber una lista
    // de donde volver a tomarlo. Sin esto, "restablecer" seria una promesa sin pantalla.
    const borrado = await movimiento({ descripcion: 'Supermercado' })

    expect(await html()).not.toContain('Restaurar')

    await eliminarMovimiento(base.db, mio, borrado)
    const marcado = await html()

    // Salio de la lista que cuenta, pero la fila sigue dibujada.
    expect(marcado).toContain('Eliminados')
    expect(marcado).toContain('Supermercado')
    expect(marcado).toContain('Restaurar')
    // Y no ofrece lo que el repositorio rechaza sobre una fila eliminada.
    expect(marcado).not.toContain('Asignar sobre')
    expect(marcado).not.toContain('Quitar sobre')
  })

  it('el boton de una pata dice que se restauran las dos', async () => {
    const otra = await crearCuenta(base.db, cartera, { nombre: 'Efectivo' })
    const { origen_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: cuenta,
      destino_cuenta_id: otra,
      monto: '500.00',
    })

    await eliminarMovimiento(base.db, mio, origen_id)
    const marcado = await html()

    expect(marcado).toContain('Restaurar las dos patas')
  })

  it('no aparece la seccion de eliminados cuando no hay nada eliminado', async () => {
    await movimiento({ descripcion: 'Compra' })

    expect(await html()).not.toContain('Eliminados')
  })

  it('no trae los eliminados de otra cartera del mismo usuario', async () => {
    // El mismo recorte por `cartera_id` que la lista que cuenta: R10 no exime a los
    // eliminados de nada.
    const segunda = await crearCartera(base.db, mio, { nombre: 'Segunda' })
    const cuentaSegunda = await crearCuenta(base.db, segunda, { nombre: 'Otro banco' })
    const ajena = await crearMovimiento(base.db, {
      cuenta_id: cuentaSegunda,
      monto: '-77.00',
      fecha: `${periodo()}-15`,
      descripcion: 'Borrado de la otra cartera',
    })
    await eliminarMovimiento(base.db, mio, ajena)

    const marcado = await html()

    expect(marcado).not.toContain('Borrado de la otra cartera')
    expect(marcado).not.toContain('Restaurar')
  })
})
