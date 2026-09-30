/**
 * 060-transacciones, grupo 8: periodo, fecha y el hecho de no bloquear lo que llega tarde.
 *
 * El periodo **no es una columna**. Es `date_trunc('month', fecha)`, derivado en cada
 * lectura, y este archivo no deberia poder romperlo sin que algo falle: si alguien
 * acepta la tentacion y agrega la columna, estas pruebas empiezan a dar el mismo numero
 * por la razon equivocada.
 *
 * El otro tema del grupo es que un movimiento de un periodo ya cerrado **entra igual**.
 * No hay guardia que rechace una fecha vieja, ni proceso de cierre de mes. Y eso no es que
 * no se compruebe nada: es que los derivados son derivados, asi que recalcular un periodo
 * viejo es gratis y no puede desfasarse.
 *
 * Ojo con las ventanas de los derivados: el disponible es **acumulado**, no del mes. Un
 * movimiento de mayo cuenta en mayo, en junio y en julio. Por eso casi todas las
 * aserciones de este archivo miran mas de un periodo a la vez, y por eso "los derivados
 * de mayo **y de los posteriores**" no necesita ningun codigo que los recalcule: basta con
 * que la ventana de cada periodo pregunte por la fecha.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BaseDePruebas } from '../helpers/pg'
import { crearBaseDePruebas, unaFila } from '../helpers/pg'
import { crearAsignacion, crearCartera, crearCuenta, crearGrupo, crearUsuario } from '../helpers/fabricas'
import { buscarMovimiento, editarMovimiento, registrarMovimiento } from '@/repos/movimientos'
import { crearSobre, disponibleDeSobre } from '@/repos/sobres'
import { dineroSuelto } from '@/repos/dinero-suelto'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

const MAYO = '2026-05'
const JUNIO = '2026-06'
const JULIO = '2026-07'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number
let cuenta: number
let sobre: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: 'Banco', saldo_inicial: '1000.00' })
  sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Comida')).id
  // La asignacion es de enero, para que el disponible de mayo sea solo el efecto de los
  // movimientos de mayo: si no, cada cifra seria la asignacion mas algo y no se podria
  // leer el efecto suelto.
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: '2026-01' })
})

afterEach(async () => {
  await base.cerrar()
})

function disponible(periodo: string): Promise<string> {
  return disponibleDeSobre(base.db, usuario, cartera, sobre, periodo)
}

function suelto(periodo: string): Promise<string> {
  return dineroSuelto(base.db, usuario, cartera, periodo)
}

/** El movimiento visto, o un error: aca siempre tiene que existir. */
async function visto(movimiento_id: number) {
  const fila = await buscarMovimiento(base.db, usuario, movimiento_id)
  if (!fila) throw new Error(`el movimiento ${movimiento_id} no salio de la base`)
  return fila
}

/** Cambia `creado_en` a un instante concreto, para que "registrado tarde" sea literal. */
async function fingirRegistrado(movimiento_id: number, instante: string): Promise<void> {
  await base.db.execute(sql`
    update movimientos set creado_en = ${instante}::timestamptz where id = ${movimiento_id}
  `)
}

/**
 * El instante de registro, leido aparte.
 *
 * No sale de `buscarMovimiento`: su seleccion es la que va a la pantalla y no trae las
 * columnas de auditoria. Aqui lo que se necesita es opuesta -comprobar que el periodo
 * **no** viene de ahi-, asi que se lee directo de la tabla.
 */
async function creadoEnDe(movimiento_id: number): Promise<string> {
  const fila = await unaFila<{ creado_en: Date | string }>(base.db, sql`
    select creado_en from movimientos where id = ${movimiento_id}
  `)
  const valor = fila.creado_en
  return valor instanceof Date ? valor.toISOString() : String(valor)
}

