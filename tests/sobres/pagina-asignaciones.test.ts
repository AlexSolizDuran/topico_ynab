import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import { crearCartera, crearGrupo, crearUsuario } from '../helpers/fabricas'
import { crearSobre } from '@/repos/sobres'
import { asignarASobre, corregirAsignacion, listarAsignaciones } from '@/repos/asignaciones'
import type { Base } from '@/db/tipos'

/**
 * La correccion de asignaciones, en la pagina.
 *
 * Va en un archivo aparte de `pagina.test.ts` por una sola razon: alla los componentes
 * de sobres van mockeados a `null` para que la prueba mire las cifras del servidor. Aca
 * hace falta lo contrario: si `FilaSobre` no se renderiza de verdad, la lista de
 * asignaciones no existe en el HTML y no hay nada que comprobar.
 *
 * Lo que se verifica es la parte del requerimiento que la pantalla tiene que cumplir —
 * que el importe corregido se vea—, y no que el boton funcione: eso es de la Server
 * Action, en `acciones.test.ts`. Por eso la correccion se hace por el repositorio y lo
 * que se mira es el texto que sale.
 *
 * El periodo se deriva de la fecha del servidor, asi que la asignacion va fechada en el
 * mes en curso y no en uno fijo.
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

// Cuentas y grupos si se pueden mockear: la prueba es de sobres, y estas filas solo
// estan para que la pagina se pueda montar entera.
vi.mock('@/components/cuentas', () => ({
  FilaCuenta: () => null,
  FilaCuentaArchivada: () => null,
  FormularioNuevaCuenta: () => null,
}))

vi.mock('@/components/grupos', () => ({
  FilaGrupo: () => null,
  FilaGrupoArchivado: () => null,
  FormularioNuevoGrupo: () => null,
}))

const { default: PaginaCartera } = await import('@/app/(app)/cartera/[cartera]/page')

let base: BaseDePruebas
let mio: number
let cartera: number
let grupo: number

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
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
})

afterEach(async () => {
  dbPorDefecto.valor = null
  await base.cerrar()
})

async function html(): Promise<string> {
  const pagina = PaginaCartera({
    params: Promise.resolve({ cartera: String(cartera) }),
    searchParams: Promise.resolve({}),
  } as never)
  return renderToStaticMarkup(await pagina)
}

describe('la pagina deja corregir una asignacion', () => {
  it('muestra el importe corregido de la asignacion, y el disponible que resulta', async () => {
    const sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    const { id: asignacion_id } = await asignarASobre(
      base.db,
      mio,
      cartera,
      sobre,
      periodo(),
      '1000.00',
    )

    expect(await html()).toContain('$1,000.00')

    await corregirAsignacion(base.db, mio, cartera, asignacion_id, '1500.00')

    const marcado = await html()

    // El importe corregido, y no solo el disponible: el disponible prueba que la
    // operacion ocurrio, el importe de la fila prueba que el usuario puede ver *cual*
    // de sus asignaciones cambio.
    expect(marcado).toContain('$1,500.00')
    expect(marcado).not.toContain('$1,000.00')
  })

  it('lista cada asignacion del sobre con su periodo, y la contraparte de un traspaso sin formulario', async () => {
    const comid = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    const transporte = (await crearSobre(base.db, mio, cartera, grupo, 'Transporte')).id
    await asignarASobre(base.db, mio, cartera, comid, periodo(), '800.00')
    await asignarASobre(base.db, mio, cartera, transporte, periodo(), '500.00')

    const { moverEntreSobres } = await import('@/repos/asignaciones')
    await moverEntreSobres(base.db, mio, cartera, transporte, comid, periodo(), '200.00')

    const marcado = await html()

    // La asignacion de 200 que salio hacia Comida se ve, marcada como reasignacion, y
    // sin un formulario de correccion: corregirla sola descuadraria el destino.
    expect(marcado).toContain('salio hacia otro sobre')
    expect(marcado).toContain('Se corrige desde el sobre al que moviste el dinero')
    expect(await listarAsignaciones(base.db, mio, cartera, transporte)).toHaveLength(2)
  })

  it('no inventa asignaciones para un sobre recien creado', async () => {
    await crearSobre(base.db, mio, cartera, grupo, 'Comida')

    const marcado = await html()

    expect(marcado).toContain('Este sobre todavia no tiene asignaciones')
  })
})
