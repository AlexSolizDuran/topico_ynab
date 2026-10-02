/**
 * 060-transacciones, grupo 5: editar un movimiento.
 *
 * El titulo del grupo dice "y los derivados se recalculan", y esa es la trampa: **no hay
 * ningun recalculo**. Editar es un `update` de columnas, y los derivados se ajustan porque
 * son sumas que leen esas columnas. Por eso estas pruebas no esperan ningun paso
 * "recalcular": escriben una fila distinta y vuelven a leer saldo y disponible.
 *
 * Lo que si hace `editarMovimiento` es decidir, antes de escribir, si lo que le pidieron es
 * una edicion legitima: la cuenta y el sobre tienen que seguir siendo de la misma cartera,
 * una fila borrada no se edita —se restaura— y una pata de traspaso no se edita sola.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BaseDePruebas } from '../helpers/pg'
import { crearBaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCartera,
  crearCuenta,
  crearGrupo,
  crearMovimiento,
  crearTransferencia,
  crearUsuario,
} from '../helpers/fabricas'
import {
  MovimientoEliminado,
  MovimientoNoExiste,
  SobreDeOtraCartera,
  buscarMovimiento,
  editarMovimiento,
} from '@/repos/movimientos'
import { SobreNoExiste, crearSobre, disponibleDeSobre } from '@/repos/sobres'
import { CuentaAjena, saldoDeCuenta } from '@/repos/cuentas'
import { dineroSuelto } from '@/repos/dinero-suelto'

const ENERO = '2026-01'
const DICIEMBRE = '2025-12'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number
let cuenta: number
let otra: number
let sobre: number

let cuentas = 0
function nombreCuenta(): string {
  return `Banco ${cuentas++}`
}

let sobres = 0
async function crearSobreEn(
  usuario_id: number,
  cartera_id: number,
  nombre: string,
): Promise<number> {
  const g = await crearGrupo(base.db, cartera_id, { nombre: `Grupo ${nombre}` })
  return (await crearSobre(base.db, usuario_id, cartera_id, g, nombre)).id
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '1000.00' })
  otra = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '500.00' })
  sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Comida')).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: ENERO })
})

afterEach(async () => {
  await base.cerrar()
})

/** El gasto de 450 de enero que usan casi todas las pruebas del grupo. */
function gastoDe450(): Promise<number> {
  return crearMovimiento(base.db, {
    cuenta_id: cuenta,
    sobre_id: sobre,
    monto: '-450',
    tipo: 'gasto',
    fecha: '2026-01-15',
    descripcion: 'Compra grande',
    comercio: 'Tienda',
  })
}

function saldo(cuenta_id: number): Promise<string> {
  return saldoDeCuenta(base.db, usuario, cartera, cuenta_id)
}

function disponible(periodo = ENERO, sobre_id = sobre): Promise<string> {
  return disponibleDeSobre(base.db, usuario, cartera, sobre_id, periodo)
}

function suelto(periodo = ENERO): Promise<string> {
  return dineroSuelto(base.db, usuario, cartera, periodo)
}

