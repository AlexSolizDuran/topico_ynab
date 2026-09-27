import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { crearCartera as carteraDePrueba, crearUsuario } from '../helpers/fabricas'
import { crearBaseDePruebas } from '../helpers/pg'
import {
  ArchivadoSinVerificar,
  CarteraAjena,
  CarteraArchivada,
  CarteraConSaldos,
  archivarCartera,
  cambiarNombre,
  crearCartera,
  listarCarteras,
  listarCarterasActivas,
  listarCarterasArchivadas,
  obtenerCartera,
  operarSobreCartera,
  restaurarCartera,
} from '../../src/repos/carteras'
import { MonedaInmutable, exigirMonedaNoCambiada } from '../../src/carteras/monedas'
import {
  crearAsignacionDePrueba,
  crearCuentaDePrueba,
  crearMovimientoDePrueba,
  crearSobreDePrueba,
  crearTablasDeDinero,
} from './ayuda'

describe('crear carteras', () => {
  it('crea la cartera vacia y activa, con la moneda pedida', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)

    const cartera = await crearCartera(db, usuario_id, { nombre: 'Casa', moneda: 'MXN' })

    expect(cartera.nombre).toBe('Casa')
    expect(cartera.moneda).toBe('MXN')
    expect(cartera.archivada).toBe(false)
    expect(cartera.usuario_id).toBe(usuario_id)

    await cerrar()
  })

  it('rechaza un nombre repetido del mismo usuario, porque la lista seria ambigua', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    await crearCartera(db, usuario_id, { nombre: 'Casa', moneda: 'MXN' })

    await expect(crearCartera(db, usuario_id, { nombre: 'Casa', moneda: 'USD' })).rejects.toThrow(
      /Ya tienes una cartera llamada/,
    )

    await cerrar()
  })

  it('admite el mismo nombre en usuarios distintos, porque las carteras son de cada uno', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const uno = await crearUsuario(db, { nombre_usuario: 'Ana' })
    const otro = await crearUsuario(db, { nombre_usuario: 'Beto' })
    await crearCartera(db, uno, { nombre: 'Casa', moneda: 'MXN' })

    const ajena = await crearCartera(db, otro, { nombre: 'Casa', moneda: 'USD' })

    expect(ajena.nombre).toBe('Casa')

    await cerrar()
  })

  it('deja la cartera nueva al final de la lista, no en la primera posicion', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    await crearCartera(db, usuario_id, { nombre: 'Primera', moneda: 'MXN' })
    const segunda = await crearCartera(db, usuario_id, { nombre: 'Segunda', moneda: 'MXN' })
    const tercera = await crearCartera(db, usuario_id, { nombre: 'Tercera', moneda: 'MXN' })

    expect((await listarCarteras(db, usuario_id)).map((c) => c.nombre)).toEqual([
      'Primera',
      'Segunda',
      'Tercera',
    ])
    expect(tercera.orden).toBeGreaterThan(segunda.orden)

    await cerrar()
  })
})

describe('la cartera pertenece a su usuario', () => {
  it('niega el acceso a una cartera ajena con el mismo mensaje que una inexistente', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const duenio = await crearUsuario(db, { nombre_usuario: 'Duenio' })
    const intruso = await crearUsuario(db, { nombre_usuario: 'Intruso' })
    const cartera_id = await carteraDePrueba(db, duenio)

    const ajena = await obtenerCartera(db, intruso, cartera_id).catch((e: unknown) => e)
    const inexistente = await obtenerCartera(db, intruso, 9999).catch((e: unknown) => e)

    expect(ajena).toBeInstanceOf(CarteraAjena)
    expect(inexistente).toBeInstanceOf(CarteraAjena)
    expect((ajena as Error).message).toBe((inexistente as Error).message)

    await cerrar()
  })

  it('niega tambien una escritura, no solo una lectura', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const duenio = await crearUsuario(db, { nombre_usuario: 'Duenio' })
    const intruso = await crearUsuario(db, { nombre_usuario: 'Intruso' })
    const cartera_id = await carteraDePrueba(db, duenio)

    await expect(cambiarNombre(db, intruso, cartera_id, 'Mia')).rejects.toBeInstanceOf(CarteraAjena)

    await cerrar()
  })
})

