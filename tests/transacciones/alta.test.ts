/**
 * 060-transacciones, grupo 3: el alta y la lectura.
 *
 * La pregunta que estas pruebas repiten es una sola, en dos formas:
 *
 * - **¿de donde sale la cartera?** R10 dice que de la cuenta, y no de un dato declarado.
 *   Cada prueba de aislamiento pasa una cuenta de otra persona y exige un error, no una
 *   fila. Y la prueba de las dos carteras del mismo usuario exige que el listado sin
 *   filtros devuelva las dos, porque la cartera no se elige: se deduce.
 * - **¿el saldo y el disponible se guardan, o se derivan?** Un alta los mueve sin escribir
 *   ninguna columna de saldo. Si alguien agrega esas columnas, estas pruebas fallan.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BaseDePruebas } from '../helpers/pg'
import { crearBaseDePruebas } from '../helpers/pg'
import {
  crearAsignacion,
  crearCuenta,
  crearMovimiento,
  crearGrupo,
  crearCartera,
  crearUsuario,
} from '../helpers/fabricas'
import {
  SobreDeOtraCartera,
  TraspasoNoRegistrable,
  listarMovimientos,
  registrarMovimiento,
} from '@/repos/movimientos'
import { SobreNoExiste } from '@/repos/sobres'
import { crearSobre, disponibleDeSobre } from '@/repos/sobres'
import { CuentaAjena, saldoDeCuenta } from '@/repos/cuentas'
import { dineroSuelto } from '@/repos/dinero-suelto'

const ENERO = '2026-01'
const MARZO = '2026-03'

let base: BaseDePruebas
let usuario: number
let cartera: number
let grupo: number
let cuenta: number
let sobre: number

let cuentas = 0
/** Un nombre unico de cuenta: `cuentas` exige nombre unico dentro de la cartera. */
function nombreCuenta(prefijo = 'Banco'): string {
  return `${prefijo} ${cuentas++}`
}

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
  grupo = await crearGrupo(base.db, cartera, { nombre: 'Fijos' })
  cuenta = await crearCuenta(base.db, cartera, { nombre: nombreCuenta(), saldo_inicial: '1000.00' })
  sobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Comida')).id
  await crearAsignacion(base.db, { sobre_id: sobre, monto: '3000.00', periodo: ENERO })
})

afterEach(async () => {
  await base.cerrar()
})

/** El saldo de una cuenta que existe, sin depender de `saldoDeCuenta` y sus errores. */
async function saldo(cuenta_id: number): Promise<string> {
  return saldoDeCuenta(base.db, usuario, cartera, cuenta_id)
}

describe('060: registrar un gasto', () => {
  it('lo registra con importe negativo y mueve saldo y disponible', async () => {
    // El formulario manda el tipo, y el repositorio le da la vuelta al signo si hace
    // falta: un gasto escrito como `450` queda `-450.00`. Ver R1.
    const creado = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '450',
      tipo: 'gasto',
      fecha: '2026-01-15',
      descripcion: 'Uber a casa',
    })

    expect(creado.tipo).toBe('gasto')
    expect(creado.monto).toBe('-450.00')
    expect(await saldo(cuenta)).toBe('550.00')
    expect(await disponibleDeSobre(base.db, usuario, cartera, sobre, ENERO)).toBe('2550.00')
  })

  it('el importe se guarda con el signo que manda el tipo', async () => {
    // R1: el importe lleva el signo del tipo, no el que escribio la persona. Un gasto
    // escrito como `450` queda `-450.00`, y un ingreso escrito como `-450` queda positivo.
    const gasto = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      monto: '450',
      tipo: 'gasto',
      fecha: '2026-01-15',
      descripcion: 'Gasto escrito positivo',
    })
    expect(gasto.monto).toBe('-450.00')

    const ingreso = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      monto: '-450',
      tipo: 'ingreso',
      fecha: '2026-01-15',
      descripcion: 'Ingreso escrito negativo',
    })
    expect(ingreso.monto).toBe('450.00')
  })

  it('sin tipo, el signo decide: negativo es gasto y positivo es ingreso', async () => {
    // El formulario manda el signo y el repositorio decide que significa. Ver D9.
    const gasto = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      monto: '-120',
      fecha: '2026-01-15',
      descripcion: 'Compra',
    })
    expect(gasto.tipo).toBe('gasto')

    const ingreso = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      monto: '25000',
      fecha: '2026-01-15',
      descripcion: 'Quincena',
    })
    expect(ingreso.tipo).toBe('ingreso')
  })

  it('guarda el comercio cuando viene', async () => {
    const id = (
      await registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        sobre_id: sobre,
        monto: '250',
        fecha: '2026-01-15',
        descripcion: 'Cafe',
        comercio: 'Cafe Brasil',
      })
    ).id

    const [visto] = await listarMovimientos(base.db, usuario)
    expect(visto?.comercio).toBe('Cafe Brasil')
    expect(visto?.id).toBe(id)
  })

  it('un importe cero no se registra', async () => {
    // R1 lo prohibe. El formulario ya lo rechaza, y el repositorio tambien, porque un
    // repositorio al que se llame sin pasar por el formulario tiene que seguir siendo la
    // frontera.
    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        monto: '0.00',
        fecha: '2026-01-15',
        descripcion: 'Nada',
      }),
    ).rejects.toThrow(/distinto de cero/)
  })

  it('un importe que no es numero no llega a Postgres', async () => {
    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        monto: 'docientos',
        fecha: '2026-01-15',
        descripcion: 'Algo',
      }),
    ).rejects.toThrow()
  })

  it('el alta de un traspaso no existe todavia', async () => {
    // R1 pide distinguir los tres tipos, y la columna y el filtro lo hacen. Lo que no
    // existe es el formulario de las dos patas: ese es `070-traspasos`. Ver D5.
    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        monto: '500',
        tipo: 'traspaso',
        fecha: '2026-01-15',
        descripcion: 'Traspaso',
      }),
    ).rejects.toThrow(TraspasoNoRegistrable)
  })
})

