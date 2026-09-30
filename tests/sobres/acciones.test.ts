import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearUsuario,
} from '../helpers/fabricas'
import { archivarCartera } from '@/repos/carteras'
import {
  archivarSobre,
  buscarSobre,
  crearSobre,
  disponibleDeSobre,
  listarSobres,
} from '@/repos/sobres'
import { totalDeGrupo } from '@/repos/grupos'
import type { Base } from '@/db/tipos'
import type { ResultadoDeSobre } from '@/sobres/acciones'

/**
 * Las Server Actions de `sobres`: la sesion, el token y la traduccion de errores.
 *
 * Son adaptadores finos, y un adaptador fino se rompe por lo que tiene alrededor. Las
 * tres cosas que estas pruebas vigilan son las que no se ven leyendo el repositorio:
 *
 * 1. **Sin sesion no se escribe nada.** Una accion que no puede saber de quien es la
 *    cartera no puede escribir: `exigirSesion` va antes del repositorio, y la prueba
 *    comprueba que no quedo ningun sobre, no solo que volvio un error.
 * 2. **El token de proteccion se exige.** Es el doble submit: sin el, la peticion no
 *    trae nada que la vincule a esta sesion.
 * 3. **Cada error de dominio llega con su mensaje.** Un `catch` que se come el error y
 *    devuelve un texto generico es indistinguible de uno que no intento nada, y el
 *    usuario no puede saber si su sobre existe, si esta archivado o si el nombre esta
 *    repetido. Por eso la tabla de abajo no prueba que el error se lance —eso es del
 *    repositorio— sino que el mensaje del error de dominio llegue intacto a la pantalla.
 *
 * `TokenRequerido` NO esta en la lista de errores de dominio, y es a proposito: es lo
 * que hacen `cuentas`, `grupos` y `carteras`. El mensaje de un envio sin token es el
 * generico, y no se cambia aqui para que `sobres` no sea el unico que lo hace.
 */

const dbPorDefecto = { valor: null as Base | null }
const sesionPorDefecto = { valor: { usuario_id: 0 } as { usuario_id: number } | undefined }
const proteccionPorDefecto = { valido: true }

/**
 * `revalidatePath` necesita el almacen de generacion estatica de Next, que solo existe
 * dentro de una peticion. Se sustituye por una espia para poder afirmar **que** camino se
 * revalida: una accion que escribe y revalida otra ruta deja la pantalla vieja, que es un
 * fallo que no se ve en la base de datos.
 */
const { revalidar } = vi.hoisted(() => ({ revalidar: vi.fn() }))

vi.mock('next/cache', () => ({
  revalidatePath: revalidar,
  revalidateTag: vi.fn(),
}))

vi.mock('@/db/cliente', () => ({
  obtenerCliente: () => {
    if (!dbPorDefecto.valor) throw new Error('la prueba no fijo la base')
    return dbPorDefecto.valor
  },
}))

vi.mock('@/sesion/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/sesion/server')>()
  return {
    ...original,
    sesionActual: async () => sesionPorDefecto.valor,
    exigirSesion: async () => {
      if (!sesionPorDefecto.valor) throw new original.SesionRequerida()
      return sesionPorDefecto.valor
    },
  }
})

vi.mock('@/sesion/proteccion', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/sesion/proteccion')>()
  const { TokenRequerido } = await import('@/sesion/server')
  return {
    ...original,
    exigirTokenProteccion: async () => {
      if (!proteccionPorDefecto.valido) throw new TokenRequerido()
    },
  }
})

const {
  accionArchivarSobre,
  accionAsignarASobre,
  accionCorregirAsignacion,
  accionCrearSobre,
  accionEliminarSobre,
  accionMoverEntreSobres,
  accionMoverSobreDeGrupo,
  accionTaparDesborde,
} = await import('@/sobres/acciones')

const ENERO = '2026-01'
const INICIAL: ResultadoDeSobre = { ok: false }

let base: BaseDePruebas
let mio: number
let cartera: number
let cuenta: number
let grupo: number
let otro: number
let otroGrupo: number
let ajena: number
let grupoAjeno: number

/** Datos compartidos por los casos: cada prueba arma lo que necesita. */
interface Contexto {
  sobre: number
  vacio: number
  conSaldo: number
  conMovimientos: number
  archivado: number
  enNegativo: number
  asignacion: number
  /** El sobre con la contraparte de un traspaso. */
  traspaso: number
  /** Esa contraparte, que por definicion no se corrige a mano. */
  reasignacion: number
}

