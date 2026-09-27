import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import {
  AsignacionNoExiste,
  AsignacionNoPositiva,
  DisponibleInsuficiente,
  MismoSobre,
  NoHayDesborde,
  TapaDemasiado,
  asignarASobre,
  corregirAsignacion,
  listarAsignaciones,
  moverEntreSobres,
  taparDesborde,
} from '@/repos/asignaciones'
import {
  GrupoDeOtraCartera,
  NombreDeSobreDuplicado,
  OrdenDeSobreInvalido,
  SinGrupo,
  SobreArchivado,
  SobreConMovimientos,
  SobreConSaldo,
  SobreNoExiste,
  archivarSobre,
  buscarSobre,
  cambiarNombreSobre,
  cambiarOrdenSobre,
  crearSobre,
  disponibleDeSobre,
  eliminarSobre,
  existeSobre,
  listarSobres,
  listarSobresArchivados,
  listarSobresArchivadosConSaldo,
  listarSobresEnNegativo,
  moverSobreDeGrupo,
  restaurarSobre,
} from '@/repos/sobres'
import { archivarGrupo, totalDeGrupo } from '@/repos/grupos'
import { CarteraArchivada, archivarCartera } from '@/repos/carteras'

/**
 * Sobres: creacion, disponible derivado, asignaciones, sobregiro y borrado.
 *
 * Casi todo lo que hay aca se reduce a una sola pregunta repetida de otras formas:
 * **¿el disponible es la suma, o un numero guardado?** Cada prueba que toca el
 * disponible lo hace para que una columna de disponible que alguien agregue despues
 * falle aqui.
 *
 * El signo va en la fila. Un gasto es un movimiento de `'-450.00'` y un ingreso es
 * `'+450.00'`, porque el disponible es un `sum` con signo y no un `case` por tipo.
 */

const ENERO = '2026-01'
const FEBRERO = '2026-02'
const MARZO = '2026-03'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
})

afterEach(async () => {
  await base.cerrar()
})

async function sobre(nombre: string, grupo_id = grupo): Promise<number> {
  return (await crearSobre(base.db, usuario, cartera, grupo_id, nombre)).id
}

async function asignar(sobre_id: number, monto: string, periodo = ENERO): Promise<number> {
  return crearAsignacion(base.db, { sobre_id, monto, periodo })
}

let siguiente = 0

/**
 * Un gasto contra un sobre, en una cuenta recien creada.
 *
 * El nombre de la cuenta lleva un contador porque `cuentas` exige un nombre unico
 * dentro de la cartera, y una prueba con dos gastos sobre el mismo sobre los crearia
 * los dos con el mismo nombre.
 */
async function gasto(sobre_id: number, monto: string, fecha = '2026-01-15'): Promise<number> {
  const cuenta_id = await crearCuenta(base.db, cartera, { nombre: `Banco ${siguiente++}` })
  return crearMovimiento(base.db, {
    cuenta_id,
    sobre_id,
    monto: `-${monto}`,
    tipo: 'gasto',
    fecha,
  })
}

/**
 * El total de un grupo.
 *
 * Vive en `grupos` pero suma disponibles, asi que sus pruebas van aca: si el total se
 * calculara con una formula propia, estos numeros dejarian de cuadrar con los de las
 * filas, y el usuario veria un total que no es la suma de lo que tiene debajo.
 */
