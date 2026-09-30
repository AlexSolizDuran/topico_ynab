import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import { crearCartera, crearGrupo, crearUsuario } from '../helpers/fabricas'
import { crearSobre } from '@/repos/sobres'
import { asignarASobre } from '@/repos/asignaciones'
import type { Base } from '@/db/tipos'

/**
 * Plegar un grupo: se ocultan sus sobres y el total sigue a la vista.
 *
 * El escenario se cumple con un `<details>` y con el total **fuera** de el, asi que la
 * prueba no necesita simular un clic: mira el HTML que devolvio el servidor y exige que
 * el total este antes del `<details>` del grupo y que no aparezca dentro de el. Una
 * prueba que pulsara el desplegable de React comprobaria el estado del componente, no
 * lo que el navegador recibe: el total tiene que estar fuera para que siga visible con
 * el grupo plegado, y eso se ve en el texto enviado, no en un `useState`.
 *
 * `FilaSobre` NO va mockeado, porque el escenario tiene dos mitades: lo que se oculta
 * —los sobres— y lo que no —el total—. Con la fila en `null` la primera mitad no
 * existiria y la prueba no probaria nada. Cuentas y grupos si van mockeados: la pantalla
 * necesita sus filas para montar, y aqui no hay nada que mirar de ellas.
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
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
})

afterEach(async () => {
  dbPorDefecto.valor = null
  await base.cerrar()
})

async function html(): Promise<string> {
  // `searchParams` va vacio y no se omite: la pagina lo espera siempre, y `cartera/[cartera]`
  // lo lee para los filtros de movimientos (R9).
  const pagina = PaginaCartera({
    params: Promise.resolve({ cartera: String(cartera) }),
    searchParams: Promise.resolve({}),
  } as never)
  return renderToStaticMarkup(await pagina)
}

/** El contenido del primer `<details>` del HTML, que es el del grupo. */
function contenidoDelGrupo(marcado: string): string {
  const apertura = marcado.indexOf('<details')
  expect(apertura, 'el grupo tiene que plegarse con un details').toBeGreaterThan(-1)
  const cierre = marcado.indexOf('</details>', apertura)
  expect(cierre, 'el details tiene que cerrarse').toBeGreaterThan(apertura)
  return marcado.slice(apertura, cierre)
}

describe('plegar un grupo', () => {
  it('deja el total fuera del details, y los sobres adentro', async () => {
    const sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    await asignarASobre(base.db, mio, cartera, sobre, periodo(), '2500.00')

    const marcado = await html()
    const total = 'Total del grupo:'
    const delGrupo = contenidoDelGrupo(marcado)

    // El total se escribe antes del `<details>`: es un hermano, no un hijo. Plegar el
    // grupo oculta lo de adentro del `<details>` y deja este parrafo como estaba.
    expect(marcado.indexOf(total)).toBeGreaterThan(-1)
    expect(marcado.indexOf(total)).toBeLessThan(marcado.indexOf('<details'))
    // Y la cifra va en ese parrafo, no en otro lado: el tramo que va del total al
    // `<details>` es exactamente la linea que sobrevive al plegado.
    expect(marcado.slice(marcado.indexOf(total), marcado.indexOf('<details'))).toContain(
      '$2,500.00',
    )

    // De adentro no sale el total. El disponible del sobre si esta adentro, y tiene que
    // estar: es dato del sobre, no del grupo.
    expect(delGrupo).not.toContain(total)
  })

  it('los sobres del grupo quedan dentro del details, que es lo que se pliega', async () => {
    const sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    await asignarASobre(base.db, mio, cartera, sobre, periodo(), '2500.00')

    const delGrupo = contenidoDelGrupo(await html())

    // La fila del sobre se renderiza de verdad, no mockeada: sin esto la prueba de arriba
    // pasaria con un grupo vacio, que no oculta nada.
    expect(delGrupo).toContain('Comida')
    expect(delGrupo).toContain('Ver sobres')
  })

  it('un grupo sin sobres muestra el total en cero, con los dos decimales', async () => {
    await crearGrupo(base.db, cartera, { nombre: 'Varios' })

    const marcado = await html()

    expect(marcado).toContain('Este grupo todavia no tiene sobres')
    expect(marcado).toContain('Total del grupo:')
    // El cero del total sale de `coalesce(..., 0::numeric(16,2))`. Sin el cast, un grupo
    // sin filas devuelve el entero `0` y la pagina muestra un importe con otra escala.
    expect(marcado).toContain('$0.00')
    expect(marcado).not.toMatch(/>0</)
  })
})