describe('060: el periodo es el mes de la fecha', () => {
  it('un movimiento registrado tarde pertenece a su fecha y no al mes de registro', async () => {
    // Escenario `Movimiento registrado tarde`. Se registra el 20 de junio un movimiento con
    // fecha del 28 de mayo. La fecha de registro se pone a mano con `creado_en` porque el
    // repositorio no la recibe: si el periodo saliera de `creado_en`, la fila caeria en
    // junio y esta prueba lo notaria.
    const alta = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      fecha: '2026-05-28',
      descripcion: 'Compra de mayo',
    })
    await fingirRegistrado(alta.id, '2026-06-20 12:00:00+00')

    const fila = await visto(alta.id)
    expect(await creadoEnDe(alta.id)).toContain('2026-06-20')
    // Mayo, no junio. Y no hay columna que lo decida.
    expect(fila.periodo).toBe(MAYO)

    // Y el disponible lo confirma desde el otro lado: mayo lo ve, y su ventana no.
    expect(await disponible(MAYO)).toBe('2550.00')
    expect(await disponible(JUNIO)).toBe('2550.00')
    expect(await disponible('2026-04')).toBe('3000.00')
  })

  it('la fecha guarda el dia local, sin hora', async () => {
    // Escenario `Movimiento de fin de mes`: el 31 de marzo a las 23:30 pertenece a marzo.
    // D8: `fecha` es `date`, no `timestamptz`, justamente para que esto no dependa de la
    // zona horaria de la sesion. Por eso la columna no puede tener hora.
    const alta = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-120',
      fecha: '2026-03-31',
      descripcion: 'Compra de fin de mes',
    })

    const tipo = await unaFila<{ tipo: string }>(base.db, sql`
      select pg_typeof(fecha)::text as tipo from movimientos where id = ${alta.id}
    `)
    expect(tipo.tipo).toBe('date')

    // Y no hay hora que devolver: Postgres ni siquiera acepta `extract(hour from fecha)`
    // sobre un `date`. Al castearlo a `timestamp` la hora sale en cero.
    const reloj = await unaFila<{ hora: number }>(base.db, sql`
      select extract(hour from cast(fecha as timestamp))::int as hora
      from movimientos where id = ${alta.id}
    `)
    expect(reloj.hora).toBe(0)

    expect((await visto(alta.id)).periodo).toBe('2026-03')
  })

  it('los tres limites del mes caen en su mes', async () => {
    // El `date_trunc` es por mes calendario, no de 30 dias: el dia 1 y el dia 31 tienen que
    // caer donde dicen.
    for (const [fecha, periodo] of [
      ['2026-01-31', '2026-01'],
      ['2026-02-01', '2026-02'],
      ['2026-02-28', '2026-02'],
      ['2024-02-29', '2024-02'],
    ] as const) {
      const alta = await registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        monto: '-10',
        fecha,
        descripcion: `Limite ${fecha}`,
      })
      expect((await visto(alta.id)).periodo).toBe(periodo)
    }
  })
})