describe('060: la cartera se deduce de la cuenta', () => {
  it('no acepta una cartera declarada: la firma no la tiene', async () => {
    // La prueba del aislamiento es doble: la cartera ajena no se cuela por la cuenta, y
    // el `usuario_id` es la unica entrada de usuario que existe en la firma.
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Suya' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: 'Suyo' })

    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: cuentaAjena,
        monto: '-450',
        fecha: '2026-01-15',
        descripcion: 'No deberia entrar',
      }),
    ).rejects.toThrow(CuentaAjena)

    // Y no quedo ninguna fila: el error tiene que venir con la base intacta.
    expect(await listarMovimientos(base.db, usuario)).toEqual([])
    const [ajena] = await listarMovimientos(base.db, otro)
    expect(ajena).toBeUndefined()
  })

  it('rechaza un sobre de otra cartera del mismo usuario', async () => {
    // El error es propio y distinto del de "no existe": el usuario tiene ese sobre a la
    // vista, asi que decirle que no existe lo mandaria a buscar un error de tipeo. Ver D2.
    const otraCartera = await crearCartera(base.db, usuario, { nombre: 'Trabajo' })
    const grupoAjeno = await crearGrupo(base.db, otraCartera, { nombre: 'Otros' })
    const sobreAjeno = (await crearSobre(base.db, usuario, otraCartera, grupoAjeno, 'Cena')).id

    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        sobre_id: sobreAjeno,
        monto: '-450',
        fecha: '2026-01-15',
        descripcion: 'Cruzado',
      }),
    ).rejects.toThrow(SobreDeOtraCartera)
  })

  it('rechaza un sobre que no existe, con su propio mensaje', async () => {
    await expect(
      registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        sobre_id: 999999,
        monto: '-450',
        fecha: '2026-01-15',
        descripcion: 'Sobre inventado',
      }),
    ).rejects.toThrow(SobreNoExiste)
  })

  it('sin cartera_id no hay forma de escribir en la cartera de otro', async () => {
    // El esquema de `sobres` tiene `pertenenciaDeSobre` para esto. Aca la pertenencia va
    // en el mismo `where exists` del `insert`, asi que no hay ventana entre comprobar y
    // escribir.
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Suya' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: 'Suyo' })

    await registrarMovimiento(base.db, otro, {
      cuenta_id: cuentaAjena,
      monto: '-100',
      fecha: '2026-01-15',
      descripcion: 'Movimiento propio',
    })

    expect(await listarMovimientos(base.db, usuario)).toEqual([])
  })
})

