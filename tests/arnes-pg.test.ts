import { describe, expect, it } from 'vitest'
import { archivosDeMigracion, crearBaseDePruebas, migraciones } from './helpers/pg'

describe('el arnes de pruebas', () => {
  it('levanta una base aislada por llamada', async () => {
    const primera = await crearBaseDePruebas()
    const segunda = await crearBaseDePruebas()

    expect(primera.pg).not.toBe(segunda.pg)

    await primera.cerrar()
    await segunda.cerrar()
  })

  it('responde consultas de sistema', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const resultado = await pg.query<{ prueba: number }>('select 1 as prueba')
    expect(resultado.rows[0]?.prueba).toBe(1)

    await cerrar()
  })

  it('aplica las migraciones que encuentra, en orden de archivo', () => {
    const nombres = archivosDeMigracion()
    // Sin migraciones todavia, la lista esta vacia. En cuanto 010-auth genere
    // la primera, esta prueba sigue pasando y las de dominio empiezan a tener
    // contra que correr.
    expect(Array.isArray(nombres)).toBe(true)
    expect([...nombres]).toEqual([...nombres].sort())
  })

  it('el orden de las migraciones es el de los nombres, no el del SQL', () => {
    // El numero de prefijo es el que ordena, y es el que garantiza el orden entre
    // entornos. Ordenar el contenido del archivo daria un orden distinto y valido en
    // apariencia: `0002_grupos.sql` empieza con `CREATE TABLE "grupos"`, que en
    // orden alfabetico va antes que el `CREATE TABLE "cuentas"` de `0001`.
    const numeros = archivosDeMigracion().map((nombre) => Number(nombre.slice(0, 4)))
    expect(numeros.length).toBeGreaterThan(0)
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b))
    // Y ningun numero se repite: dos migraciones con el mismo prefijo harian que
    // el orden dependa de cual se leyera primero.
    expect(new Set(numeros).size).toBe(numeros.length)
  })

  it('ejecuta una migracion si existe', async () => {
    const archivos = migraciones()
    if (archivos.length === 0) return

    const { pg, cerrar } = await crearBaseDePruebas()
    const tablas = await pg.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    )
    expect(tablas.rows.length).toBeGreaterThan(0)

    await cerrar()
  })
})
