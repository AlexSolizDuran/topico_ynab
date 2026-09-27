import { describe, expect, it } from 'vitest'
import { usuarios } from '../../src/db/schema'
import { crearBaseDePruebas } from '../helpers/pg'

async function tablasPresentes(): Promise<string[]> {
  const { pg, cerrar } = await crearBaseDePruebas()
  const resultado = await pg.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  )
  await cerrar()
  return resultado.rows.map((fila) => fila.tablename)
}

async function columnasDe(tabla: string): Promise<string[]> {
  const { pg, cerrar } = await crearBaseDePruebas()
  const resultado = await pg.query<{ column_name: string }>(
    'select column_name from information_schema.columns where table_name = $1 order by column_name',
    [tabla],
  )
  await cerrar()
  return resultado.rows.map((fila) => fila.column_name)
}

async function indicesDe(tabla: string): Promise<{ nombre: string; definicion: string }[]> {
  const { pg, cerrar } = await crearBaseDePruebas()
  const resultado = await pg.query<{ indexname: string; indexdef: string }>(
    'select indexname, indexdef from pg_indexes where tablename = $1 order by indexname',
    [tabla],
  )
  await cerrar()
  return resultado.rows.map((fila) => ({ nombre: fila.indexname, definicion: fila.indexdef }))
}

describe('la migracion de 010-auth', () => {
  it('el arnes aplica las migraciones de verdad, no una base vacia', async () => {
    const tablas = await tablasPresentes()

    // Si esta lista estuviera vacia, todas las pruebas de dominio de las 12
    // capacidades estarian probando un schema que no existe.
    expect(tablas).toContain('usuarios')
    expect(tablas).toContain('sesiones')
    expect(tablas).toContain('carteras')
  })

  it('crea las columnas de bloqueo de intentos en usuarios', async () => {
    const columnas = await columnasDe('usuarios')

    expect(columnas).toContain('intentos_fallidos')
    expect(columnas).toContain('bloqueado_hasta')
  })

  it('no crea columna de revocacion en sesiones, porque el cierre borra la fila', async () => {
    const columnas = await columnasDe('sesiones')

    expect(columnas).not.toContain('revocada')
    expect(columnas).not.toContain('revocada_en')
    expect(columnas).not.toContain('anulada')
  })
})

describe('el indice unico funcional del nombre de usuario', () => {
  it('crea el indice sobre lower(nombre_usuario), no un UNIQUE normal', async () => {
    const indices = await indicesDe('usuarios')
    const funcional = indices.find((indice) => indice.nombre === 'usuarios_nombre_usuario_lower')

    expect(funcional).toBeDefined()
    // Un UNIQUE normal se veria como ON btree ("nombre_usuario"). El
    // funcional lleva el lower explicito.
    expect(funcional?.definicion).toContain('lower(')
  })

  it('rechaza Alex y alex a la vez, que un UNIQUE normal si permitiria', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    await pg.query(
      `insert into usuarios (nombre, apellido, nombre_usuario, correo, hash_contrasena)
       values ($1, $2, $3, $4, $5)`,
      ['Ana', 'Uno', 'Alex', 'alex@ejemplo.test', 'hash'],
    )

    // La razon de ser del indice funcional. Con `unique (nombre_usuario)`, este
    // insert pasaria y quedarian dos cuentas indistinguibles para el login.
    await expect(
      pg.query(
        `insert into usuarios (nombre, apellido, nombre_usuario, correo, hash_contrasena)
         values ($1, $2, $3, $4, $5)`,
        ['Ana', 'Dos', 'alex', 'otro@ejemplo.test', 'hash'],
      ),
    ).rejects.toThrow()

    const total = await pg.query<{ total: number }>(
      'select count(*)::int as total from usuarios',
    )
    expect(total.rows[0]?.total).toBe(1)

    await cerrar()
  })
})