describe('060: corregir el importe', () => {
  it('ajusta el saldo de la cuenta y el disponible del sobre', async () => {
    // Escenario `Corregir el importe de un gasto`: de 450 a 380.
    const movimiento = await gastoDe450()
    expect(await saldo(cuenta)).toBe('550.00')
    expect(await disponible()).toBe('2550.00')

    const corregido = await editarMovimiento(base.db, usuario, movimiento, { monto: '-380' })

    // El importe guardado conserva el signo escrito: el negativo mantiene el movimiento como gasto.
    expect(corregido.monto).toBe('-380.00')
    expect(corregido.tipo).toBe('gasto')
    // El saldo subio 70, de 550 a 620.
    expect(await saldo(cuenta)).toBe('620.00')
    // Y el disponible del sobre tambien, porque el sobre quedo con 70 menos gastados.
    expect(await disponible()).toBe('2620.00')
  })

  it('cambiar el signo cambia el tipo del movimiento', async () => {
    const movimiento = await gastoDe450()

    const corregido = await editarMovimiento(base.db, usuario, movimiento, { monto: '380' })

    expect(corregido.monto).toBe('380.00')
    expect(corregido.tipo).toBe('ingreso')
  })

  it('corregir un ingreso lo deja positivo', async () => {
    // El mismo `update` en sentido contrario: un ingreso de 2000 que se corrige a 2500.
    const ingreso = await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      monto: '2000',
      tipo: 'ingreso',
      fecha: '2026-01-05',
      descripcion: 'Sueldo',
    })
    expect(await saldo(cuenta)).toBe('3000.00')

    const corregido = await editarMovimiento(base.db, usuario, ingreso, { monto: '2500' })

    expect(corregido.monto).toBe('2500.00')
    expect(corregido.tipo).toBe('ingreso')
    expect(await saldo(cuenta)).toBe('3500.00')
  })

  it('cambiar solo la descripcion no toca ningun derivado', async () => {
    // La prueba de que editar no es "recalcular nada": si el `update` escribiera columnas de
    // saldo, un cambio de texto los moveria.
    const movimiento = await gastoDe450()
    const saldoAntes = await saldo(cuenta)
    const disponibleAntes = await disponible()
    const sueltoAntes = await suelto()

    const corregido = await editarMovimiento(base.db, usuario, movimiento, {
      descripcion: 'Compra corregida',
      comercio: 'Otro sitio',
    })

    expect(corregido.descripcion).toBe('Compra corregida')
    expect(corregido.comercio).toBe('Otro sitio')
    expect(corregido.monto).toBe('-450.00')
    expect(await saldo(cuenta)).toBe(saldoAntes)
    expect(await disponible()).toBe(disponibleAntes)
    expect(await suelto()).toBe(sueltoAntes)
  })

  it('un comercio en blanco se guarda en null', async () => {
    // La misma regla del alta: ausente o en blanco es `null`, no `""`. Una `""` seria
    // encontrada por el filtro de texto y apareceria como si tuviera comercio "".
    const movimiento = await gastoDe450()

    const corregido = await editarMovimiento(base.db, usuario, movimiento, { comercio: '   ' })

    expect(corregido.comercio).toBeNull()
  })
})

describe('060: corregir la cuenta', () => {
  it('recalcula los dos saldos y no altera el disponible del sobre', async () => {
    // Escenario `Corregir la cuenta de un movimiento`.
    const movimiento = await gastoDe450()
    const disponibleAntes = await disponible()
    expect(disponibleAntes).toBe('2550.00')

    const corregido = await editarMovimiento(base.db, usuario, movimiento, { cuenta_id: otra })

    expect(corregido.cuenta_id).toBe(otra)
    // La cuenta vieja recupera los 450: pasa de 550 a 1000.
    expect(await saldo(cuenta)).toBe('1000.00')
    // Y la nueva los resta: de 500 a 50.
    expect(await saldo(otra)).toBe('50.00')
    // El sobre no se entero: su disponible depende del importe, no de la cuenta, asi que
    // sigue en 2550. Es lo que el escenario pide explicitamente.
    expect(await disponible()).toBe(disponibleAntes)
  })
})