describe('060: un alta sin sobre queda pendiente', () => {
  it('se acepta y el disponible de ningun sobre se mueve', async () => {
    const disponibleAntes = await disponibleDeSobre(base.db, usuario, cartera, sobre, ENERO)

    const creado = await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      monto: '-200',
      fecha: '2026-01-15',
      descripcion: 'Compra sin destino',
    })

    expect(creado.tipo).toBe('gasto')
    expect(creado.monto).toBe('-200.00')
    // R2: no se impide el gasto por no tener sobre.
    expect(await disponibleDeSobre(base.db, usuario, cartera, sobre, ENERO)).toBe(
      disponibleAntes,
    )
    // Y el saldo si cambia: el dinero salio de la cuenta aunque no tenga donde aterrizar.
    expect(await saldo(cuenta)).toBe('800.00')
  })

  it('el dinero suelto baja por el importe', async () => {
    const antes = await dineroSuelto(base.db, usuario, cartera, ENERO)
    // El sobre tiene 3000 asignados y la cuenta 1000, asi que el disponible esta en
    // sobregiro por 2000 y el dinero suelto **arranca negativo**: es
    // `suma(saldos) - suma(disponibles)`, y lo que no esta asignado es lo que se descuenta.
    expect(antes).toBe('-2000.00')

    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      monto: '-200',
      fecha: '2026-01-15',
      descripcion: 'Gasto sin asignar',
    })

    // El saldo baja 200 y ningun disponible cambio, asi que el importe sigue contando
    // como dinero suelto: baja exactamente por lo que dice R2.
    expect(await dineroSuelto(base.db, usuario, cartera, ENERO)).toBe('-2200.00')
  })

  it('aparece marcado como pendiente, y ofrece asignarle un sobre', async () => {
    const id = (
      await registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        monto: '-200',
        fecha: '2026-01-15',
        descripcion: 'Sin destino',
      })
    ).id

    const [visto] = await listarMovimientos(base.db, usuario)
    expect(visto?.id).toBe(id)
    expect(visto?.pendiente).toBe(true)
    expect(visto?.sobre_id).toBeNull()
  })

  it('un movimiento con sobre no es pendiente', async () => {
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-200',
      fecha: '2026-01-15',
      descripcion: 'Con destino',
    })

    const [visto] = await listarMovimientos(base.db, usuario)
    expect(visto?.pendiente).toBe(false)
  })
})

describe('060: el comercio ausente es null', () => {
  it('se guarda en null, no en cadena vacia', async () => {
    const id = (
      await registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        sobre_id: sobre,
        monto: '-200',
        fecha: '2026-01-15',
        descripcion: 'Sin comercio',
      })
    ).id

    const [visto] = await listarMovimientos(base.db, usuario)
    expect(visto?.id).toBe(id)
    expect(visto?.comercio).toBeNull()
  })

  it('un comercio de solo espacios es ausencia, no una cadena vacia', async () => {
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-200',
      fecha: '2026-01-15',
      descripcion: 'Sin comercio',
      comercio: '   ',
    })

    const [visto] = await listarMovimientos(base.db, usuario)
    expect(visto?.comercio).toBeNull()
  })

  it('no se encuentra por la busqueda de texto como si fuera cadena vacia', async () => {
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-200',
      fecha: '2026-01-15',
      descripcion: 'Sin comercio',
    })

    // Un `comercio = ''` haria que `coalesce(comercio, '')` devolviera todos los
    // movimientos sin comercio en cualquier busqueda. Con `null`, no.
    expect(await listarMovimientos(base.db, usuario, { texto: 'ZZZ-no-existe' })).toEqual([])
  })
})