describe('editar el nombre', () => {
  it('cambia el nombre y conserva la moneda y los datos', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id, { nombre: 'Viejo', moneda: 'USD' })

    const renombrada = await cambiarNombre(db, usuario_id, cartera_id, 'Nuevo')

    expect(renombrada.nombre).toBe('Nuevo')
    expect(renombrada.moneda).toBe('USD')
    expect(renombrada.id).toBe(cartera_id)

    await cerrar()
  })

  it('rechaza un nombre que ya usa otra cartera del mismo usuario', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    await crearCartera(db, usuario_id, { nombre: 'Uno', moneda: 'MXN' })
    const otra = await crearCartera(db, usuario_id, { nombre: 'Dos', moneda: 'MXN' })

    await expect(cambiarNombre(db, usuario_id, otra.id, 'Uno')).rejects.toThrow(/Ya tienes/)

    await cerrar()
  })

  it('permite renombrar una cartera a su propio nombre, que no es un conflicto', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id, { nombre: 'Igual', moneda: 'MXN' })

    expect((await cambiarNombre(db, usuario_id, cartera_id, 'Igual')).nombre).toBe('Igual')

    await cerrar()
  })
})

describe('la moneda no se cambia', () => {
  it('rechaza el cambio y explica que solo se define al crear', () => {
    const error = (() => {
      try {
        exigirMonedaNoCambiada('MXN', 'USD')
        return undefined
      } catch (e) {
        return e as MonedaInmutable
      }
    })()

    expect(error).toBeInstanceOf(MonedaInmutable)
    expect(error?.message).toMatch(/solo puede definirse al crear/i)
  })

  it('no toma el renombrado por un cambio si el formulario no manda moneda', () => {
    expect(() => exigirMonedaNoCambiada('MXN', '')).not.toThrow()
    expect(() => exigirMonedaNoCambiada('MXN', undefined)).not.toThrow()
  })

  it('acepta el renombrado que reenvia la misma moneda', () => {
    expect(() => exigirMonedaNoCambiada('MXN', 'MXN')).not.toThrow()
  })

  it('no existe ningun metodo que escriba la moneda despues de crear', async () => {
    const { readFile } = await import('node:fs/promises')
    const fuente = await readFile('src/repos/carteras.ts', 'utf8')

    expect(fuente).not.toMatch(/export async function cambiarMoneda/)
  })

  it('ningun metodo escribe en la columna moneda despues de crear', async () => {
    const { readFile } = await import('node:fs/promises')
    const fuente = await readFile('src/repos/carteras.ts', 'utf8')

    // El `insert` de `crearCartera` si escribe la moneda y es lo unico permitido.
    // Un `set({ moneda })` seria la forma de romper la regla sin que nadie lo note.
    const escrituras = [...fuente.matchAll(/\.set\(\{([^}]*)\}\)/g)].flatMap((c) => c[1] ?? '')

    for (const escritura of escrituras) {
      expect(escritura).not.toMatch(/\bmoneda\b/)
    }
  })
})

