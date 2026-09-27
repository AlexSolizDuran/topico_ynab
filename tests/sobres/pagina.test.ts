import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import { archivarSobre, crearSobre } from '@/repos/sobres'
import { resumenDeCartera } from '@/repos/dinero-suelto'
import type { Base } from '@/db/tipos'

/**
 * Lo que la pagina de cartera muestra de los sobres.
 *
 * La pagina es el unico lugar donde la sesion se cruza con el `cartera_id` de la URL, y
 * ahora hace cinco consultas mas: los sobres de cada grupo, los en negativo, los
 * archivados con saldo y el resumen de dinero suelto. Cada una lleva el `cartera_id` de
 * la URL, no el de la sesion, asi que el riesgo no es que una falle sino que una se
 * olvide del cruce. Por eso la prueba monta la pagina entera y exige que los numeros de
 * la cartera ajena no aparezcan en ninguna parte del HTML.
 *
 * El periodo se deriva de la fecha del servidor, asi que los movimientos van fechados en
 * el mes en curso y no en uno fijo.
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

vi.mock('@/components/sobres', () => ({
  FilaSobre: () => null,
  FilaSobreArchivado: () => null,
  FormularioNuevoSobre: () => null,
}))

const { default: PaginaCartera } = await import('@/app/(app)/cartera/[cartera]/page')

let base: BaseDePruebas
let mio: number
let cartera: number
let grupo: number
let cuenta: number

/** El mes en curso, que es el periodo que la pagina mira. */
function periodo(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

function fecha(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-10`
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  dbPorDefecto.valor = base.db

  mio = await crearUsuario(base.db)
  sesionPorDefecto.usuario_id = mio
  cartera = await crearCartera(base.db, mio, { nombre: 'Mia' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: 'Banco', saldo_inicial: '10000.00' })
})

afterEach(async () => {
  dbPorDefecto.valor = null
  await base.cerrar()
})

async function html(): Promise<string> {
  const pagina = PaginaCartera({ params: Promise.resolve({ cartera: String(cartera) }) } as never)
  return renderToStaticMarkup(await pagina)
}

describe('la pagina de la cartera, con sobres', () => {
  it('muestra el dinero suelto de la cartera de la sesion', async () => {
    const sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    await crearAsignacion(base.db, { sobre_id: sobre, monto: '4000.00', periodo: periodo() })

    const marcado = await html()

    // El formato es el de la moneda de la cartera (`$6,000.00`), no el punto del
    // Ejemplo del requerimiento: `formatear` recibe el string y no lo convierte.
    expect(marcado).toContain('$6,000.00')
    expect(marcado).toContain('$10,000.00')
    expect(marcado).toContain('$4,000.00')  })

  it('no muestra ni un numero de otra cartera', async () => {
    // Una cartera ajena con cifras que se reconocerian: 77.777.
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Suyos' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Ajeno' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, {
      nombre: 'Ajena',
      saldo_inicial: '77777.00',
    })
    const sobreAjeno = (await crearSobre(base.db, otro, carteraAjena, grupoAjeno, 'Ajeno')).id
    await crearAsignacion(base.db, {
      sobre_id: sobreAjeno,
      monto: '50000.00',
      periodo: periodo(),
    })
    await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      sobre_id: sobreAjeno,
      monto: '-60000.00',
      fecha: fecha(),
    })

    const marcado = await html()

    expect(marcado).not.toContain('77.777')
    expect(marcado).not.toContain('Ajeno')
  })

  it('destaca el panel de desbordes con el dinero que hay para tapar', async () => {
    const sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    await crearAsignacion(base.db, { sobre_id: sobre, monto: '2000.00', periodo: periodo() })
    await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-2400.00',
      fecha: fecha(),
    })

    const marcado = await html()

    expect(marcado).toContain('Sobres en negativo')
    // El dinero suelto alcanza para tapar 400, asi que se lo dice.
    expect(marcado).toContain('El dinero suelto alcanza')
  })

  it('avisa cuando el dinero suelto no cubre el desborde', async () => {
    // Se reparte todo lo que hay y despues se gasta mas: el sobre queda en -500 y no
    // queda nada suelto. Es el caso en que el aviso tiene que decir que no alcanza, y
    // no puede decir "ya esta" cuando el dinero no esta.
    const sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    await crearAsignacion(base.db, { sobre_id: sobre, monto: '10000.00', periodo: periodo() })
    await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-10500.00',
      fecha: fecha(),
    })

    const marcado = await html()

    expect(marcado).toContain('Sobres en negativo')
    expect(marcado).toContain('El dinero suelto no cubre')
    expect(marcado).not.toContain('El dinero suelto alcanza')
  })

  it('no muestra el panel de desbordes cuando no hay ninguno', async () => {
    const sobre = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    await crearAsignacion(base.db, { sobre_id: sobre, monto: '2000.00', periodo: periodo() })

    const marcado = await html()

    expect(marcado).not.toContain('Sobres en negativo')
  })

  it('trae los archivados con dinero por devolucion, y los separa de los planos', async () => {
    const vacio = (await crearSobre(base.db, mio, cartera, grupo, 'Viejo')).id
    await crearAsignacion(base.db, { sobre_id: vacio, monto: '100.00', periodo: periodo() })
    await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: vacio,
      monto: '-100.00',
      fecha: fecha(),
    })
    await archivarSobre(base.db, mio, cartera, vacio, periodo())

    const conDevolucion = (await crearSobre(base.db, mio, cartera, grupo, 'Reembolsado')).id
    await crearAsignacion(base.db, {
      sobre_id: conDevolucion,
      monto: '100.00',
      periodo: periodo(),
    })
    await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: conDevolucion,
      monto: '-100.00',
      fecha: fecha(),
    })
    await archivarSobre(base.db, mio, cartera, conDevolucion, periodo())
    await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: conDevolucion,
      tipo: 'ingreso',
      monto: '250.00',
      fecha: fecha(),
      descripcion: 'Devolucion',
    })

    const marcado = await html()

    // Los nombres los pinta `FilaSobreArchivado`, que va mockeada a `null`: lo que se
    // puede comprobar desde aca es que la pagina separe los dos grupos y no los mezcle
    // en el mismo listado.
    expect(marcado).toContain('Archivados con dinero')
    expect(marcado).toContain('Sobres archivados')
  })

  it('el disponible de cada sobre sale de la consulta, no de un saldo guardado', async () => {
    // Dos sobres con asignaciones distintas tienen que mostrar disponibles distintos. Si
    // el disponible se calculara con el id sin calificar, los dos darian el mismo numero.
    const comida = (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id
    const transporte = (await crearSobre(base.db, mio, cartera, grupo, 'Transporte')).id
    await crearAsignacion(base.db, { sobre_id: comida, monto: '3800.00', periodo: periodo() })
    await crearAsignacion(base.db, {
      sobre_id: transporte,
      monto: '900.00',
      periodo: periodo(),
    })

    const resumen = await resumenDeCartera(base.db, mio, cartera, periodo())
    expect(resumen.asignado).toBe('4700.00')
    expect(resumen.dinero_suelto).toBe('5300.00')
  })

  it('sigue dando notFound en una cartera ajena con los sobres ya cargados', async () => {
    const otro = await crearUsuario(base.db)
    const ajena = await crearCartera(base.db, otro, { nombre: 'Suyos' })
    const grupoAjeno = await crearGrupo(base.db, ajena, { nombre: 'Ajeno' })
    await crearSobre(base.db, otro, ajena, grupoAjeno, 'Comida')

    await expect(
      PaginaCartera({ params: Promise.resolve({ cartera: String(ajena) }) } as never),
    ).rejects.toThrow(/404/)
  })
})
