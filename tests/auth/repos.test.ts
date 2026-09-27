import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DatosDuplicados, buscarPorNombreUsuario, crearUsuario } from '../../src/repos/usuarios'
import { buscarSesionVigente, eliminarSesion } from '../../src/repos/sesiones'
import { buscarCartera, contarCarteras, listarCarteras } from '../../src/repos/carteras'
import { crearCartera, crearSesion, crearUsuario as usuarioDePrueba } from '../helpers/fabricas'
import { crearBaseDePruebas } from '../helpers/pg'

describe('busqueda por nombre de usuario', () => {
  it('encuentra sin distinguir mayusculas, que es lo que exige el requisito', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'Alex' })

    expect(await buscarPorNombreUsuario(db, 'Alex')).toBeDefined()
    expect(await buscarPorNombreUsuario(db, 'alex')).toBeDefined()
    expect(await buscarPorNombreUsuario(db, 'ALEX')).toBeDefined()

    await cerrar()
  })

  it('devuelve undefined para un nombre de usuario que no existe', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'Ana' })

    expect(await buscarPorNombreUsuario(db, 'Bruno')).toBeUndefined()

    await cerrar()
  })
})

describe('duplicados en el registro', () => {
  it('rechaza un nombre de usuario duplicado por mayusculas y dice cual choco', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'Alex', correo: 'uno@ejemplo.test' })

    const error = await crearUsuario(db, {
      nombre: 'Otro',
      apellido: 'Usuario',
      nombre_usuario: 'alex',
      correo: 'otro@ejemplo.test',
      hash_contrasena: 'hash',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DatosDuplicados)
    expect((error as DatosDuplicados).campo).toBe('nombre_usuario')

    await cerrar()
  })

  it('rechaza un correo duplicado, sin confundirlo con el nombre de usuario', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    await usuarioDePrueba(db, { nombre_usuario: 'Ana', correo: 'ana@ejemplo.test' })

    const error = await crearUsuario(db, {
      nombre: 'Otra',
      apellido: 'Ana',
      nombre_usuario: 'otra',
      correo: 'ana@ejemplo.test',
      hash_contrasena: 'hash',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DatosDuplicados)
    expect((error as DatosDuplicados).campo).toBe('correo')

    await cerrar()
  })
})

describe('sesiones', () => {
  it('busca por token y guarda solo el hash', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db)
    const token = 'token-de-prueba-en-claro'

    await crearSesion(db, { usuario_id, token, token_proteccion: 'proteccion' })

    const encontrada = await buscarSesionVigente(db, token)
    expect(encontrada).toBeDefined()
    // Y la fila NO contiene el token en claro.
    expect(encontrada?.token_hash).not.toBe(token)
    expect(encontrada?.token_hash).toMatch(/^[0-9a-f]{64}$/)

    await cerrar()
  })

  it('no encuentra una sesion vencida', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db)
    const token = 'token-vencido'

    await crearSesion(db, { usuario_id, token, segundos_validez: -10 })

    expect(await buscarSesionVigente(db, token)).toBeUndefined()

    await cerrar()
  })

  it('cerrar sesion elimina la fila, y el token deja de servir', async () => {
    const { db, pg, cerrar } = await crearBaseDePruebas()
    const usuario_id = await usuarioDePrueba(db)
    const token = 'token-a-cerrar'
    const sesion = await crearSesion(db, { usuario_id, token })

    expect(await buscarSesionVigente(db, token)).toBeDefined()
    expect(await eliminarSesion(db, usuario_id, token)).toBe(true)

    // La fila desaparecio, no quedo marcada: no hay columna de revocacion.
    const restantes = await pg.query<{ total: number }>(
      'select count(*)::int as total from sesiones where id = $1',
      [sesion.id],
    )
    expect(restantes.rows[0]?.total).toBe(0)
    expect(await buscarSesionVigente(db, token)).toBeUndefined()

    await cerrar()
  })
})

describe('carteras', () => {
  it('exige usuario_id y cartera_id a la vez para leer una cartera', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const ana = await usuarioDePrueba(db, { nombre_usuario: 'ana' })
    const bruno = await usuarioDePrueba(db, { nombre_usuario: 'bruno' })

    const cartera_de_ana = await crearCartera(db, ana, { nombre: 'Casa' })

    expect((await buscarCartera(db, ana, cartera_de_ana))?.nombre).toBe('Casa')
    // El mismo cartera_id con otro usuario_id no existe. No hay fugas por id.
    expect(await buscarCartera(db, bruno, cartera_de_ana)).toBeUndefined()

    await cerrar()
  })

  it('cuenta y lista solo las carteras del usuario', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const ana = await usuarioDePrueba(db)
    const bruno = await usuarioDePrueba(db)

    await crearCartera(db, ana, { nombre: 'Casa' })
    await crearCartera(db, ana, { nombre: 'Negocio' })
    await crearCartera(db, bruno, { nombre: 'Ajena' })

    expect(await contarCarteras(db, ana)).toBe(2)
    const suyas = await listarCarteras(db, ana)
    expect(suyas.map((c) => c.nombre).sort()).toEqual(['Casa', 'Negocio'])

    await cerrar()
  })
})