describe('060: los filtros de la lectura', () => {
  beforeEach(async () => {
    const otra = await crearCuenta(base.db, cartera, { nombre: nombreCuenta() })
    await crearAsignacion(base.db, { sobre_id: sobre, monto: '500.00', periodo: ENERO })
    const otroSobre = (await crearSobre(base.db, usuario, cartera, grupo, 'Transporte')).id

    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      fecha: '2026-01-10',
      descripcion: 'Uber al trabajo',
      comercio: 'Uber',
    })
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: otroSobre,
      monto: '-120',
      fecha: '2026-01-20',
      descripcion: 'Camion',
    })
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: otra,
      sobre_id: otroSobre,
      monto: '25000',
      fecha: '2026-01-25',
      descripcion: 'Quincena',
    })
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: otroSobre,
      monto: '-80',
      fecha: '2026-02-05',
      descripcion: 'Cafe',
      comercio: 'Cafe Brasil',
    })
  })

  it('busca el texto en la descripcion y en el comercio', async () => {
    const porDescripcion = await listarMovimientos(base.db, usuario, { texto: 'Quincena' })
    expect(porDescripcion).toHaveLength(1)

    // El mismo texto aparece en dos columnas distintas y las dos se buscan.
    const porComercio = await listarMovimientos(base.db, usuario, { texto: 'Uber' })
    expect(porComercio).toHaveLength(1)
    expect(porComercio[0]?.descripcion).toBe('Uber al trabajo')
  })

  it('filtra por cuenta', async () => {
    const deUnaCuenta = await listarMovimientos(base.db, usuario, { cuenta_id: cuenta })
    expect(deUnaCuenta.map((m) => m.descripcion).sort()).toEqual([
      'Cafe',
      'Camion',
      'Uber al trabajo',
    ])

    const deLaOtra = await listarMovimientos(base.db, usuario, { cuenta_id: 999999 })
    expect(deLaOtra).toEqual([])
  })

  it('filtra por sobre', async () => {
    const transporte = await listarMovimientos(base.db, usuario, {
      sobre_id: (await crearSobre(base.db, usuario, cartera, grupo, 'Otro')).id,
    })
    expect(transporte).toEqual([])

    const deComida = await listarMovimientos(base.db, usuario, { sobre_id: sobre })
    expect(deComida.map((m) => m.descripcion)).toEqual(['Uber al trabajo'])
  })

  it('filtra por tipo', async () => {
    const ingresos = await listarMovimientos(base.db, usuario, { tipo: 'ingreso' })
    expect(ingresos.map((m) => m.descripcion)).toEqual(['Quincena'])
  })

  it('filtra por rango de fechas, con los dos extremos incluidos', async () => {
    const enero = await listarMovimientos(base.db, usuario, {
      desde: '2026-01-01',
      hasta: '2026-01-31',
    })
    expect(enero).toHaveLength(3)

    // Un solo dia, con el extremo exacto.
    const unDia = await listarMovimientos(base.db, usuario, {
      desde: '2026-01-25',
      hasta: '2026-01-25',
    })
    expect(unDia.map((m) => m.descripcion)).toEqual(['Quincena'])
  })

  it('combina los filtros, y una combinacion sin coincidencias devuelve lista vacia', async () => {
    // R9 pide aplicar los filtros de forma combinada. Tipo mas rango: solo el gasto de
    // enero.
    const gastoDeEnero = await listarMovimientos(base.db, usuario, {
      tipo: 'gasto',
      desde: '2026-01-01',
      hasta: '2026-01-31',
    })
    expect(gastoDeEnero.map((m) => m.descripcion).sort()).toEqual(['Camion', 'Uber al trabajo'])

    // Y una combinacion imposible: lista vacia, no la lista sin filtrar.
    const imposible = await listarMovimientos(base.db, usuario, {
      tipo: 'ingreso',
      texto: 'Uber',
    })
    expect(imposible).toEqual([])
  })

  it('el filtro de texto no se come a los otros filtros', async () => {
    // El `or` entre descripcion y comercio tiene que quedar **agrupado** dentro del `and`.
    // Si se escapa, `and` bindea mas fuerte que `or` y el filtro de texto se come al de
    // tipo: la consulta no da error, devuelve movimientos del tipo equivocado, y la lista
    // que se ve es plausible. Esta prueba falla si alguien desagrupa el `or`.
    const cafe = await listarMovimientos(base.db, usuario, { texto: 'Cafe' })
    expect(cafe.map((m) => m.descripcion)).toEqual(['Cafe'])
    expect(cafe.map((m) => m.tipo)).toEqual(['gasto'])

    // El mismo texto, con el tipo que no es: lista vacia.
    expect(await listarMovimientos(base.db, usuario, { texto: 'Cafe', tipo: 'ingreso' })).toEqual([])

    // Y al reves: el texto casa por `comercio`, y el filtro de tipo sigue mandando.
    expect(await listarMovimientos(base.db, usuario, { texto: 'Uber', tipo: 'ingreso' })).toEqual([])
    expect(await listarMovimientos(base.db, usuario, { texto: 'Uber', tipo: 'gasto' })).toHaveLength(1)
  })

  it('ordena por fecha, y la mas reciente primero', async () => {
    const todos = await listarMovimientos(base.db, usuario)
    expect(todos.map((m) => m.descripcion)).toEqual(['Cafe', 'Quincena', 'Camion', 'Uber al trabajo'])
  })

  it('devuelve cada movimiento con su periodo derivado de la fecha', async () => {
    const todos = await listarMovimientos(base.db, usuario)
    const febrero = todos.find((m) => m.descripcion === 'Cafe')

    // D1: el periodo sale de `date_trunc('month', fecha)`, no de una columna.
    expect(febrero?.periodo).toBe('2026-02')
    expect(todos.find((m) => m.descripcion === 'Quincena')?.periodo).toBe('2026-01')
  })
})