describe('archivar y restaurar', () => {
  it('archiva una cartera vacia y la saca de la lista de activas', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)
    await crearTablasDeDinero(db)

    const archivada = await archivarCartera(db, usuario_id, cartera_id)

    expect(archivada.archivada).toBe(true)
    expect((await listarCarterasActivas(db, usuario_id)).map((c) => c.id)).not.toContain(cartera_id)
    expect((await listarCarterasArchivadas(db, usuario_id)).map((c) => c.id)).toContain(cartera_id)

    await cerrar()
  })

  it('restaura una cartera archivada sin perder sus datos', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id, { nombre: 'Guardada' })
    await crearTablasDeDinero(db)
    await archivarCartera(db, usuario_id, cartera_id)

    const restaurada = await restaurarCartera(db, usuario_id, cartera_id)

    expect(restaurada.archivada).toBe(false)
    expect(restaurada.nombre).toBe('Guardada')
    expect((await listarCarterasActivas(db, usuario_id)).map((c) => c.id)).toContain(cartera_id)

    await cerrar()
  })

  it('rechaza restaurar una cartera que ya esta activa', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)
    await crearTablasDeDinero(db)

    await expect(restaurarCartera(db, usuario_id, cartera_id)).rejects.toThrow(/ya esta activa/i)

    await cerrar()
  })

  it('no archiva una cartera con saldo y dice que hay que vaciar primero', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)
    await crearTablasDeDinero(db)
    const cuenta_id = await crearCuentaDePrueba(db, cartera_id, '100.00')

    const error = await archivarCartera(db, usuario_id, cartera_id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(CarteraConSaldos)
    expect((error as Error).message).toMatch(/Vacia las cuentas y los sobres primero/)
    expect((await obtenerCartera(db, usuario_id, cartera_id)).archivada).toBe(false)

    await cerrar()
  })

  it('no archiva una cartera con asignaciones sin gastar', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)
    await crearTablasDeDinero(db)
    const sobre_id = await crearSobreDePrueba(db, usuario_id, cartera_id)
    await crearAsignacionDePrueba(db, sobre_id, '500.00')

    await expect(archivarCartera(db, usuario_id, cartera_id)).rejects.toBeInstanceOf(
      CarteraConSaldos,
    )

    await cerrar()
  })

  it('deja archivar cuando todo esta en cero, aunque haya filas', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)
    await crearTablasDeDinero(db)
    const cuenta_id = await crearCuentaDePrueba(db, cartera_id, '0.00')
    await crearMovimientoDePrueba(db, cuenta_id, '0.00')

    expect((await archivarCartera(db, usuario_id, cartera_id)).archivada).toBe(true)

    await cerrar()
  })
})

describe('operar sobre una cartera archivada', () => {
  it('rechaza cualquier escritura mientras la cartera siga archivada', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)
    await crearTablasDeDinero(db)
    await archivarCartera(db, usuario_id, cartera_id)

    await expect(operarSobreCartera(db, usuario_id, cartera_id)).rejects.toBeInstanceOf(
      CarteraArchivada,
    )
    await expect(cambiarNombre(db, usuario_id, cartera_id, 'Intento')).rejects.toBeInstanceOf(
      CarteraArchivada,
    )

    await cerrar()
  })

  it('deja volver a operar despues de restaurarla', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)
    await crearTablasDeDinero(db)
    await archivarCartera(db, usuario_id, cartera_id)
    await restaurarCartera(db, usuario_id, cartera_id)

    expect((await operarSobreCartera(db, usuario_id, cartera_id)).archivada).toBe(false)

    await cerrar()
  })
})

describe('sin las tablas de dinero, archivar no se permite', () => {
  it('se niega a archivar en vez de hacerlo a ciegas', async () => {
    const { db, cerrar } = await crearBaseDePruebas()
    const usuario_id = await crearUsuario(db)
    const cartera_id = await carteraDePrueba(db, usuario_id)

    // Las tablas existen, porque `crearBaseDePruebas` aplica todas las migraciones. Se
    // tiran abajo a proposito para reproducir el estado que se da cuando el codigo se
    // despliega antes que la migracion: la comprobacion no puede afirmar nada, y no
    // poder afirmar no es lo mismo que afirmar que esta vacia.
    await db.execute(sql`drop table if exists asignaciones`)
    await db.execute(sql`drop table if exists sobres cascade`)

    await expect(archivarCartera(db, usuario_id, cartera_id)).rejects.toBeInstanceOf(
      ArchivadoSinVerificar,
    )

    await cerrar()
  })
})