describe('sobres: el total de un grupo', () => {
  it('es la suma de los disponibles de sus sobres', async () => {
    const otro_grupo = await crearGrupo(base.db, cartera, { nombre: 'Ocio' })
    const comida = await sobre('Comida')
    const transporte = await sobre('Transporte')
    const cine = await sobre('Cine', otro_grupo)
    await asignar(comida, '3000.00')
    await asignar(transporte, '500.00')
    await asignar(cine, '9000.00')
    await gasto(transporte, '200.00')

    expect(await totalDeGrupo(base.db, usuario, cartera, grupo, ENERO)).toBe('3300.00')
    // El otro grupo cuenta lo suyo, y no se mezclan.
    expect(await totalDeGrupo(base.db, usuario, cartera, otro_grupo, ENERO)).toBe('9000.00')
  })

  it('se recalcula con los movimientos, porque no esta guardado', async () => {
    const comida = await sobre('Comida')
    await asignar(comida, '1000.00')
    expect(await totalDeGrupo(base.db, usuario, cartera, grupo, ENERO)).toBe('1000.00')

    await gasto(comida, '250.00')

    expect(await totalDeGrupo(base.db, usuario, cartera, grupo, ENERO)).toBe('750.00')
  })

  it('deja fuera los sobres archivados del grupo', async () => {
    const comida = await sobre('Comida')
    await asignar(comida, '1000.00')
    await gasto(comida, '1000.00')
    await archivarSobre(base.db, usuario, cartera, comida, ENERO)

    // El archivado no se despliega, asi que el total tiene que ser el de lo que se ve.
    expect(await totalDeGrupo(base.db, usuario, cartera, grupo, ENERO)).toBe('0.00')
  })

  it('no cuenta un sobre de otro grupo ni de otra cartera', async () => {
    const otro_grupo = await crearGrupo(base.db, cartera, { nombre: 'Ocio' })
    const fuera = await sobre('Cine', otro_grupo)
    await asignar(fuera, '9000.00')

    expect(await totalDeGrupo(base.db, usuario, cartera, grupo, ENERO)).toBe('0.00')
    expect(await totalDeGrupo(base.db, usuario, cartera, otro_grupo, ENERO)).toBe('9000.00')

    const otro = await crearUsuario(base.db)
    const ajena = await crearCartera(base.db, otro, { nombre: 'Ajena' })
    const grupoAjeno = await crearGrupo(base.db, ajena, { nombre: 'Ajeno' })
    const sobreAjeno = (
      await crearSobre(base.db, otro, ajena, grupoAjeno, 'Comida')
    ).id
    await crearAsignacion(base.db, { sobre_id: sobreAjeno, monto: '5000.00', periodo: ENERO })

    expect(await totalDeGrupo(base.db, usuario, cartera, grupoAjeno, ENERO)).toBe('0.00')
  })
})

/**
 * Un grupo archivado con sobres en negativo.
 *
 * R11 dice que el agrupamiento puede desaparecer y los sobres en rojo no. Por eso el
 * panel de desbordes consulta por disponible y no por grupo: si dependiera del grupo
 * activo, un sobre negativo de un grupo archivado se perderia de la vista justo cuando
 * el usuario necesita ver que esta debiendo.
 */
describe('sobres: archivar el grupo no esconde los desbordes', () => {
  it('los sobres en negativo se siguen viendo con el grupo archivado', async () => {
    const comida = await sobre('Comida')
    await asignar(comida, '1000.00')
    await gasto(comida, '1500.00')
    expect((await buscarSobre(base.db, usuario, cartera, comida, ENERO)).negativo).toBe(true)

    await archivarGrupo(base.db, usuario, cartera, grupo)

    // El agrupamiento ya no lo muestra.
    expect((await listarSobres(base.db, usuario, cartera, ENERO)).map((s) => s.id)).toEqual([
      comida,
    ])
    // Pero el desborde sigue en la lista de los que hay que mirar.
    const marcados = await listarSobresEnNegativo(base.db, usuario, cartera, ENERO)
    expect(marcados.map((s) => s.id)).toEqual([comida])
  })
})