/**
 * El aislamiento por capa de aplicacion no se sostiene con una convencion escrita
 * en un comentario: se sostiene con esta prueba.
 *
 * Sin RLS, el repositorio ES la frontera de seguridad. La regla es que todo metodo
 * que lee o escribe datos de un usuario exija `usuario_id` en la firma, y que no
 * sea opcion dentro de un objeto de filtros: un metodo que acepta solo un
 * identificador es un bug.
 *
 * Las excepciones son una lista explicita, no un patron: asi un metodo nuevo
 * queda denegado por defecto y hay que conscientiousemente anadirlo.
 */
const EXENCIONES: Record<string, string> = {
  /**
   * La autenticacion ocurre ANTES de saber quien es el usuario: por definicion no
   * puede exigir `usuario_id`. Lo que si exige es que la contrasena se verifique
   * siempre, para no enumerar cuentas por diferencia de tiempo de respuesta.
   */
  buscarPorNombreUsuario: 'es la autenticacion: corre antes de saber quien es el usuario',
  buscarPorCorreo: 'es la autenticacion: corre antes de saber quien es el usuario',
  crearUsuario: 'es el registro: el usuario_id se asigna aqui',
  crearSesion: 'crea la sesion de un usuario recien autenticado',
  /**
   * Buscar por token es la autenticacion: el token ES la credencial, y ahi se
   * descubre que usuario es. No se puede exigir `usuario_id` en una consulta que
   * sirve para saber quien es. Nota: las operaciones que MODIFICAN la sesion si lo
   * exigen — `eliminarSesion` recibe `usuario_id` — para que un token no alcance
   * para tocar la sesion de otro.
   */
  buscarSesionVigente: 'busca por token: el token es la credencial, no hay usuario aun',
  buscarSesionConUsuario: 'busca por token: el token es la credencial, no hay usuario aun',
  eliminarSesionesVencidas:
    'es mantenimiento global: borra filas vencidas de todos los usuarios, no lee datos de ninguno',
}

describe('el aislamiento de los repositorios', () => {
  it('todo metodo que lee datos de un usuario exige usuario_id en la firma', async () => {
    const directorio = join(process.cwd(), 'src', 'repos')
    const archivos = (await readdir(directorio)).filter((a) => a.endsWith('.ts'))

    expect(archivos.length).toBeGreaterThan(0)

    const firmas: string[] = []

    for (const archivo of archivos) {
      const fuente = await readFile(join(directorio, archivo), 'utf8')
      const encontradas = fuente.matchAll(
        /export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)\)\s*:\s*Promise/g,
      )

      for (const encontrada of encontradas) {
        const nombre = encontrada[1] as string
        const parametros = encontrada[2] as string
        firmas.push(`${nombre}(${parametros.replace(/\s+/g, ' ').trim()})`)
        if (EXENCIONES[nombre]) continue

        expect(`${archivo}: ${nombre}(${parametros.replace(/\s+/g, ' ').trim()})`).toContain(
          'usuario_id',
        )
      }
    }

    // Si el analizador dejara de encontrar firmas, la prueba pasaria por no haber
    // revisado nada. Se afirma que reviso algo.
    expect(firmas.length).toBeGreaterThan(5)
  })

  it('una lectura de UNA cartera exige cartera_id ademas de usuario_id', async () => {
    const fuente = await readFile(join(process.cwd(), 'src', 'repos', 'carteras.ts'), 'utf8')

    // Solo las lecturas de un elemento por identificador. `listar` devuelve todas
    // las del usuario y `contar` devuelve un total: no hay un cartera_id que
    // exigirles, y exigirselo seria un parametro decorativo.
    const encontradas = fuente.matchAll(
      /export\s+async\s+function\s+(buscar|leer)\w*\s*\(([\s\S]*?)\)\s*:\s*Promise/g,
    )

    let revisadas = 0
    for (const encontrada of encontradas) {
      const nombre = encontrada[1] as string
      const parametros = encontrada[2] as string
      revisadas += 1
      expect(`${nombre}(${parametros.replace(/\s+/g, ' ').trim()})`).toContain('cartera_id')
    }

    // Si el analizador no encontrara ninguna, la prueba pasaria sin revisar nada.
    expect(revisadas).toBeGreaterThan(0)
  })
})