describe('060: lo que llega tarde no se bloquea', () => {
  it('un alta retroactiva cambia el disponible del periodo y no se rechaza', async () => {
    // Escenario `Alta retroactiva`: un gasto con fecha de mayo estando en junio.
    await fingirRegistrado(
      (
        await registrarMovimiento(base.db, usuario, {
          cuenta_id: cuenta,
          sobre_id: sobre,
          monto: '-450',
          fecha: '2026-06-10',
          descripcion: 'Algo de junio',
        })
      ).id,
      '2026-06-20 12:00:00+00',
    )

    // Mayo todavia intacto: el gasto es de junio.
    expect(await disponible(MAYO)).toBe('3000.00')

    const alta = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-300',
      fecha: '2026-05-12',
      descripcion: 'Gasto de mayo registrado en junio',
    })

    // No hay excepcion: la operacion salio.
    expect(alta.periodo).toBe(MAYO)

    // Mayo cambia, y junio tambien, porque su ventana es acumulada y ya contenia la ventana
    // de mayo. Los dos numeros no se recalcularon: se stimulants.
    expect(await disponible(MAYO)).toBe('2700.00')
    expect(await disponible(JUNIO)).toBe('2250.00')
  })

  it('la edicion retroactiva mueve los derivados de mayo y de los posteriores', async () => {
    // Escenario `Edicion retroactiva`: se corrige un movimiento de mayo.
    const mayo = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      fecha: '2026-05-10',
      descripcion: 'Gasto de mayo por corregir',
    })
    expect(await disponible(MAYO)).toBe('2550.00')

    await editarMovimiento(base.db, usuario, mayo.id, { monto: '-800' })

    // Mayo, junio y julio se mueven los tres. Julio no tiene nada propio: lo que cambia es
    // que su ventana arrastra la de mayo. Ese es el sentido de "y de los posteriores".
    expect(await disponible(MAYO)).toBe('2200.00')
    expect(await disponible(JUNIO)).toBe('2200.00')
    expect(await disponible(JULIO)).toBe('2200.00')
    // Un periodo anterior no lo ve. La ventana es hacia adelante, no hacia atras.
    expect(await disponible('2026-04')).toBe('3000.00')
  })

  it('mover la fecha de mayo a junio deja mayo como estaba', async () => {
    const mayo = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      fecha: '2026-05-10',
      descripcion: 'Gasto de mayo',
    })

    await editarMovimiento(base.db, usuario, mayo.id, { fecha: '2026-06-10' })

    // Mayo vuelve a su cifra sola. Junio no cambia, porque su ventana ya lo contaba.
    expect(await disponible(MAYO)).toBe('3000.00')
    expect(await disponible(JUNIO)).toBe('2550.00')
  })

  it('un gasto con sobre no mueve el dinero suelto de los periodos que lo ven', async () => {
    // `dinero_suelto` es `sum(saldos) - sum(disponibles)`. Un gasto con sobre baja los dos
    // sumandos por el mismo importe, asi que la diferencia no se mueve: el dinero no estaba
    // "suelto", estaba asignado. Es el mismo mecanismo de D3, del lado del gasto.
    expect(await suelto(MAYO)).toBe('-2000.00')

    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      fecha: '2026-05-10',
      descripcion: 'Gasto de mayo',
    })

    // Mayo, junio y julio: los dos sumandos bajan 450 y el numero se queda.
    expect(await suelto(MAYO)).toBe('-2000.00')
    expect(await suelto(JUNIO)).toBe('-2000.00')
    expect(await suelto(JULIO)).toBe('-2000.00')
  })

  it('un periodo anterior ve el saldo pero no el disponible, y por eso el dinero suelto cae', async () => {
    // La asimetria que hace que `dinero_suelto` **si** dependa del periodo, y conviene tenerla
    // escrita porque no es intuitiva: **los saldos de las cuentas no llevan periodo**.
    //
    // Abril no ve el movimiento de mayo en su disponible -su ventana termina antes- pero si lo
    // ve en el saldo de la cuenta, porque el saldo es `saldo_inicial + sum(movimientos)` sin
    // fecha. De ahi que baje 450 solo de un sumando y el resultado sea 550 - 3000.
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      fecha: '2026-05-10',
      descripcion: 'Gasto de mayo',
    })

    expect(await disponible('2026-04')).toBe('3000.00')
    expect(await suelto('2026-04')).toBe('-2450.00')
    // Y no es un error de la consulta: el mismo gasto, un mes despues, deja los dos lados
    // movidos y el numero quieto.
    expect(await suelto(MAYO)).toBe('-2000.00')
  })

  it('una asignacion posterior cambia el dinero suelto solo desde su periodo', async () => {
    // El unico caso donde `dinero_suelto` **si** varia con el periodo: una asignacion entra
    // en la ventana del periodo en el que se hizo y de los siguientes. Antes de el, no
    // cuenta. Por eso los dos numeros de abajo son distintos, y por eso el periodo de la
    // asignacion -que si es una columna, a diferencia del del movimiento- importa.
    await crearAsignacion(base.db, { sobre_id: sobre, monto: '1000.00', periodo: JUNIO })

    expect(await disponible(MAYO)).toBe('3000.00')
    expect(await disponible(JUNIO)).toBe('4000.00')
    expect(await disponible(JULIO)).toBe('4000.00')

    // 1000 de saldo contra 3000 asignado: -2000. Y despues contra 4000: -3000.
    expect(await suelto(MAYO)).toBe('-2000.00')
    expect(await suelto(JUNIO)).toBe('-3000.00')
    expect(await suelto(JULIO)).toBe('-3000.00')
  })
})