describe('sobres: crear, renombrar y reordenar', () => {
  it('crea un sobre con disponible en cero y lo deja en la lista de su grupo', async () => {
    const creado = await crearSobre(base.db, usuario, cartera, grupo, 'Comida')
    expect(creado.disponible).toBe('0.00')
    expect(creado.cero).toBe(true)
    expect(creado.archivado).toBe(false)

    const lista = await listarSobres(base.db, usuario, cartera, ENERO)
    expect(lista.map((s) => s.nombre)).toEqual(['Comida'])
    expect(lista[0]?.grupo_id).toBe(grupo)
  })

  it('rechaza crear un sobre sin grupo, y pide uno', async () => {
    // El mensaje importa: "elige un grupo" es la respuesta, y no un error de forma del
    // formulario. Por eso el repositorio acepta `null` y responde con `SinGrupo`.
    await expect(crearSobre(base.db, usuario, cartera, null, 'Comida')).rejects.toBeInstanceOf(
      SinGrupo,
    )
    await expect(crearSobre(base.db, usuario, cartera, null, 'Comida')).rejects.toThrow(
      /grupo/i,
    )
  })

  it('rechaza mover un sobre a ningun grupo', async () => {
    const id = await sobre('Comida')
    await expect(
      moverSobreDeGrupo(base.db, usuario, cartera, id, null),
    ).rejects.toBeInstanceOf(SinGrupo)
  })

  it('rechaza un nombre que ya existe en la misma cartera', async () => {
    await sobre('Comida')
    await expect(crearSobre(base.db, usuario, cartera, grupo, 'Comida')).rejects.toBeInstanceOf(
      NombreDeSobreDuplicado,
    )
  })

  it('admite el mismo nombre en otra cartera, porque cada cartera es independiente', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Trabajo' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Fijos' })
    await sobre('Comida')

    const creado = await crearSobre(base.db, otro, carteraAjena, grupoAjeno, 'Comida')
    expect(creado.nombre).toBe('Comida')
  })

  it('no crea un sobre en un grupo de otra cartera', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Trabajo' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Ajeno' })

    await expect(
      crearSobre(base.db, usuario, cartera, grupoAjeno, 'Comida'),
    ).rejects.toBeInstanceOf(GrupoDeOtraCartera)
  })

  it('no crea sobres en una cartera archivada', async () => {
    await archivarCartera(base.db, usuario, cartera)

    await expect(crearSobre(base.db, usuario, cartera, grupo, 'Comida')).rejects.toBeInstanceOf(
      CarteraArchivada,
    )
  })

  it('renombra un sobre y conserva su disponible y su historial', async () => {
    const id = await sobre('Comida')
    await asignar(id, '4000.00')
    await gasto(id, '450.00')

    await cambiarNombreSobre(base.db, usuario, cartera, id, 'Alimentacion')

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.nombre).toBe('Alimentacion')
    expect(el.disponible).toBe('3550.00')
  })

  it('rechaza renombrar a un nombre que ya existe en la cartera', async () => {
    await sobre('Comida')
    const otro = await sobre('Transporte')

    await expect(
      cambiarNombreSobre(base.db, usuario, cartera, otro, 'Comida'),
    ).rejects.toBeInstanceOf(NombreDeSobreDuplicado)
  })

  it('reordena sin cambiar nombre ni disponible', async () => {
    const id = await sobre('Comida')
    await asignar(id, '1000.00')

    await cambiarOrdenSobre(base.db, usuario, cartera, id, 7)

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.orden).toBe(7)
    expect(el.disponible).toBe('1000.00')
  })

  it('rechaza un orden negativo o no entero', async () => {
    const id = await sobre('Comida')
    await expect(cambiarOrdenSobre(base.db, usuario, cartera, id, -1)).rejects.toBeInstanceOf(
      OrdenDeSobreInvalido,
    )
    await expect(cambiarOrdenSobre(base.db, usuario, cartera, id, 1.5)).rejects.toBeInstanceOf(
      OrdenDeSobreInvalido,
    )
  })

  it('mueve un sobre a otro grupo sin tocar su disponible', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2500.00')
    const otroGrupo = await crearGrupo(base.db, cartera, { nombre: 'Variables' })

    await moverSobreDeGrupo(base.db, usuario, cartera, id, otroGrupo)

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.grupo_id).toBe(otroGrupo)
    expect(el.disponible).toBe('2500.00')
  })
})