let ctx: Contexto

function datos(campos: Record<string, string>): FormData {
  const form = new FormData()
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor)
  return form
}

/** El disponible de un sobre, sin depender del orden en que lo devuelva el listado. */
async function disponibleDe(sobre_id: number): Promise<string> {
  return disponibleDeSobre(base.db, mio, cartera, sobre_id, ENERO)
}

beforeEach(async () => {
  revalidar.mockClear()
  base = await crearBaseDePruebas()
  dbPorDefecto.valor = base.db

  mio = await crearUsuario(base.db)
  sesionPorDefecto.valor = { usuario_id: mio }
  proteccionPorDefecto.valido = true

  cartera = await crearCartera(base.db, mio, { nombre: 'Mia' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  otroGrupo = await crearGrupo(base.db, cartera, { nombre: 'Variables' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: 'Banco', saldo_inicial: '10000.00' })

  const otroUsuario = await crearUsuario(base.db)
  ajena = await crearCartera(base.db, otroUsuario, { nombre: 'Suyos' })
  grupoAjeno = await crearGrupo(base.db, ajena, { nombre: 'Ajeno' })
  otro = (await crearSobre(base.db, mio, cartera, grupo, 'Transporte')).id

  ctx = {
    sobre: (await crearSobre(base.db, mio, cartera, grupo, 'Comida')).id,
    vacio: 0,
    conSaldo: 0,
    conMovimientos: 0,
    archivado: 0,
    enNegativo: 0,
    asignacion: 0,
    traspaso: 0,
    reasignacion: 0,
  }
  ctx.vacio = (await crearSobre(base.db, mio, cartera, grupo, 'Nuevo')).id

  ctx.conSaldo = (await crearSobre(base.db, mio, cartera, grupo, 'Con saldo')).id
  await crearAsignacion(base.db, { sobre_id: ctx.conSaldo, monto: '100.00', periodo: ENERO })

  ctx.conMovimientos = (await crearSobre(base.db, mio, cartera, grupo, 'Con movimientos')).id
  await crearAsignacion(base.db, {
    sobre_id: ctx.conMovimientos,
    monto: '1000.00',
    periodo: ENERO,
  })
  await crearMovimiento(base.db, {
    cuenta_id: cuenta,
    sobre_id: ctx.conMovimientos,
    monto: '-1000.00',
    fecha: '2026-01-10',
  })

  ctx.archivado = (await crearSobre(base.db, mio, cartera, grupo, 'Archivado')).id
  await archivarSobre(base.db, mio, cartera, ctx.archivado, ENERO)

  ctx.enNegativo = (await crearSobre(base.db, mio, cartera, grupo, 'En rojo')).id
  await crearAsignacion(base.db, { sobre_id: ctx.enNegativo, monto: '100.00', periodo: ENERO })
  await crearMovimiento(base.db, {
    cuenta_id: cuenta,
    sobre_id: ctx.enNegativo,
    monto: '-500.00',
    fecha: '2026-01-10',
  })

  ctx.asignacion = await crearAsignacion(base.db, {
    sobre_id: ctx.sobre,
    monto: '800.00',
    periodo: ENERO,
  })

  // La reasignacion va en un sobre propio: si compartiera sobre con `ctx.sobre`, el
  // disponible de ese sobre seria 700 y cada prueba tendria que restarlo a mano.
  ctx.traspaso = (await crearSobre(base.db, mio, cartera, grupo, 'Del traspaso')).id
  await crearAsignacion(base.db, { sobre_id: ctx.traspaso, monto: '100.00', periodo: ENERO })
  ctx.reasignacion = await crearAsignacion(base.db, {
    sobre_id: ctx.traspaso,
    monto: '-100.00',
    periodo: ENERO,
    motivo: 'reasignacion',
  })
})

afterEach(async () => {
  dbPorDefecto.valor = null
  sesionPorDefecto.valor = undefined
  proteccionPorDefecto.valido = true
  await base.cerrar()
})

describe('sobres: sin sesion no se hace nada', () => {
  it('no crea el sobre, y lo dice con el mensaje de sesion', async () => {
    sesionPorDefecto.valor = undefined

    const resultado = await accionCrearSobre(
      cartera,
      INICIAL,
      datos({ nombre: 'Sin sesion', grupo_id: String(grupo) }),
    )

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe('Necesitas iniciar sesion.')
    // Lo que importa: no quedo el sobre. Un error de forma no escribe, y uno de permiso
    // tampoco: la sesion va antes del repositorio, precisamente para que no quede nada.
    const nombres = (await listarSobres(base.db, mio, cartera, ENERO)).map((s) => s.nombre)
    expect(nombres).not.toContain('Sin sesion')
  })

  it('tampoco asigna, ni archiva, ni borra: el corte esta antes del repositorio', async () => {
    sesionPorDefecto.valor = undefined

    const casos = [
      accionAsignarASobre(cartera, ctx.sobre, INICIAL, datos({ periodo: ENERO, monto: '100' })),
      accionArchivarSobre(cartera, ctx.sobre, INICIAL, datos({ periodo: ENERO })),
      accionEliminarSobre(cartera, ctx.sobre, INICIAL, datos({ periodo: ENERO })),
      accionTaparDesborde(cartera, ctx.enNegativo, INICIAL, datos({ periodo: ENERO, monto: '400' })),
    ]

    for (const resultado of await Promise.all(casos)) {
      expect(resultado.ok).toBe(false)
      expect(resultado.error).toBe('Necesitas iniciar sesion.')
    }

    // El sobre sigue ahi, sin archivar y con lo que tenia.
    expect(await disponibleDe(ctx.sobre)).toBe('800.00')
    expect((await listarSobres(base.db, mio, cartera, ENERO)).map((s) => s.id)).toContain(ctx.sobre)
  })
})

describe('sobres: el token de proteccion se exige', () => {
  it('sin token no se escribe, aunque la sesion exista', async () => {
    proteccionPorDefecto.valido = false

    const resultado = await accionAsignarASobre(
      cartera,
      ctx.sobre,
      INICIAL,
      datos({ periodo: ENERO, monto: '5000.00' }),
    )

    expect(resultado.ok).toBe(false)
    // El mensaje es el generico a proposito, como en cuentas, grupos y carteras: lo que
    // no se permite es la escritura, y el texto no le dice al otro sitio por que fallo.
    expect(resultado.error).toBe('Ocurrio un problema. Intenta de nuevo.')
    expect(await disponibleDe(ctx.sobre)).toBe('800.00')
  })
})

/**
 * Cada error de dominio, con el mensaje que el usuario tiene que leer.
 *
 * La columna `mensaje` es la del error lanzado por el repositorio. Si la accion la
 * cambiara, la prueba falla: es la unica forma de que el texto de la pantalla siga
 * siendo el que el repositorio escribio, en vez de uno parecido.
 */
describe('sobres: cada error de dominio llega a la pantalla con su mensaje', () => {
  const CASOS: Array<{
    nombre: string
    /** El mensaje del error de dominio. Con expresion regular cuando el texto incluye el
     *  importe y no tiene sentido fijarlo entero. */
    mensaje: string | RegExp
    correr: () => Promise<ResultadoDeSobre>
  }> = [
    {
      nombre: 'el grupo vacio lo responde el dominio, no el formulario',
      mensaje: 'Elige un grupo: todos los sobres tienen que estar en uno.',
      correr: () =>
        accionCrearSobre(cartera, INICIAL, datos({ nombre: 'Sin grupo', grupo_id: '' })),
    },
    {
      nombre: 'un nombre repetido',
      mensaje: 'Ya hay un sobre con ese nombre en esta cartera.',
      correr: () =>
        accionCrearSobre(cartera, INICIAL, datos({ nombre: 'Comida', grupo_id: String(grupo) })),
    },
    {
      nombre: 'un grupo de otra cartera',
      mensaje: 'Ese grupo no es de esta cartera.',
      correr: () =>
        accionCrearSobre(
          cartera,
          INICIAL,
          datos({ nombre: 'Ajeno', grupo_id: String(grupoAjeno) }),
        ),
    },
    {
      nombre: 'una cartera que no es del usuario',
      mensaje: 'Esa cartera no existe, o no es tuya.',
      correr: () =>
        accionCrearSobre(ajena, INICIAL, datos({ nombre: 'Intruso', grupo_id: String(grupoAjeno) })),
    },
    {
      nombre: 'un sobre que no existe',
      mensaje: 'El sobre no existe en esta cartera.',
      correr: () => accionArchivarSobre(cartera, 999999, INICIAL, datos({ periodo: ENERO })),
    },
    {
      nombre: 'archivar con saldo',
      mensaje: /Vacialo antes de continuar/,
      correr: () => accionArchivarSobre(cartera, ctx.conSaldo, INICIAL, datos({ periodo: ENERO })),
    },
    {
      nombre: 'borrar con movimientos, que ofrece archivar',
      mensaje: 'Este sobre tiene movimientos, asi que no se elimina: se archiva.',
      correr: () =>
        accionEliminarSobre(cartera, ctx.conMovimientos, INICIAL, datos({ periodo: ENERO })),
    },
    {
      nombre: 'asignar a un archivado',
      mensaje: /Desarchivalo antes/,
      correr: () =>
        accionAsignarASobre(
          cartera,
          ctx.archivado,
          INICIAL,
          datos({ periodo: ENERO, monto: '100.00' }),
        ),
    },
    {
      nombre: 'asignar un importe que no es positivo',
      mensaje: 'El importe tiene que ser positivo.',
      // La validacion acepta el cero —el signo es regla del dominio— y el repositorio lo
      // rechaza: por eso el mensaje llega de ahi y no del formulario.
      correr: () =>
        accionAsignarASobre(cartera, ctx.sobre, INICIAL, datos({ periodo: ENERO, monto: '0' })),
    },
    {
      nombre: 'tapar mas de lo que el sobre debe',
      mensaje: /No podes tapar mas de lo que el sobre debe/,
      correr: () =>
        accionTaparDesborde(cartera, ctx.enNegativo, INICIAL, datos({ periodo: ENERO, monto: '900' })),
    },
    {
      nombre: 'tapar un sobre que no esta en negativo',
      mensaje: /no esta en negativo/,
      correr: () =>
        accionTaparDesborde(cartera, ctx.sobre, INICIAL, datos({ periodo: ENERO, monto: '100' })),
    },
    {
      nombre: 'mover a si mismo',
      mensaje: 'El origen y el destino son el mismo sobre.',
      correr: () =>
        accionMoverEntreSobres(
          cartera,
          ctx.sobre,
          INICIAL,
          datos({ periodo: ENERO, monto: '100', destino_id: String(ctx.sobre) }),
        ),
    },
    {
      nombre: 'mover mas de lo disponible en el origen',
      mensaje: /solo tiene .* disponibles/,
      correr: () =>
        accionMoverEntreSobres(
          cartera,
          ctx.sobre,
          INICIAL,
          datos({ periodo: ENERO, monto: '5000', destino_id: String(otro) }),
        ),
    },
    {
      nombre: 'corregir la contraparte de una reasignacion',
      mensaje: 'Esa asignacion no existe, o no es una asignacion tuya.',
      correr: () =>
        accionCorregirAsignacion(
          cartera,
          ctx.traspaso,
          ctx.reasignacion,
          INICIAL,
          datos({ monto: '100.00' }),
        ),
    },
    {
      nombre: 'mover a un grupo de otra cartera',
      mensaje: 'Ese grupo no es de esta cartera.',
      correr: () =>
        accionMoverSobreDeGrupo(
          cartera,
          ctx.sobre,
          INICIAL,
          datos({ grupo_id: String(grupoAjeno) }),
        ),
    },
  ]

  it.each(CASOS)('$nombre', async ({ mensaje, correr }) => {
    const resultado = await correr()

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(mensaje)
  })

  it('el error de borrar con movimientos es el unico que ofrece la salida', async () => {
    const resultado = await accionEliminarSobre(
      cartera,
      ctx.conMovimientos,
      INICIAL,
      datos({ periodo: ENERO }),
    )

    // `ofrece` es lo que la UI usa para pintar "archivalo en su lugar". Perderlo deja al
    // usuario con un error y sin la unica operacion que si lo resuelve.
    expect(resultado.ofrece).toBe('archivar')
  })

  it('los demas errores no ofrecen nada, porque no tienen salida', async () => {
    const resultado = await accionArchivarSobre(
      cartera,
      ctx.conSaldo,
      INICIAL,
      datos({ periodo: ENERO }),
    )

    expect(resultado.ofrece).toBeUndefined()
  })

  it('el error de forma trae el mensaje por campo, no el generico', async () => {
    const resultado = await accionCrearSobre(
      cartera,
      INICIAL,
      datos({ nombre: '   ', grupo_id: String(grupo) }),
    )

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toBe('Los datos enviados no son validos.')
    expect(resultado.campos?.nombre).toMatch(/vacio/i)
  })

  it('una cartera archivada responde con su mensaje, no con un 500', async () => {
    const propia = await crearCartera(base.db, mio, { nombre: 'Guardada' })
    const grupoPropio = await crearGrupo(base.db, propia, { nombre: 'Fijos' })
    await archivarCartera(base.db, mio, propia)

    const resultado = await accionCrearSobre(
      propia,
      INICIAL,
      datos({ nombre: 'Tarde', grupo_id: String(grupoPropio) }),
    )

    expect(resultado.error).toBe('Esta cartera esta archivada. Restaurala para volver a usarla.')
  })
})

describe('sobres: la accion correcta escribe y avisa', () => {
  it('crea el sobre, con el nombre ya recortado, y revalida la pagina', async () => {
    const resultado = await accionCrearSobre(
      cartera,
      INICIAL,
      datos({ nombre: '  Guardado  ', grupo_id: String(grupo) }),
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toBe('El sobre "Guardado" quedo creado con disponible en cero.')
    // Lo que se revisa es la ruta de la cartera: la escritura sin revalidar deja la
    // pantalla con los datos de antes.
    expect(revalidar).toHaveBeenCalledWith(`/cartera/${cartera}`)
    // El nombre que llega al aviso es el recortado, no el crudo del formulario.
    expect((await listarSobres(base.db, mio, cartera, ENERO)).map((s) => s.nombre)).toContain(
      'Guardado',
    )
  })

  it('corregir una asignacion cambia el disponible y lo dice', async () => {
    const resultado = await accionCorregirAsignacion(
      cartera,
      ctx.sobre,
      ctx.asignacion,
      INICIAL,
      datos({ monto: '1500.00' }),
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.aviso).toMatch(/corregida/i)
    expect(await disponibleDe(ctx.sobre)).toBe('1500.00')
  })

  it('mover entre sobres reparte el mismo dinero y no lo crea', async () => {
    const resultado = await accionMoverEntreSobres(
      cartera,
      ctx.sobre,
      INICIAL,
      datos({ periodo: ENERO, monto: '300', destino_id: String(otro) }),
    )

    expect(resultado.ok).toBe(true)
    expect(await disponibleDe(ctx.sobre)).toBe('500.00')
    expect(await disponibleDe(otro)).toBe('300.00')
  })

  it('mover de grupo deja el total donde ahora esta el sobre', async () => {
    const disponiblesAntes = (await listarSobres(base.db, mio, cartera, ENERO)).map(
      (s) => `${s.id}:${s.disponible}`,
    )

    const resultado = await accionMoverSobreDeGrupo(
      cartera,
      ctx.sobre,
      INICIAL,
      datos({ grupo_id: String(otroGrupo) }),
    )

    expect(resultado.ok).toBe(true)
    expect((await buscarSobre(base.db, mio, cartera, ctx.sobre, ENERO)).grupo_id).toBe(otroGrupo)
    // Sobre por sobre, los disponibles son los mismos: mudarse de grupo no cambia el saldo,
    // solo el sitio. Si alguno cambiara, el dinero se habria creado o perdido de un grupo
    // al otro, y los dos totales no podrian seguir cuadrando con el patrimonio.
    expect(
      (await listarSobres(base.db, mio, cartera, ENERO)).map((s) => `${s.id}:${s.disponible}`),
    ).toEqual(disponiblesAntes)
    // El grupo nuevo suma justo lo que vale el sobre que entro.
    expect(await totalDeGrupo(base.db, mio, cartera, otroGrupo, ENERO)).toBe('800.00')
  })

  it('eliminar un sobre vacio y sin movimientos si lo borra', async () => {
    const resultado = await accionEliminarSobre(
      cartera,
      ctx.vacio,
      INICIAL,
      datos({ periodo: ENERO }),
    )

    expect(resultado.ok).toBe(true)
    expect((await listarSobres(base.db, mio, cartera, ENERO)).map((s) => s.id)).not.toContain(
      ctx.vacio,
    )
  })
})