describe('060: la edicion no cruza carteras', () => {
  it('rechaza una cuenta de otro usuario', async () => {
    const ajena = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, ajena, { nombre: 'Casa' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta() })
    const movimiento = await gastoDe450()

    await expect(
      editarMovimiento(base.db, usuario, movimiento, { cuenta_id: cuentaAjena }),
    ).rejects.toBeInstanceOf(CuentaAjena)

    // Nada se escribio: el movimiento sigue en su cuenta y su sobre.
    const intacto = await buscarMovimiento(base.db, usuario, movimiento)
    expect(intacto?.cuenta_id).toBe(cuenta)
    expect(intacto?.sobre_id).toBe(sobre)
  })

  it('rechaza una cuenta de otra cartera del mismo usuario', async () => {
    // Existe y es del usuario, asi que no es `CuentaAjena`: lo que falla es que la cuenta y
    // el sobre quedan en carteras distintas, que es el error propio de ese caso.
    const otraCartera = await crearCartera(base.db, usuario, { nombre: 'Trabajo' })
    const cuentaLejana = await crearCuenta(base.db, otraCartera, { nombre: nombreCuenta() })
    const movimiento = await gastoDe450()

    await expect(
      editarMovimiento(base.db, usuario, movimiento, { cuenta_id: cuentaLejana }),
    ).rejects.toBeInstanceOf(SobreDeOtraCartera)
  })

  it('rechaza un sobre de otra cartera de este mismo usuario', async () => {
    const otraCartera = await crearCartera(base.db, usuario, { nombre: 'Trabajo' })
    const sobreLejano = await crearSobreEn(usuario, otraCartera, `Viajes ${sobres++}`)
    const movimiento = await gastoDe450()

    // Con el mismo error propio del alta, no con "no existe".
    await expect(
      editarMovimiento(base.db, usuario, movimiento, { sobre_id: sobreLejano }),
    ).rejects.toBeInstanceOf(SobreDeOtraCartera)

    // Y el movimiento sigue en su sobre original: el rechazo no escribio nada.
    expect((await buscarMovimiento(base.db, usuario, movimiento))?.sobre_id).toBe(sobre)
  })

  it('rechaza mover el sobre a otra cartera dejando la cuenta donde estaba', async () => {
    // El caso que obliga a validar los valores **efectivos**. La cuenta no cambia, asi que
    // una validacion que mirara solo el estado viejo pasaria —la cuenta es de `cartera` y el
    // sobre nuevo tambien lo es— y dejaria el sobre en una cartera ajena a la de su cuenta.
    const otraCartera = await crearCartera(base.db, usuario, { nombre: 'Trabajo' })
    const sobreLejano = await crearSobreEn(usuario, otraCartera, `Viajes ${sobres++}`)
    const movimiento = await gastoDe450()

    await expect(
      editarMovimiento(base.db, usuario, movimiento, { sobre_id: sobreLejano }),
    ).rejects.toBeInstanceOf(SobreDeOtraCartera)

    expect((await buscarMovimiento(base.db, usuario, movimiento))?.sobre_id).toBe(sobre)
  })

  it('rechaza un sobre de otro usuario como que no existe', async () => {
    // `SobreNoExiste` y no `SobreDeOtraCartera`: distinguirlo confirmaria que el sobre
    // existe, que es informacion que no le corresponde a este usuario.
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const sobreAjeno = await crearSobreEn(otro, carteraAjena, `Ajeno ${sobres++}`)
    const movimiento = await gastoDe450()

    await expect(
      editarMovimiento(base.db, usuario, movimiento, { sobre_id: sobreAjeno }),
    ).rejects.toBeInstanceOf(SobreNoExiste)
  })

  it('no edita un movimiento de otro usuario', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Casa' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: nombreCuenta() })
    const movimientoAjeno = await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      monto: '-450',
      tipo: 'gasto',
      fecha: '2026-01-15',
    })

    await expect(
      editarMovimiento(base.db, usuario, movimientoAjeno, { monto: '1' }),
    ).rejects.toBeInstanceOf(MovimientoNoExiste)
    // Un id inexistente se responde igual, sin crear una via para deducir que existen.
    await expect(
      editarMovimiento(base.db, usuario, 999999, { monto: '1' }),
    ).rejects.toBeInstanceOf(MovimientoNoExiste)

    // Sigue con su importe: el rechazo no escribio.
    expect((await buscarMovimiento(base.db, otro, movimientoAjeno))?.monto).toBe('-450.00')
  })
})