describe('sobres: el disponible se deriva', () => {
  it('es la suma de asignaciones menos los movimientos no traspaso', async () => {
    const id = await sobre('Comida')
    await asignar(id, '4000.00')
    await gasto(id, '450.00')

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.disponible).toBe('3550.00')
  })

  it('excluye los traspasos y los movimientos eliminados', async () => {
    const id = await sobre('Comida')
    await asignar(id, '1000.00')

    const cuenta_id = await crearCuenta(base.db, cartera, { nombre: 'Banco' })
    await crearMovimiento(base.db, { cuenta_id, sobre_id: id, tipo: 'traspaso', monto: '-400.00' })
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: id,
      tipo: 'gasto',
      monto: '-100.00',
      eliminado_en: new Date(),
    })

    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('1000.00')
  })

  it('se ajusta solo cuando se borra un movimiento, sin corregir ningun saldo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '1000.00')
    const movimiento_id = await gasto(id, '250.00')
    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('750.00')

    const { sql } = await import('drizzle-orm')
    await base.db.execute(sql`update movimientos set eliminado_en = now() where id = ${movimiento_id}`)

    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('1000.00')
  })

  it('no es un dato almacenado: la tabla no tiene columna de disponible', async () => {
    const { readFile } = await import('node:fs/promises')
    const fuente = await readFile('src/db/tablas/sobres.ts', 'utf8')

    // Un `disponible:` en la definicion de la tabla seria un disponible almacenado, que
    // es justo lo que el requerimiento prohibe.
    const definicion = fuente.slice(
      fuente.indexOf("pgTable(\n  'sobres'"),
      fuente.indexOf("pgTable(\n  'asignaciones'"),
    )

    expect(definicion).not.toMatch(/^\s*disponible:/m)
  })

  it('arrastra lo que sobra de un periodo al siguiente', async () => {
    const id = await sobre('Comida')
    await asignar(id, '800.00', ENERO)

    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('800.00')
    expect((await buscarSobre(base.db, usuario, cartera, id, FEBRERO)).disponible).toBe('800.00')
    expect((await buscarSobre(base.db, usuario, cartera, id, MARZO)).disponible).toBe('800.00')
  })

  it('incluye en el periodo actual lo asignado en un mes anterior', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2000.00', ENERO)

    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('2000.00')
  })

  it('muestra el valor de un periodo pasado, no el de hoy', async () => {
    const id = await sobre('Comida')
    await asignar(id, '3000.00', ENERO)
    await gasto(id, '500.00', '2026-01-20')
    await asignar(id, '7000.00', MARZO)

    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('2500.00')
    expect((await buscarSobre(base.db, usuario, cartera, id, MARZO)).disponible).toBe('9500.00')
  })

  it('acumula entre periodos lo asignado y lo gastado en el nuevo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '800.00', ENERO)
    await asignar(id, '500.00', FEBRERO)
    await gasto(id, '300.00', '2026-02-10')

    const febrero = await buscarSobre(base.db, usuario, cartera, id, FEBRERO)
    expect(febrero.disponible).toBe('1000.00')
  })
})

