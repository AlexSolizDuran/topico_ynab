import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import { crearCartera, crearSesion, crearUsuario } from '../helpers/fabricas'
import type { Base } from '@/db/tipos'

/**
 * Control de acceso de la pagina de cuentas.
 *
 * La pagina es el unico lugar donde la sesion se cruza con el `cartera_id` de la URL.
 * Si ese cruce se rompe, la pagina sigue funcionando: muestra las cuentas de la
 * cartera del link, y el error aparece en el servidor de otro usuario. Por eso se
 * prueba la pagina, no solo el repositorio.
 *
 * El componente se llama como funcion. Es un Server Component async, asi que eso es
 * lo que Next hace con el, y `notFound()` lanza en vez de devolver algo.
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
}))

// Los componentes de cliente se reemplazan por `null`: son Server Components que se
// invocan como funcion, y lo que se prueba aca es el control de acceso de la pagina, no
// su markup. Sin este mock, arrastrarian las Server Actions y con ellas la sesion.
vi.mock('@/components/cuentas', () => ({
  FilaCuenta: () => null,
  FilaCuentaArchivada: () => null,
  FormularioNuevaCuenta: () => null,
}))

vi.mock('@/components/sobres', () => ({
  FilaSobre: () => null,
  FilaSobreArchivado: () => null,
  FormularioNuevoSobre: () => null,
}))

const { default: PaginaCuentas } = await import('@/app/(app)/cartera/[cartera]/page')

let base: BaseDePruebas
let propio: number
let ajeno: number
let mio: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  dbPorDefecto.valor = base.db

  mio = await crearUsuario(base.db)
  const otro = await crearUsuario(base.db)
  propio = await crearCartera(base.db, mio, { nombre: 'Mia' })
  ajeno = await crearCartera(base.db, otro, { nombre: 'Suya' })
  await crearSesion(base.db, { usuario_id: mio })
})

afterEach(async () => {
  dbPorDefecto.valor = null
  await base.cerrar()
})

/**
 * Los props que Next le pasa a la pagina.
 *
 * `searchParams` va aunque aca no se mire nada: la pagina lo espera siempre, y una prueba que
 * lo omite estaria probando una invocacion que Next nunca hace. Sale de R9 —los filtros de
 * movimientos viven en la URL— y por eso la pagina los lee de ahi.
 */
const paramsDe = (cartera: string) => ({
  params: Promise.resolve({ cartera }),
  searchParams: Promise.resolve({}),
})

describe('la pagina de cuentas', () => {
  it('deja ver la cartera propia', async () => {
    sesionPorDefecto.usuario_id = mio
    await espera(PaginaCuentas(paramsDe(String(propio)) as never))
  })

  it('da notFound en una cartera ajena, sin decir cual de las dos cosas fallo', async () => {
    sesionPorDefecto.usuario_id = mio
    await espera(notFound(PaginaCuentas(paramsDe(String(ajeno)) as never)))
  })

  it('da notFound cuando el identificador no es un entero', async () => {
    sesionPorDefecto.usuario_id = mio
    for (const crudo of ['abc', '1.5', '9999999999999999999', '']) {
      await espera(notFound(PaginaCuentas(paramsDe(crudo) as never)))
    }
  })

  it('da notFound en una cartera que no existe, igual que en una ajena', async () => {
    sesionPorDefecto.usuario_id = mio
    // 999999 no es de nadie. La respuesta tiene que ser la misma que la de una cartera
    // ajena: si difirieran, confirmarian que el identificador existe.
    await espera(notFound(PaginaCuentas(paramsDe('999999') as never)))
  })

  it('da notFound cuando el identificador es negativo o cero', async () => {
    sesionPorDefecto.usuario_id = mio
    await espera(notFound(PaginaCuentas(paramsDe('-1') as never)))
    await espera(notFound(PaginaCuentas(paramsDe('0') as never)))
  })

})

/** Corre la pagina y exige que `notFound()` haya lanzado. */
async function notFound(corriendo: Promise<unknown>): Promise<void> {
  try {
    await corriendo
  } catch (error) {
    const mensaje = String((error as Error)?.message ?? '')
    // `notFound()` lanza un error de Next con 404 adentro. La version importa poco:
    // lo que se exige es que la pagina no devuelva contenido, porque devolver algo
    // seria mostrar los datos de una cartera ajena.
    expect(mensaje, `no fue notFound: ${mensaje}`).toMatch(/404/)
    return
  }
  expect.unreachable('la pagina deberia haber dado notFound')
}

async function espera(corriendo: Promise<unknown>): Promise<void> {
  await corriendo
}