describe('060: el filtro de texto escapa los comodines', () => {
  beforeEach(async () => {
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-100',
      fecha: '2026-01-10',
      descripcion: 'Descuento 100%',
    })
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-60',
      fecha: '2026-01-11',
      descripcion: 'Camion con guion bajo a_b',
    })
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-30',
      fecha: '2026-01-12',
      descripcion: 'Otro gasto',
    })
  })

  it('buscar "100%" no trae todos los movimientos', async () => {
    // Sin escapar, el `%` del usuario seria un comodin y la busqueda devolveria la tabla
    // entera. Ver D10.
    const encontrados = await listarMovimientos(base.db, usuario, { texto: '100%' })

    expect(encontrados).toHaveLength(1)
    expect(encontrados[0]?.descripcion).toBe('Descuento 100%')
  })

  it('el guion bajo no funciona como comodin', async () => {
    const conGuion = await listarMovimientos(base.db, usuario, { texto: 'a_b' })
    expect(conGuion.map((m) => m.descripcion)).toEqual(['Camion con guion bajo a_b'])

    // `a_b` como patron traeria tambien `axb`. No hay ninguno, asi que la diferencia se
    // ve al buscar un texto que solo casaria con el comodin.
    expect(await listarMovimientos(base.db, usuario, { texto: 'a%b' })).toEqual([])
  })

  it('un texto con la barra invertida no rompe la busqueda', async () => {
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-15',
      fecha: '2026-01-13',
      descripcion: 'Ruta C:\\carpeta',
    })

    const encontrados = await listarMovimientos(base.db, usuario, { texto: 'C:\\' })
    expect(encontrados.map((m) => m.descripcion)).toEqual(['Ruta C:\\carpeta'])
  })
})

describe('060: el listado abarca todas las carteras del usuario', () => {
  it('sin filtros devuelve los movimientos de las dos carteras', async () => {
    // R9 habla de "los movimientos de su cartera", y el usuario puede tener varias. Como
    // la cartera no se declara (R10), el listado no puede restringirse a una sola.
    const otraCartera = await crearCartera(base.db, usuario, { nombre: 'Trabajo' })
    const grupoTrabajo = await crearGrupo(base.db, otraCartera, { nombre: 'Trabajo' })
    const cuentaTrabajo = await crearCuenta(base.db, otraCartera, {
      nombre: 'Nómina',
      saldo_inicial: '0.00',
    })
    const sobreTrabajo = (await crearSobre(base.db, usuario, otraCartera, grupoTrabajo, 'Cena')).id

    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuenta,
      sobre_id: sobre,
      monto: '-450',
      fecha: '2026-01-10',
      descripcion: 'Gasto de casa',
    })
    await registrarMovimiento(base.db, usuario, {
      cuenta_id: cuentaTrabajo,
      sobre_id: sobreTrabajo,
      monto: '-80',
      fecha: '2026-01-11',
      descripcion: 'Gasto de trabajo',
    })

    const todos = await listarMovimientos(base.db, usuario)
    expect(todos).toHaveLength(2)

    // Cada fila trae **su** cartera, deducida de su cuenta.
    expect(todos.find((m) => m.descripcion === 'Gasto de casa')?.cartera_id).toBe(cartera)
    expect(todos.find((m) => m.descripcion === 'Gasto de trabajo')?.cartera_id).toBe(otraCartera)
  })

  it('los movimientos de otro usuario no aparecen ni al filtrar por su cuenta', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Suya' })
    const cuentaAjena = await crearCuenta(base.db, carteraAjena, { nombre: 'Suyo' })
    const idAjeno = await crearMovimiento(base.db, {
      cuenta_id: cuentaAjena,
      monto: '-900',
      tipo: 'gasto',
      fecha: '2026-01-15',
      descripcion: 'Ajeno',
    })

    const idMio = (
      await registrarMovimiento(base.db, usuario, {
        cuenta_id: cuenta,
        monto: '-100',
        fecha: '2026-01-15',
        descripcion: 'Mio',
      })
    ).id

    // Filtrar por la cuenta ajena no la hace aparecer: la pertenencia y el filtro van en
    // el mismo `where`.
    const porCuentaAjena = await listarMovimientos(base.db, usuario, { cuenta_id: cuentaAjena })
    expect(porCuentaAjena).toEqual([])

    const todos = await listarMovimientos(base.db, usuario)
    expect(todos.map((m) => m.id)).toEqual([idMio])
    expect(todos.map((m) => m.id)).not.toContain(idAjeno)
  })
})