describe('sobres: asignar', () => {
  it('aumenta el disponible en el importe asignado', async () => {
    const id = await sobre('Comida')
    const creada = await asignarASobre(base.db, usuario, cartera, id, ENERO, '3000.00')

    expect(creada.monto).toBe('3000.00')
    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('3000.00')
  })

  it('admite varias asignaciones del mismo periodo y las suma', async () => {
    const id = await sobre('Comida')
    await asignarASobre(base.db, usuario, cartera, id, ENERO, '3000.00')
    await asignarASobre(base.db, usuario, cartera, id, ENERO, '500.00')

    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('3500.00')
    expect(await listarAsignaciones(base.db, usuario, cartera, id)).toHaveLength(2)
  })

  it('rechaza un importe negativo o cero, porque el sobregiro es un movimiento', async () => {
    const id = await sobre('Comida')

    await expect(
      asignarASobre(base.db, usuario, cartera, id, ENERO, '-500.00'),
    ).rejects.toBeInstanceOf(AsignacionNoPositiva)
    await expect(
      asignarASobre(base.db, usuario, cartera, id, ENERO, '0.00'),
    ).rejects.toBeInstanceOf(AsignacionNoPositiva)
  })

  it('no deja asignar a un sobre archivado, y lo dice', async () => {
    const id = await sobre('Comida')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    await expect(
      asignarASobre(base.db, usuario, cartera, id, ENERO, '100.00'),
    ).rejects.toBeInstanceOf(SobreArchivado)
  })

  it('no deja asignar a un sobre de otra cartera', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Trabajo' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Fijos' })
    const ajeno = (await crearSobre(base.db, otro, carteraAjena, grupoAjeno, 'Comida')).id

    await expect(
      asignarASobre(base.db, usuario, cartera, ajeno, ENERO, '100.00'),
    ).rejects.toBeInstanceOf(SobreNoExiste)
  })

  it('refleja de inmediato el importe corregido', async () => {
    const id = await sobre('Comida')
    const { id: asignacion_id } = await asignarASobre(
      base.db, usuario, cartera, id, ENERO, '1000.00',
    )

    await corregirAsignacion(base.db, usuario, cartera, asignacion_id, '1500.00')

    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).disponible).toBe('1500.00')
  })

  it('no deja corregir a un importe no positivo', async () => {
    const id = await sobre('Comida')
    const { id: asignacion_id } = await asignarASobre(
      base.db, usuario, cartera, id, ENERO, '1000.00',
    )

    await expect(
      corregirAsignacion(base.db, usuario, cartera, asignacion_id, '0.00'),
    ).rejects.toBeInstanceOf(AsignacionNoPositiva)
  })

  it('no deja corregir una asignacion de otra cartera', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Trabajo' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Fijos' })
    const ajeno = (await crearSobre(base.db, otro, carteraAjena, grupoAjeno, 'Comida')).id
    const asignacion_id = await asignar(ajeno, '100.00')

    await expect(
      corregirAsignacion(base.db, usuario, cartera, asignacion_id, '200.00'),
    ).rejects.toBeInstanceOf(AsignacionNoExiste)
  })
})

describe('sobres: el disponible puede quedar negativo', () => {
  it('deja el disponible en negativo cuando el gasto supera lo asignado', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2000.00')
    await gasto(id, '2400.00')

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.disponible).toBe('-400.00')
    expect(el.negativo).toBe(true)
  })

  it('no rechaza el gasto que excede el disponible', async () => {
    const id = await sobre('Comida')
    await asignar(id, '200.00')

    await expect(gasto(id, '900.00')).resolves.toBeTypeOf('number')
  })

  it('muestra a la vez dos sobres en negativo', async () => {
    const a = await sobre('Comida')
    const b = await sobre('Transporte')
    await asignar(a, '100.00')
    await asignar(b, '100.00')
    await gasto(a, '500.00')
    await gasto(b, '700.00')

    const lista = await listarSobres(base.db, usuario, cartera, ENERO)
    expect(lista.filter((s) => s.negativo).map((s) => s.disponible)).toEqual([
      '-400.00',
      '-600.00',
    ])
  })
})

