/**
 * 060-transacciones, grupo 1: el esquema que agrega el change.
 *
 * Este archivo no prueba comportamiento del producto: prueba que la base tiene **la
 * forma** que el resto del change da por sentado. Si `grupos_transferencia` o
 * `transferencia_id` no existieran, las pruebas de la cascada de R6 darian error de
 * columna y nadie sabria que el problema era el esquema y no la logica.
 *
 * Y al reves: `periodo` y `cartera_id` **no** deben aparecer nunca en `movimientos`.
 * Son las dos columnas que D1 y D2 descartan a proposito, y su ausencia es lo que
 * hace que R7 y R10 no tengan nada que recalcular. Ese caso usa el recorte de la
 * definicion de la tabla, el mismo truco que el guard de `disponible` en `sobres`.
 */
import { describe, expect, it } from 'vitest'
import { archivosDeMigracion, crearBaseDePruebas, migraciones } from '../helpers/pg'

describe('060: grupos_transferencia existe', () => {
  it('la tabla esta creada en la base', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const tablas = await pg.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename = 'grupos_transferencia'",
    )
    expect(tablas.rows.map((f) => f.tablename)).toEqual(['grupos_transferencia'])

    await cerrar()
  })

  it('tiene id, descripcion, fecha y creado_en, y nada mas', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const columnas = await pg.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'grupos_transferencia' order by ordinal_position",
    )

    expect(columnas.rows.map((c) => c.column_name)).toEqual([
      'id',
      'descripcion',
      'fecha',
      'creado_en',
    ])

    await cerrar()
  })

  it('no tiene cartera_id: la cartera de un traspaso es la de cada pata', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const columnas = await pg.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'grupos_transferencia'",
    )

    // Las dos patas de un traspaso pueden estar en carteras distintas —de hecho es lo
    // normal—, asi que una columna unica seria la de una de las dos. Ver D2 y D5.
    expect(columnas.rows.map((c) => c.column_name)).not.toContain('cartera_id')

    await cerrar()
  })
})

describe('060: movimientos.transferencia_id existe', () => {
  it('la columna nueva esta en la tabla', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const columnas = await pg.query<{
      column_name: string
      is_nullable: string
      data_type: string
    }>(
      "select column_name, is_nullable, data_type from information_schema.columns where table_name = 'movimientos' and column_name = 'transferencia_id'",
    )

    expect(columnas.rows).toHaveLength(1)
    // Nullable: cualquier movimiento que no sea traspaso la deja en null.
    expect(columnas.rows[0]?.is_nullable).toBe('YES')

    await cerrar()
  })

  it('es nullable y es un entero, no un texto', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const columna = await pg.query<{ data_type: string; udt_name: string }>(
      "select data_type, udt_name from information_schema.columns where table_name = 'movimientos' and column_name = 'transferencia_id'",
    )

    expect(columna.rows[0]?.data_type).toBe('integer')
    expect(columna.rows[0]?.udt_name).toBe('int4')

    await cerrar()
  })

  it('la FK apunta a grupos_transferencia y borra en cascada', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const columnas = await pg.query<{ table_name: string; referenced_table_name: string }>(
      `select tc.table_name, ccu.table_name as referenced_table_name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = tc.constraint_name
        and kcu.table_schema = tc.table_schema
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_name = 'movimientos'
          and kcu.column_name = 'transferencia_id'`,
    )

    expect(columnas.rows).toHaveLength(1)
    expect(columnas.rows[0]?.referenced_table_name).toBe('grupos_transferencia')

    // El `on delete cascade` de la columna del modelo. La cascada de R6 en la aplicacion
    // es otra cosa, un update logico sobre el grupo; esta es la red para borrar el grupo
    // entero. Ver D5 y D7.
    const regla = await pg.query<{ delete_rule: string }>(
      `select rc.delete_rule
         from information_schema.referential_constraints rc
         join information_schema.table_constraints tc
           on tc.constraint_name = rc.constraint_name
        where tc.table_name = 'movimientos'
          and tc.constraint_type = 'FOREIGN KEY'`,
    )
    expect(regla.rows[0]?.delete_rule).toBe('CASCADE')

    await cerrar()
  })
})

describe('060: el indice de la cascada es parcial', () => {
  it('movimientos_transferencia_id existe y solo cubre los vivos', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const indices = await pg.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where tablename = 'movimientos' and indexname = 'movimientos_transferencia_id'",
    )

    expect(indices.rows).toHaveLength(1)

    // El predicado es lo que hace que este indice sea el de la cascada y no un indice
    // mas: las dos consultas que lo usan preguntan por patas vivas.
    expect(indices.rows[0]?.indexdef).toMatch(/WHERE/)
    expect(indices.rows[0]?.indexdef).toMatch(/eliminado_en.*is null/i)

    await cerrar()
  })

  it('el indice no es completo: un indice sin predicado traeria tambien las bajadas', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const indices = await pg.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'movimientos' and indexname = 'movimientos_transferencia_id'",
    )

    // Un `WHERE` ausente seria un indice sobre todas las filas, incluidas las que un
    // traspaso ya dio de baja. El guard falla si alguien reconstruye el indice.
    expect(indices.rows[0]?.indexdef).not.toMatch(/WHERE\s+(?!.*eliminado_en)/i)

    await cerrar()
  })
})

