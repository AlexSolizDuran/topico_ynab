import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La regla del dinero, verificada sobre el codigo fuente.
 *
 * Estas prohibiciones no son de estilo. Un `Number(...)` o un `$type<number>()`
 * sobre una columna `numeric` devuelve un importe corriendo con float, que pierde
 * centavos en magnitudes grandes y NO lanza error: el saldo queda corrido y el
 * bug aparece meses despues. Un test que las prohiba es mas barato que un
 * bug de esa clase.
 */

const PROHIBIDAS: Array<{ patron: RegExp; motivo: string }> = [
  { patron: /parseFloat\s*\(/, motivo: 'parseFloat devuelve number' },
  { patron: /parseInt\s*\(/, motivo: 'parseInt devuelve number' },
  { patron: /\bNumber\s*\(/, motivo: 'Number devuelve number' },
  { patron: /\$type<\s*number\s*>/, motivo: 'miente sobre una columna numeric' },
  { patron: /\.toFixed\s*\(/, motivo: 'toFixed exige number' },
  { patron: /NumberFormat[\s\S]{0,80}?parseFloat/, motivo: 'convierte antes de formatear' },
]

/**
 * Modulos exentos de la prohibicion de `Number`, y por que.
 *
 * La excepcion es por RUTA, no por linea: una excepcion por linea se corre en
 * silencio la primera vez que se edita el archivo, que es justo cuando hacia falta.
 *
 * Ademas el modulo exento tiene que seguir sin hablar de dinero. Eso lo vigila la
 * prueba de mas abajo, porque una excepcion sin limite es una regla derogada.
 */
const EXENTOS: Record<string, string> = {
  'src/enteros.ts':
    'Convierte texto a ENTERO de url y de formulario, nunca un importe. Ver el modulo.',
}

function archivosDe(carpeta: string): string[] {
  const encontrados: string[] = []
  let entradas: string[]
  try {
    entradas = readdirSync(carpeta)
  } catch {
    return encontrados
  }
  for (const entrada of entradas) {
    const ruta = join(carpeta, entrada)
    if (statSync(ruta).isDirectory()) {
      encontrados.push(...archivosDe(ruta))
    } else if (/\.tsx?$/.test(entrada)) {
      encontrados.push(ruta)
    }
  }
  return encontrados
}

/** Quita comentarios de linea y de bloque: documentan la regla, no la rompen. */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const FUENTES = archivosDe('src')

describe('la regla del dinero en el codigo fuente', () => {
  it('hay codigo que revisar', () => {
    expect(FUENTES.length).toBeGreaterThan(0)
  })

  it.each(PROHIBIDAS)('no usa $motivo', ({ patron }) => {
    const ofensas: string[] = []

    for (const archivo of FUENTES) {
      if (archivo in EXENTOS) continue
      const contenido = sinComentarios(readFileSync(archivo, 'utf8'))
      contenido.split('\n').forEach((linea, indice) => {
        if (patron.test(linea)) {
          ofensas.push(`${archivo}:${indice + 1}`)
        }
      })
    }

    expect(ofensas).toEqual([])
  })

  it('los modulos exentos no hablan de dinero, para que la excepcion no crezca', () => {
    for (const [archivo, motivo] of Object.entries(EXENTOS)) {
      // Sin comentarios: el modulo tiene que EXPLICAR que no maneja dinero, y la
      // explicacion justamente menciona la palabra. Lo que se vigila es el codigo.
      const codigo = sinComentarios(readFileSync(archivo, 'utf8'))
      expect(codigo, `${archivo}: ${motivo}`).not.toMatch(/Dinero|numeric|importe|saldo/i)
    }
  })

  it('la excepcion existe y es unica, para que no se amplie sin querer', () => {
    // Con `Number` fuera de `src/enteros.ts` la regla habria que derivar, no ampliar.
    expect(Object.keys(EXENTOS)).toEqual(['src/enteros.ts'])
  })
})