describe('sobres: tapar un desborde', () => {
  it('deja el disponible en cero al tapar exactamente el negativo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2000.00')
    await gasto(id, '2400.00')

    const resultado = await taparDesborde(base.db, usuario, cartera, id, ENERO, '400.00')

    expect(resultado.disponible).toBe('0.00')
    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).negativo).toBe(false)
  })

  it('deja el sobre en negativo cuando se tapa parcialmente', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2000.00')
    await gasto(id, '2400.00')

    await taparDesborde(base.db, usuario, cartera, id, ENERO, '200.00')

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.disponible).toBe('-200.00')
    expect(el.negativo).toBe(true)
  })

  it('rechaza tapar mas de lo que el sobre debe', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2000.00')
    await gasto(id, '2400.00')

    await expect(
      taparDesborde(base.db, usuario, cartera, id, ENERO, '600.00'),
    ).rejects.toBeInstanceOf(TapaDemasiado)
  })

  it('rechaza tapar un sobre que no esta en negativo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '1000.00')

    await expect(
      taparDesborde(base.db, usuario, cartera, id, ENERO, '100.00'),
    ).rejects.toBeInstanceOf(NoHayDesborde)
  })

  it('rechaza tapar un importe no positivo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2000.00')
    await gasto(id, '2400.00')

    await expect(
      taparDesborde(base.db, usuario, cartera, id, ENERO, '-400.00'),
    ).rejects.toBeInstanceOf(AsignacionNoPositiva)
  })

  it('no deja tapar un sobre archivado', async () => {
    const id = await sobre('Comida')
    await asignar(id, '2000.00')
    await gasto(id, '2400.00')
    const { sql } = await import('drizzle-orm')
    await base.db.execute(sql`update sobres set archivado = true where id = ${id}`)

    await expect(
      taparDesborde(base.db, usuario, cartera, id, ENERO, '400.00'),
    ).rejects.toBeInstanceOf(SobreArchivado)
  })
})

describe('sobres: mover dinero entre sobres', () => {
  it('disminuye el origen y aumenta el destino por el mismo importe', async () => {
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await asignar(origen, '3000.00')
    await asignar(destino, '800.00')

    const resultado = await moverEntreSobres(
      base.db, usuario, cartera, origen, destino, ENERO, '500.00',
    )

    expect(resultado.origen).toBe('2500.00')
    expect(resultado.destino).toBe('1300.00')
  })

  it('rechaza mover mas de lo disponible en el origen', async () => {
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await asignar(origen, '3000.00')

    await expect(
      moverEntreSobres(base.db, usuario, cartera, origen, destino, ENERO, '5000.00'),
    ).rejects.toBeInstanceOf(DisponibleInsuficiente)
  })

  it('deja la suma de disponibles de la cartera igual', async () => {
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await asignar(origen, '3000.00')
    await asignar(destino, '800.00')

    const antes = await sumaDeDisponibles()
    await moverEntreSobres(base.db, usuario, cartera, origen, destino, ENERO, '500.00')
    const despues = await sumaDeDisponibles()

    expect(despues).toBe(antes)
    expect(antes).toBe('3800.00')
  })

  it('rechaza mover a si mismo, y no a un monto no positivo', async () => {
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await asignar(origen, '3000.00')

    // Mismo sobre: la operacion no tendria sentido, porque restar y sumar al mismo
    // disponible lo deja donde estaba.
    await expect(
      moverEntreSobres(base.db, usuario, cartera, origen, origen, ENERO, '100.00'),
    ).rejects.toBeInstanceOf(MismoSobre)

    await expect(
      moverEntreSobres(base.db, usuario, cartera, origen, destino, ENERO, '0.00'),
    ).rejects.toBeInstanceOf(AsignacionNoPositiva)
  })

  it('deja la contraparte del origen como una reasignacion, no como un movimiento', async () => {
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await asignar(origen, '3000.00')

    await moverEntreSobres(base.db, usuario, cartera, origen, destino, ENERO, '500.00')

    const contraparte = await listarAsignaciones(base.db, usuario, cartera, origen)
    expect(contraparte).toHaveLength(2)
    expect(contraparte[0]?.monto).toBe('-500.00')
    expect(contraparte[0]?.motivo).toBe('reasignacion')
  })
})

