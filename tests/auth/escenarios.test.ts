import { describe, expect, it } from 'vitest'
import { registrarUsuario } from '../../src/sesion/servicio'
import { ErroresDeValidacion } from '../../src/sesion/validacion'
import { crearBaseDePruebas } from '../helpers/pg'

/**
 * Trazabilidad entre los escenarios del spec y las pruebas.
 *
 * El spec es la fuente de verdad y no se toca. Este archivo NO reemplaza las
 * pruebas de comportamiento: dice, para cada escenario de
 * `openspec/specs/autenticacion/spec.md`, donde vive su prueba. Si alguien anade
 * un escenario al spec, el conteo de abajo falla y obliga a actualizar el mapa.
 * Si alguien renombra una prueba, la referencia deja de existir y tambien falla.
 *
 * Es un mapa declarado a mano a proposito: un mapa autogenerado por similitud de
 * texto daria una sensacion de cobertura que no real.
 */

/** Los 28 escenarios de `autenticacion`, en el orden del spec. */
const ESCENARIOS = [
  'Registro exitoso',
  'Se rechaza el nombre de usuario duplicado',
  'Se rechaza el correo duplicado',
  'Contrasena demasiado corta',
  'El nombre de usuario diferencia mayusculas',
  'Inicio de sesion exitoso',
  'Credenciales incorrectas',
  'El nombre de usuario no distingue mayusculas',
  'Identificador renovado al iniciar sesion',
  'Cierre de sesion',
  'Sesion no utilizable desde el cliente',
  'Bloqueo tras cinco intentos fallidos',
  'Contreinicio tras un acceso exitoso',
  'Mensaje de bloqueo',
  'Contrasena actual incorrecta',
  'Contrasena nueva demasiado corta',
  'Contrasena cambiada',
  'Actualizacion de datos',
  'Se rechaza el correo duplicado al editar el perfil',
  'El nombre de usuario no cambia',
  'Se rechaza el cambio de nombre de usuario',
  'La zona horaria no se cambia desde el perfil',
  'Token ausente o invalido',
  'Operacion protegida valida',
  'Token no reutilizable entre sesiones',
  'Acceso a datos ajenos',
  'Identificador inexistente',
  'Sesion ausente en una operacion protegida',
]

/**
 * Escenario -> archivo y nombre de prueba. Varias pruebas pueden cubrir un mismo
 * escenario, y algunos escenarios comparten prueba entre si.
 */
const MAPA: Record<string, string[]> = {
  'Registro exitoso': ['servicio.test.ts:crea la cuenta activa y deja al usuario con sesion iniciada'],
  'Se rechaza el nombre de usuario duplicado': [
    'servicio.test.ts:rechaza el nombre de usuario duplicado que solo difiere en mayusculas',
  ],
  'Se rechaza el correo duplicado': [
    'servicio.test.ts:rechaza el correo duplicado',
    'repos.test.ts:rechaza un correo duplicado, sin confundirlo con el nombre de usuario',
  ],
  'Contrasena demasiado corta': [
    'servicio.test.ts:rechaza una contrasena de menos de 6 caracteres y no crea la cuenta',
  ],
  'El nombre de usuario diferencia mayusculas': [
    'servicio.test.ts:rechaza el nombre de usuario duplicado que solo difiere en mayusculas',
  ],
  'Inicio de sesion exitoso': [
    'servicio.test.ts:autentica con la contrasena correcta y genera un identificador nuevo',
  ],
  'Credenciales incorrectas': [
    'servicio.test.ts:rechaza una contrasena incorrecta sin crear sesion',
    'servicio.test.ts:rechaza un nombre de usuario desconocido con el MISMO error que una contrasena mala',
  ],
  'El nombre de usuario no distingue mayusculas': [
    'servicio.test.ts:trata el nombre de usuario sin distinguir mayusculas',
  ],
  'Identificador renovado al iniciar sesion': [
    'servicio.test.ts:autentica con la contrasena correcta y genera un identificador nuevo',
  ],
  'Cierre de sesion': ['servicio.test.ts:destruye la sesion y despues el token ya no sirve'],
  'Sesion no utilizable desde el cliente': [
    'sesion-primitivas.test.ts:la cookie de sesion es inaccesible desde el script de la pagina',
  ],
  'Bloqueo tras cinco intentos fallidos': [
    'servicio.test.ts:bloquea durante 60 segundos tras 5 intentos fallidos',
  ],
  'Contreinicio tras un acceso exitoso': [
    'servicio.test.ts:reinicia el conteo de intentos tras un acceso exitoso',
  ],
  'Mensaje de bloqueo': ['bloqueo.test.ts:el mensaje de bloqueo dice cuanto falta esperar'],
  'Contrasena actual incorrecta': [
    'servicio.test.ts:rechaza una contrasena actual incorrecta sin cambiar nada',
  ],
  'Contrasena nueva demasiado corta': [
    'servicio.test.ts:explica el requisito de longitud cuando la nueva es corta',
  ],
  'Contrasena cambiada': ['servicio.test.ts:cambia la contrasena y la anterior deja de ser valida'],
  'Actualizacion de datos': ['perfil.test.ts:guarda el nombre, el apellido y el correo nuevos'],
  'Se rechaza el correo duplicado al editar el perfil': [
    'perfil.test.ts:rechaza un correo que ya es de otra cuenta, sin guardar nada',
  ],
  'El nombre de usuario no cambia': [
    'perfil.test.ts:un guardado normal deja intacto el nombre de usuario',
  ],
  'Se rechaza el cambio de nombre de usuario': [
    'perfil.test.ts:ignora un nombre de usuario distinto al que ya tiene',
  ],
  'La zona horaria no se cambia desde el perfil': [
    'perfil.test.ts:ignora una zona horaria distinta a la que ya tiene',
  ],
  'Token ausente o invalido': [
    'proteccion.test.ts:rechaza un token ausente o vacio',
    'proteccion.test.ts:rechaza un token inventado',
  ],
  'Operacion protegida valida': ['proteccion.test.ts:acepta el token de la sesion que lo emitio'],
  'Token no reutilizable entre sesiones': [
    'proteccion.test.ts:rechaza un token que es el de OTRA sesion',
    'proteccion.test.ts:tras cerrar sesion, el token anterior ya no sirve',
  ],
  'Acceso a datos ajenos': [
    'repos.test.ts:exige usuario_id y cartera_id a la vez para leer una cartera',
    'proteccion.test.ts:un recurso ajeno y uno inexistente dan el mismo resultado',
  ],
  'Identificador inexistente': [
    'proteccion.test.ts:un recurso ajeno y uno inexistente dan el mismo resultado',
  ],
  'Sesion ausente en una operacion protegida': [
    'proteccion.test.ts:rechaza cualquier token cuando no hay sesion',
    'bloqueo.test.ts:una peticion sin sesion no puede cambiar la contrasena de nadie',
  ],
}

