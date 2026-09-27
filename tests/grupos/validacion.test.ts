import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { ErroresDeGrupo, NOMBRE_GRUPO_MAXIMO, validarGrupo, validarOrden } from '@/grupos/validacion'

/**
 * Validacion de entrada de grupos.
 *
 * El caso que importa es el anidamiento. Los grupos no se anidan porque la tabla no
 * tiene columna de padre, y estas pruebas verifican la otra mitad: que un formulario
 * que mande un `grupo_padre` reciba un error que lo explique, y no un campo ignorado
 * en silencio.
 */

describe('validacion de grupos', () => {
  it('acepta un nombre con espacios alrededor y lo guarda limpio', () => {
    expect(validarGrupo({ nombre: '  Casa  ' })).toEqual({ nombre: 'Casa' })
  })

  it('rechaza un nombre vacio o demasiado largo', () => {
    expect(campos(() => validarGrupo({ nombre: '   ' }), 'nombre')).toMatch(/vacio/i)
    expect(campos(() => validarGrupo({ nombre: 'a'.repeat(61) }), 'nombre')).toMatch(
      new RegExp(String(NOMBRE_GRUPO_MAXIMO)),
    )
    expect(validarGrupo({ nombre: 'a'.repeat(60) }).nombre).toHaveLength(60)
  })

  it('rechaza un intento de anidar y explica que los grupos no se anidan', () => {
    for (const clave of ['grupo_padre', 'padre_id', 'grupo_id_padre', 'contiene']) {
      const mensaje = campos(() => validarGrupo({ nombre: 'Casa', [clave]: 7 }), clave)
      expect(mensaje, `deberia rechazar ${clave}`).toMatch(/no se anidan/i)
    }
  })

  it('un grupo sin padre es valido: lo normal es que no haya padre', () => {
    expect(validarGrupo({ nombre: 'Casa' })).toEqual({ nombre: 'Casa' })
    expect(validarGrupo({ nombre: 'Casa', grupo_padre: undefined })).toEqual({ nombre: 'Casa' })
  })

  it('el anidamiento se rechaza aunque el nombre este bien, y primero el error del padre', () => {
    // Si se validara el esquema primero, un nombre vacio taparia el mensaje de
    // anidamiento, y el usuario veria "el nombre no puede estar vacio" en un formulario
    // que en realidad mandaba un grupo padre.
    const mensaje = campos(() => validarGrupo({ nombre: '', grupo_padre: 7 }), 'grupo_padre')
    expect(mensaje).toMatch(/no se anidan/i)
  })

  it('acepta el orden cero y rechaza negativo, decimal y no numerico', () => {
    expect(validarOrden({ orden: 0 })).toEqual({ orden: 0 })
    expect(validarOrden({ orden: '3' })).toEqual({ orden: 3 })
    for (const orden of [-1, 1.5, 'abc', '', undefined, '3abc']) {
      expect(campos(() => validarOrden({ orden }), 'orden'), `deberia rechazar ${String(orden)}`).toBeTruthy()
    }
  })

  it('el error trae un mensaje por campo, para pintar el formulario', () => {
    try {
      validarGrupo({ nombre: '' })
      expect.unreachable('deberia lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(ErroresDeGrupo)
      expect((error as ErroresDeGrupo).message).toBe('Los datos enviados no son validos.')
      expect(Object.keys((error as ErroresDeGrupo).campos)).toEqual(['nombre'])
    }
  })
})

/**
 * Sin comentarios.
 *
 * El archivo de la tabla explica por que NO tiene columna de padre ni de eliminacion,
 * y esa explicacion menciona las dos. Lo que se vigila es el codigo.
 */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function campos(correr: () => unknown, campo: string): string {
  try {
    correr()
  } catch (error) {
    if (error instanceof ErroresDeGrupo) return error.campos[campo] ?? ''
    throw error
  }
  return ''
}

/**
 * La tabla de grupos no tiene ni total ni padre.
 *
 * Sin esto, alguien podria agregar un `total_disponible` "para no recalcular" y el
 * requerimiento —que el total se calcule— quedaria sin cumplir: pasaria la
 *Revision, porque la revision mira comportamiento, no columnas.
 */
describe('la tabla de grupos', () => {
  it('no guarda total ni disponible, porque el total se deriva de los sobres', async () => {
    const fuente = await sinComentarios(await readFile('src/db/tablas/grupos.ts', 'utf8'))
    expect(fuente).toMatch(/nombre: text\('nombre'\)/)
    expect(fuente).not.toMatch(/^\s*(total|total_disponible|disponible|presupuesto)\b/m)
  })

  it('no tiene grupo_padre, porque los grupos no se anidan', async () => {
    const fuente = await sinComentarios(await readFile('src/db/tablas/grupos.ts', 'utf8'))
    expect(fuente).not.toMatch(/grupo_padre|padre_id/)
    // Y la autorreferencia tampoco: una FK a si misma permitiria el anidamiento.
    expect(fuente).not.toMatch(/references\(\(\) => grupos/)
  })

  it('no tiene columna de eliminacion, porque un grupo se archiva, no se borra', async () => {
    const fuente = await sinComentarios(await readFile('src/db/tablas/grupos.ts', 'utf8'))
    expect(fuente).not.toMatch(/eliminado_en/)
  })
})

/** El archivo tiene que seguir siendo legible tal cual, sin caracteres raros. */
describe('higiene', () => {
  it('el archivo de la tabla esta en ASCII, para que los identifiers calcen con el modelo', async () => {
    const fuente = await readFile('src/db/tablas/grupos.ts', 'utf8')
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(sinComentarios, 'la tabla no deberia traer acentos').toMatch(/^[\x00-\x7F\n]*$/)
  })
})