describe('sobres: borrar y archivar', () => {
  it('elimina de forma definitiva un sobre recien creado y sin usar', async () => {
    const id = await sobre('Comida')

    await eliminarSobre(base.db, usuario, cartera, id, ENERO)

    await expect(existeSobre(base.db, usuario, cartera, id)).rejects.toBeInstanceOf(
      SobreNoExiste,
    )
  })

  it('no elimina un sobre con saldo, y pide vaciarlo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '100.00')

    await expect(eliminarSobre(base.db, usuario, cartera, id, ENERO)).rejects.toBeInstanceOf(
      SobreConSaldo,
    )
  })

  it('no elimina un sobre con movimientos, y ofrece archivarlo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '1000.00')
    await gasto(id, '1000.00')

    await expect(eliminarSobre(base.db, usuario, cartera, id, ENERO)).rejects.toBeInstanceOf(
      SobreConMovimientos,
    )
  })

  it('archiva un sobre vaciado y lo saca de la lista, sin borrarlo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '1000.00')
    await gasto(id, '1000.00')

    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    expect((await listarSobres(base.db, usuario, cartera, ENERO)).map((s) => s.nombre)).toEqual([])
    expect((await buscarSobre(base.db, usuario, cartera, id, ENERO)).archivado).toBe(true)
  })

  it('rechaza archivar un sobre con saldo', async () => {
    const id = await sobre('Comida')
    await asignar(id, '100.00')

    await expect(archivarSobre(base.db, usuario, cartera, id, ENERO)).rejects.toBeInstanceOf(
      SobreConSaldo,
    )
  })

  it('archiva un sobre recien creado, que esta en cero por no tener nada', async () => {
    const id = await sobre('Comida')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    expect((await listarSobresArchivados(base.db, usuario, cartera, ENERO)).map((s) => s.nombre)).toEqual([
      'Comida',
    ])
  })

  it('restaura un sobre archivado al agrupamiento visible', async () => {
    const id = await sobre('Comida')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    await restaurarSobre(base.db, usuario, cartera, id)

    expect((await listarSobres(base.db, usuario, cartera, ENERO)).map((s) => s.nombre)).toEqual([
      'Comida',
    ])
  })

  it('no archiva un sobre de otra cartera, ni aunque se conozca el id', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Trabajo' })
    const grupoAjeno = await crearGrupo(base.db, carteraAjena, { nombre: 'Fijos' })
    const ajeno = (await crearSobre(base.db, otro, carteraAjena, grupoAjeno, 'Comida')).id

    await expect(
      archivarSobre(base.db, usuario, cartera, ajeno, ENERO),
    ).rejects.toBeInstanceOf(SobreNoExiste)
  })
})