describe('060: editar la fecha mueve el disponible entre periodos', () => {
  it('recalcula el disponible de los dos periodos que la fecha atraviesa', async () => {
    // Escenario `Corregir la fecha al periodo anterior`. Sin columna `periodo`, esto no es un
    // "recalcular el periodo": es que la fila pasa a sumar en el otro mes. Por eso hay que
    // leer los periodos afectados.
    //
    // El disponible es **acumulado** —`asignaciones hasta el periodo` mas `movimientos hasta
    // el periodo`— asi que un movimiento de marzo ya conta en enero y en febrero. Al pasarlo
    // a enero, las ventanas de enero y febrero pasan a incluirlo: **los dos periodos
    // afectados** cambian, y marzo sigue igual porque su ventana ya lo contenia. Asi se
    // cumple el escenario sin que nadie recalculara nada.
    const movimiento = await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      tipo: 'gasto',
      fecha: '2026-03-15',
      descripcion: 'Compra de marzo',
    })
    expect(await disponible('2026-01')).toBe('3000.00')
    expect(await disponible('2026-02')).toBe('3000.00')
    expect(await disponible('2026-03')).toBe('2550.00')

    const corregido = await editarMovimiento(base.db, usuario, movimiento, { fecha: '2026-01-15' })

    // El periodo derivado cambio con la fecha, sin escribir ninguna columna.
    expect(corregido.periodo).toBe('2026-01')
    expect(await disponible('2026-01')).toBe('2550.00')
    expect(await disponible('2026-02')).toBe('2550.00')
    expect(await disponible('2026-03')).toBe('2550.00')
    // El saldo de la cuenta no depende de la fecha: sigue en 550.
    expect(await saldo(cuenta)).toBe('550.00')
  })

  it('mover un gasto al mes anterior no toca el disponible del mes de origen', async () => {
    // El caso de un mes de distancia, y su resultado no es obvio: diciembre **si** cambia,
    // y enero **no**. No es que enero se haya quedado sin recalcular: su ventana es
    // acumulada, y un movimiento de diciembre ya estaba dentro de ella antes y despues. Las
    // ventanas son anidadas, asi que cruzar una frontera deja de contar en la ventana que se
    // cierra y sigue contando en todas las que ya lo contenian.
    const movimiento = await gastoDe450()
    expect(await disponible(ENERO)).toBe('2550.00')
    expect(await disponible(DICIEMBRE)).toBe('0')

    const corregido = await editarMovimiento(base.db, usuario, movimiento, { fecha: '2025-12-20' })

    expect(corregido.periodo).toBe('2025-12')
    expect(await disponible(DICIEMBRE)).toBe('-450.00')
    expect(await disponible(ENERO)).toBe('2550.00')
  })

  it('devolver la fecha al mes original restaura el disponible de los dos', async () => {
    // El caso de reversibilidad, y el que mas se parece a "recalcular": al mover la fila de
    // vuelta, los dos meses vuelven a estar como estaban, sin que nadie guardara nada.
    const movimiento = await gastoDe450()
    await editarMovimiento(base.db, usuario, movimiento, { fecha: '2025-12-20' })
    expect(await disponible(DICIEMBRE)).toBe('-450.00')

    const deVuelta = await editarMovimiento(base.db, usuario, movimiento, { fecha: '2026-01-15' })

    expect(deVuelta.periodo).toBe('2026-01')
    expect(await disponible(ENERO)).toBe('2550.00')
    expect(await disponible(DICIEMBRE)).toBe('0')
  })
})

describe('060: una pata de traspaso no se edita desde el camino de `060`', () => {
  /**
   * Antes de `070`, `060` rechazaba editar una pata con `PataDeTraspaso`, y estas pruebas
   * fijaban ese rechazo. `070` D5 lo **cambia**: la pata se edita en espejo, reescribiendo el
   * grupo entero.
   *
   * La cobertura del comportamiento nuevo esta en `tests/traspasos/edicion.test.ts`. Acá solo
   * queda comprobar que la edicion de una pata ya **no** se rechaza, para que un cambio de
   * vuelta a `PataDeTraspaso` caiga en el lugar de siempre y no pase inadvertido.
   */
  it('no rechaza editar una pata: el espejo es responsabilidad de `070`', async () => {
    const origen = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
    const destino = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '0.00' })
    const { origen_id, destino_id } = await crearTransferencia(base.db, {
      origen_cuenta_id: origen,
      destino_cuenta_id: destino,
      monto: '500.00',
    })

    const editado = await editarMovimiento(base.db, usuario, origen_id, { monto: '450' })

    // Las dos patas cambieron juntas y con el signo dado la vuelta.
    expect(editado.monto).toBe('-450.00')
    expect((await buscarMovimiento(base.db, usuario, destino_id))?.monto).toBe('450.00')
  })
})

describe('060: editar lo que esta borrado', () => {
  it('rechaza editar un movimiento eliminado', async () => {
    // Editar algo borrado lo resucitaria sin restaurarlo, y el borrado de R6 es logico: la
    // fila sigue ahi. El orden que R6 pide es borrar, restaurar, y recien ahi editar.
    const movimiento = await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      tipo: 'gasto',
      fecha: '2026-01-15',
      eliminado_en: new Date('2026-02-01T00:00:00Z'),
    })

    await expect(
      editarMovimiento(base.db, usuario, movimiento, { monto: '380' }),
    ).rejects.toBeInstanceOf(MovimientoEliminado)
  })

  it('tampoco se le puede quitar el sobre a un movimiento eliminado', async () => {
    const movimiento = await crearMovimiento(base.db, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      tipo: 'gasto',
      fecha: '2026-01-15',
      eliminado_en: new Date('2026-02-01T00:00:00Z'),
    })

    const { asignarSobre } = await import('@/repos/movimientos')
    await expect(asignarSobre(base.db, usuario, movimiento, null)).rejects.toBeInstanceOf(
      MovimientoEliminado,
    )
  })
})