describe('060: la migracion 0004', () => {
  it('el prefijo mantiene la cadena 0000 a 0004, sin huecos ni repetidos', () => {
    const numeros = archivosDeMigracion().map((nombre) => Number(nombre.slice(0, 4)))

    expect(numeros).toEqual([0, 1, 2, 3, 4])
  })

  it('el archivo nuevo se llama 0004_transacciones.sql', () => {
    expect(archivosDeMigracion().at(-1)).toBe('0004_transacciones.sql')
  })

  it('los cuatro pasos van en el orden de D5, separados por statement-breakpoint', async () => {
    const sql = migraciones().at(-1) ?? ''

    // D5: primero la tabla, despues la columna, despues la FK, y el indice al final
    // porque es el unico que puede fallar si la columna no existe todavia.
    const tabla = sql.indexOf('CREATE TABLE "grupos_transferencia"')
    const columna = sql.indexOf('ADD COLUMN "transferencia_id"')
    const fk = sql.indexOf('ADD CONSTRAINT "movimientos_transferencia_id')
    const indice = sql.indexOf('CREATE INDEX "movimientos_transferencia_id"')

    expect(tabla).toBeGreaterThanOrEqual(0)
    expect(columna).toBeGreaterThan(tabla)
    expect(fk).toBeGreaterThan(columna)
    expect(indice).toBeGreaterThan(fk)

    // Y los cuatro como sentencias separadas, que es lo que permite aplicarlas de a
    // una en environments que ya tienen algo aplicado.
    expect(sql.match(/-->/g)).toHaveLength(3)
  })

  it('no toca ninguna migracion anterior', () => {
    // Una migracion aplicada es inmutable. Este change solo agrega `0004`.
    expect(archivosDeMigracion()).toContain('0003_sobres.sql')
    expect(archivosDeMigracion()).not.toContain('0003_transacciones.sql')
  })
})

describe('060: periodo y cartera_id no son columnas de movimientos', () => {
  it('la definicion de la tabla no declara periodo ni cartera_id', async () => {
    const { readFile } = await import('node:fs/promises')
    const fuente = await readFile('src/db/tablas/cuentas.ts', 'utf8')

    // Solo el bloque de `movimientos`. `cuentas`, que esta mas arriba, si tiene
    // `cartera_id`, y no es lo que este guard mide.
    //
    // El corte se busca con expresion regular y no con una cadena de literales porque
    // el archivo usa CRLF: un `\n` pelado no aparece y el recorte daria largo cero.
    const inicio = fuente.search(/pgTable\(\s*'movimientos'/)
    const fin = fuente.indexOf('export type Cuenta')
    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(fin).toBeGreaterThan(inicio)

    const definicion = fuente.slice(inicio, fin)

    expect(definicion.length).toBeGreaterThan(0)
    expect(definicion).not.toMatch(/^\s*periodo:/m)
    expect(definicion).not.toMatch(/^\s*cartera_id:/m)
  })

  it('la tabla en la base tampoco las tiene', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    const columnas = await pg.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'movimientos'",
    )
    const nombres = columnas.rows.map((c) => c.column_name)

    // El periodo sale de `date_trunc('month', fecha)`: derivado, R7 se cumple siempre y
    // R8 no tiene nada que recalcular. Ver D1.
    expect(nombres).not.toContain('periodo')

    // La cartera sale de la cuenta, y no la elige el formulario: un `cartera_id`
    // equivocado escribiria en la cartera de otro sin que nadie lo note. Ver D2.
    expect(nombres).not.toContain('cartera_id')

    await cerrar()
  })

  it('la base si tiene las dos columnas donde corresponden', async () => {
    const { pg, cerrar } = await crearBaseDePruebas()

    // El guard de arriba solo tiene sentido si `asignaciones.periodo` existe de verdad:
    // alla el periodo es parte del dato, no una consecuencia de la fecha. Ver D1.
    const asignaciones = await pg.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'asignaciones'",
    )
    expect(asignaciones.rows.map((c) => c.column_name)).toContain('periodo')

    const cuentas = await pg.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'cuentas'",
    )
    expect(cuentas.rows.map((c) => c.column_name)).toContain('cartera_id')

    await cerrar()
  })
})