describe('la trazabilidad de autenticacion', () => {
  it('el mapa cubre los 28 escenarios del spec, sin sobras ni faltas', async () => {
    const spec = await import('node:fs/promises').then((fs) =>
      fs.readFile('openspec/specs/autenticacion/spec.md', 'utf8'),
    )
    const delSpec = [...spec.matchAll(/#### Scenario: (.+)/g)].map((c) => (c[1] ?? '').trim())

    expect(ESCENARIOS).toHaveLength(28)
    expect(delSpec.sort()).toEqual([...ESCENARIOS].sort())
    expect(Object.keys(MAPA).sort()).toEqual([...ESCENARIOS].sort())
  })

  it('cada referencia del mapa apunta a una prueba que existe', async () => {
    const { readdir, readFile } = await import('node:fs/promises')

    const archivos = (await readdir('tests/auth')).filter((a) => a.endsWith('.test.ts'))
    const nombres = new Map<string, Set<string>>()

    for (const archivo of archivos) {
      const fuente = await readFile(`tests/auth/${archivo}`, 'utf8')
      nombres.set(
        archivo,
        new Set([...fuente.matchAll(/it\('([^']+)'/g)].map((c) => c[1] ?? '')),
      )
    }

    const referencias = Object.values(MAPA).flat()
    expect(referencias.length).toBeGreaterThanOrEqual(ESCENARIOS.length)

    for (const referencia of referencias) {
      // Se parte en la PRIMERA aparicion: un nombre de prueba puede contener dos
      // puntos, como "5000 menos 450 son 4550", y partirlo todo romperia la
      // referencia sin que el nombre de la prueba cambiara.
      const corte = referencia.indexOf(':')
      const archivo = referencia.slice(0, corte)
      const prueba = referencia.slice(corte + 1)
      const existentes = nombres.get(archivo ?? '')
      // Si el archivo desaparecio, el mensaje tiene que decirlo claro.
      expect(existentes, `no existe el archivo ${archivo}`).toBeDefined()
      expect(existentes?.has(prueba ?? ''), `no existe la prueba ${referencia}`).toBe(true)
    }
  })
})

describe('la validacion de entrada', () => {
  it('rechaza campos faltantes y contrasenas cortas, sin tocar la base', async () => {
    const { db, cerrar } = await crearBaseDePruebas()

    const error = await registrarUsuario(db, { nombre: 'Ana' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ErroresDeValidacion)

    const campos = (error as ErroresDeValidacion).campos
    expect(Object.keys(campos).sort()).toEqual(
      ['apellido', 'contrasena', 'correo', 'nombre_usuario'].sort(),
    )

    await cerrar()
  })

  it('rechaza un nombre de usuario con caracteres no admitidos', async () => {
    const { db, cerrar } = await crearBaseDePruebas()

    const error = await registrarUsuario(db, {
      nombre: 'Ana',
      apellido: 'Diaz',
      nombre_usuario: 'con espacio',
      correo: 'ana@ejemplo.test',
      contrasena: 'prueba123',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ErroresDeValidacion)

    await cerrar()
  })
})