describe('sobres: un sobre archivado sigue recibiendo devoluciones', () => {
  it('vuelve a tener disponible cuando recibe una devolucion, y sigue archivado', async () => {
    const id = await sobre('Comida')
    await asignar(id, '500.00')
    await gasto(id, '500.00')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    const cuenta_id = await crearCuenta(base.db, cartera, { nombre: 'Banco' })
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: id,
      tipo: 'ingreso',
      monto: '200.00',
      fecha: '2026-01-20',
      descripcion: 'Devolucion',
    })

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.disponible).toBe('200.00')
    expect(el.archivado).toBe(true)
  })

  it('no recibe asignaciones mientras este archivado', async () => {
    const id = await sobre('Comida')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    await expect(
      asignarASobre(base.db, usuario, cartera, id, ENERO, '100.00'),
    ).rejects.toBeInstanceOf(SobreArchivado)
  })

  it('un sobre archivado en negativo sigue visible y marcado', async () => {
    // Por el camino real: se archiva vacio y despues se gasta. Poner `archivado` a
    // mano con un update crudo probaria un estado que la aplicacion nunca produce.
    const id = await sobre('Comida')
    await asignar(id, '100.00')
    await gasto(id, '100.00')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    await gasto(id, '600.00')

    const el = await buscarSobre(base.db, usuario, cartera, id, ENERO)
    expect(el.archivado).toBe(true)
    expect(el.negativo).toBe(true)
    expect(el.disponible).toBe('-600.00')
  })

  it('un archivado en negativo aparece entre los que hay que mirar', async () => {
    // El listado normal y el de archivados estan partidos, asi que un sobre en las dos
    // condiciones no lo muestra ninguno. Este listado lo rescata.
    const id = await sobre('Comida')
    await asignar(id, '100.00')
    await gasto(id, '100.00')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)
    await gasto(id, '600.00')

    const marcados = await listarSobresEnNegativo(base.db, usuario, cartera, ENERO)
    expect(marcados.map((s) => s.id)).toContain(id)
    expect(await listarSobres(base.db, usuario, cartera, ENERO)).toHaveLength(0)
  })

  it('un archivado con saldo por devolucion vuelve a aparecer', async () => {
    const cuenta_id = await crearCuenta(base.db, cartera, { nombre: 'Banco devoluciones' })
    const id = await sobre('Comida')
    await asignar(id, '100.00')
    await gasto(id, '100.00')
    await archivarSobre(base.db, usuario, cartera, id, ENERO)

    expect(
      await listarSobresArchivadosConSaldo(base.db, usuario, cartera, ENERO),
    ).toHaveLength(0)

    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: id,
      tipo: 'ingreso',
      monto: '200.00',
      fecha: '2026-01-20',
      descripcion: 'Devolucion',
    })

    const conSaldo = await listarSobresArchivadosConSaldo(base.db, usuario, cartera, ENERO)
    expect(conSaldo.map((s) => s.id)).toEqual([id])
    expect(conSaldo[0]?.disponible).toBe('200.00')
  })

  it('no se puede mover dinero hacia un sobre archivado', async () => {
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await asignar(origen, '1000.00')
    await archivarSobre(base.db, usuario, cartera, destino, ENERO)

    // El destino recibe una asignacion, y R4 y R11 lo prohiben para los archivados.
    await expect(
      moverEntreSobres(base.db, usuario, cartera, origen, destino, ENERO, '100.00'),
    ).rejects.toBeInstanceOf(SobreArchivado)

    expect((await buscarSobre(base.db, usuario, cartera, origen, ENERO)).disponible).toBe(
      '1000.00',
    )
  })

  it('se puede sacar dinero de un sobre archivado hacia otro', async () => {
    // Sacar solo disminuye el disponible del origen, y R11 no lo prohibe: es al
    // sobre archivado al que no se le puede meter.
    const cuenta_id = await crearCuenta(base.db, cartera, { nombre: 'Banco devoluciones' })
    const origen = await sobre('Comida')
    const destino = await sobre('Transporte')
    await asignar(origen, '100.00')
    await gasto(origen, '100.00')
    await archivarSobre(base.db, usuario, cartera, origen, ENERO)
    await crearMovimiento(base.db, {
      cuenta_id,
      sobre_id: origen,
      tipo: 'ingreso',
      monto: '300.00',
      fecha: '2026-01-20',
      descripcion: 'Devolucion',
    })

    await moverEntreSobres(base.db, usuario, cartera, origen, destino, ENERO, '300.00')

    expect((await buscarSobre(base.db, usuario, cartera, origen, ENERO)).disponible).toBe(
      '0.00',
    )
    expect((await buscarSobre(base.db, usuario, cartera, destino, ENERO)).disponible).toBe(
      '300.00',
    )
  })
})

/**
 * La suma de todos los disponibles de la cartera, en SQL.
 *
 * Va en la base porque la regla del dinero prohibe sumar importes en JavaScript, y las
 * pruebas no tienen permiso para hacer lo que el codigo de produccion no puede.
 */
async function sumaDeDisponibles(periodo = ENERO): Promise<string> {
  const { sql } = await import('drizzle-orm')
  const { resumenDeCartera } = await import('@/repos/dinero-suelto')
  return (await resumenDeCartera(base.db, usuario, cartera, periodo)).asignado
}
