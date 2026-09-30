import { sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import type { Dinero } from '../dinero'
import { paraCampo } from '../dinero'
import { CuentaAjena, reactivarCuenta } from './cuentas'
import { CuentasDeCarterasDistintas } from './errores-traspasos'
import { saldoDeCuenta } from './fragmentos'
import { filas } from './filas'
import { comercioNormalizado, comoImporte, insertarMovimientos } from './movimientos'

/**
 * Traspasos: el unico movimiento de dinero que **no** representa gasto ni ingreso.
 *
 * Un traspaso cambia de donde esta el dinero, no cuanto dinero tiene el usuario. Por eso es
 * el unico caso en que el proyecto escribe **dos** filas por una sola operacion del usuario:
 * las dos patas de `traspasos` R1, emparejadas por `transferencia_id` y con importes de
 * signo opuesto.
 *
 * **La cartera se deduce de las cuentas, y no se recibe.** La firma no tiene `cartera_id`, y
 * es a proposito: un `cartera_id` en la firma seria un parametro que controla el formulario
 * y que la base no puede contrastar. Con un id equivocado se escribiria en la cartera de
 * otro y el unico aviso seria un resultado plausible. La cartera sale de las dos cuentas, en
 * el `where` de la propia escritura. Ver D1 y D3, y el encabezado de `movimientos.ts`.
 *
 * **Ninguna operacion de este archivo recalcula nada.** El saldo es `saldo_inicial + sum`
 * y el disponible es `sum(asignaciones) + sum(no traspasos)`, asi que escribir o dejar de
 * escribir una fila ya los cambia. La neutralidad de R3 no esta implementada aqui: esta
 * implementada en `fragmentos.ts`, que excluye los traspasos del disponible y los suma al
 * saldo. Ver D8.
 */

export interface DatosTraspaso {
  /** La cuenta de la que sale el dinero. Es la pata negativa. Siempre viene. */
  origen_cuenta_id: number
  /**
   * La cuenta a la que entra, o `null` para un traspaso de **una sola pata**.
   *
   * `null` es un caso valido y no un dato faltante: R1 lo permite y exige avisar de que esa
   * pata no tiene contraparte y de que por eso mueve el dinero suelto y el patrimonio por el
   * importe completo. Por eso es una clave presente con valor `null` y no una clave opcional:
   * "no hay destino" y "no se paso el campo" no pueden ser la misma llamada. Ver D1 y D6.
   */
  destino_cuenta_id: number | null
  /** Con signo o sin, da igual: el signo lo decide el lado. Ver D2. */
  monto: string
  /** `AAAA-MM-DD`, el dia local. */
  fecha: string
  descripcion: string
  comercio?: string | null
  origen?: 'manual' | 'recurrente'
}

export interface ResultadoDeTraspaso {
  grupo_id: number
  /** La pata negativa. */
  origen_id: number
  /**
   * La pata positiva, o `null` en un traspaso de una sola pata.
   *
   * Es `null` y no un id porque R1 permite el traspaso de una pata: en ese caso no hay
   * contraparte y el aviso lo dice. Ver D1 y D6.
   */
  destino_id: number | null
  /** La magnitud del importe, sin signo. La nombran los avisos. */
  monto: Dinero
  /** `AAAA-MM`. */
  periodo: string
  /** El aviso de R1, si el traspaso quedo con una sola pata. */
  aviso?: string
}

/* -------------------------------------------------------------------------- */
/* Lecturas de apoyo                                                           */
/* -------------------------------------------------------------------------- */

/**
 * La cartera de una cuenta **si es de este usuario**, y `undefined` si no.
 *
 * Devuelve `undefined` en vez de lanzar por la misma razon que `carteraDeCuenta` en
 * `movimientos.ts`: quien llama necesita distinguir "no es tuya" de "es de otra cartera",
 * y un error thrown en este punto filtraria la existencia de una cuenta ajena.
 */
async function carteraSiEsMia(
  conexion: Base,
  usuario_id: number,
  cuenta_id: number,
): Promise<number | undefined> {
  const [fila] = await filas<{ cartera_id: number }>(conexion, sql`
    select c.cartera_id::int as cartera_id
    from cuentas c
    join carteras t on t.id = c.cartera_id
    where c.id = ${cuenta_id}
      and t.usuario_id = ${usuario_id}
      and c.eliminado_en is null
    limit 1
  `)

  return fila?.cartera_id
}

/**
 * El saldo de una cuenta **si es de este usuario**, y `undefined` si no.
 *
 * La pertenencia va dentro de la misma consulta que el saldo, y no como una comprobacion
 * aparte: un saldo derivado sin prueba de pertenencia en la misma sentencia es una pantalla
 * que muestra la plata de otro. El saldo sale del fragmento compartido de `fragmentos.ts`,
 * para que ni el aviso de deuda ni el resto del repo tengan cada uno su copia de la
 * formula.
 */
async function saldoSiEsMia(
  conexion: Base,
  usuario_id: number,
  cuenta_id: number,
): Promise<Dinero | undefined> {
  const [fila] = await filas<{ saldo: Dinero }>(conexion, sql`
    select (${saldoDeCuenta('c')})::text as saldo
    from cuentas c
    join carteras t on t.id = c.cartera_id
    where c.id = ${cuenta_id}
      and t.usuario_id = ${usuario_id}
      and c.eliminado_en is null
  `)

  return fila?.saldo
}

/**
 * Que error corresponde a un `insert` que no dejo filas.
 *
 * R1 y `transacciones` R3 exigen **mensajes distintos** para "esa cuenta no es tuya" y "son
 * de carteras distintas", asi que la escritura no puede decidir sola: el `where` de D3 sabe
 * que algo fallo, y no cual de las dos cosas fue.
 *
 * Se decide con una lectura, dentro de la misma transaccion y **despues** del `insert` que
 * no escribio nada. La lectura solo elige el mensaje: no decide si se escribe, y por eso no
 * abre la ventana que D3 evita. Una cuenta ajena no produce un mensaje distinto del de una
 * inexistente, asi que esto no revela que la cuenta existe.
 *
 * Que las dos sean propias y de carteras distintas es el unico caso que se puede dar aca:
 * si fueran propias y de la misma cartera, el `insert` habria escrito. Con una sola pata no
 * hay dos carteras que comparar, asi que la unica respuesta posible es la de cuenta.
 */
async function diagnosticarCuentas(
  conexion: Base,
  usuario_id: number,
  origen_cuenta_id: number,
  destino_cuenta_id: number | null,
): Promise<never> {
  if (destino_cuenta_id !== null) {
    const leidas = await filas<{ cartera_id: number; es_mia: boolean }>(conexion, sql`
      select
        c.cartera_id::int as cartera_id,
        (t.usuario_id = ${usuario_id}) as es_mia
      from cuentas c
      join carteras t on t.id = c.cartera_id
      where c.id in (${origen_cuenta_id}::int, ${destino_cuenta_id}::int)
        and c.eliminado_en is null
    `)

    const propias = leidas.filter((fila) => fila.es_mia)
    if (propias.length === 2 && propias[0]?.cartera_id !== propias[1]?.cartera_id) {
      throw new CuentasDeCarterasDistintas()
    }
  }

  throw new CuentaAjena()
}

/* -------------------------------------------------------------------------- */
/* El alta                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Registra un traspaso: el grupo y sus patas, en una sola transaccion.
 *
 * El orden es el de D1 y cada paso depende del anterior:
 *
 * 1. **El grupo.** Una fila de `grupos_transferencia` con `returning id`. No puede salir en
 *    la misma sentencia que las patas porque la FK `movimientos.transferencia_id` apunta a
 *    un id que genera la base; encadenarlo habria pedido un `cte` anidado, y la transaccion
 *    ya da la atomicidad.
 * 2. **Las patas.** De **una sola sentencia**, con la pertenencia y la igualdad de cartera
 *    en el `where`. Ver D1 y `insertarMovimientos`.
 * 3. **La reactivacion** de la cuenta de destino, si estaba archivada. Va aca adentro y no
 *    como una accion aparte porque `cuentas` R5 prohibe el estado intermedio: una cuenta
 *    archivada recibiendo dinero. Ver D4.
 * 4. **Los avisos**, que salen de lecturas. Ver D6.
 *
 * **El `tipo` es `traspaso` en las dos patas**, y por eso el signo no sale de
 * `montoConSigno`: las dos saldrian positivas. Sale del lado del formulario, con `abs` en
 * SQL. Ver D2.
 *
 * **Una pata sola no es un fallo del `insert`.** R1 la permite, asi que se registra con un
 * aviso; lo que si revierte la transaccion es que el `insert` **no** haya dejado filas, que
 * es el caso de pertenencia o de cartera. Un traspaso de una pata nunca pasa por ahi. Ver D1.
 */
export async function registrarTraspaso(
  db: Base,
  usuario_id: number,
  datos: DatosTraspaso,
): Promise<ResultadoDeTraspaso> {
  const importe = comoImporte(datos.monto)
  const comercio = comercioNormalizado(datos.comercio === undefined ? null : datos.comercio)
  const origen_movimiento = datos.origen ?? 'manual'

  // El destino en un local: TS estrecha un `datos.destino_cuenta_id !== null` una vez y no lo
  // mantiene a lo largo de la transaccion, y `destino as number` en cada uso seria la misma
  // castacion repetida cuatro veces.
  const { destino_cuenta_id: destino } = datos
  const hayDestino = destino !== null

  return db.transaction(async (tx) => {
    const conexion = tx as Base

    // El saldo de la cuenta de destino **antes**, para poder decir despues cuanto saldio
    // su deuda. Sale `undefined` si la cuenta no es de este usuario, y eso esta bien: en
    // ese caso el `insert` de abajo no va a escribir y esta lectura se descarta.
    const saldoAntes = hayDestino
      ? await saldoSiEsMia(conexion, usuario_id, destino)
      : undefined

    const [grupo] = await filas<{ id: number }>(conexion, sql`
      insert into grupos_transferencia (descripcion, fecha)
      values (${datos.descripcion}, ${datos.fecha}::date)
      returning id
    `)

    // Las patas salen de la misma sentencia, con el signo dado por el lado. El `abs` es de
    // Postgres: el signo no tiene centavos, pero normalizarlo aca evita depender de como el
    // motor trate un importe negativo escrito por el formulario. Ver D2.
    //
    // Sin destino hay **una** pata, y eso es un traspaso valido con aviso, no un fallo: R1 lo
    // permite. Lo que revierte la transaccion es que el `insert` no haya dejado filas, que es
    // el caso de pertenencia o de cartera. Ver D1.
    const patas = [
      {
        cuenta_id: datos.origen_cuenta_id,
        sobre_id: null,
        monto: sql`-abs(${importe}::numeric)`,
      },
      ...(hayDestino
        ? [
            {
              cuenta_id: destino,
              sobre_id: null,
              monto: sql`abs(${importe}::numeric)`,
            },
          ]
        : []),
    ]

    const insertadas = await insertarMovimientos(conexion, {
      usuario_id,
      patas,
      tipo: 'traspaso',
      fecha: datos.fecha,
      descripcion: datos.descripcion,
      comercio,
      origen: origen_movimiento,
      transferencia_id: grupo?.id ?? null,
    })

    if (insertadas.length === 0) {
      await diagnosticarCuentas(conexion, usuario_id, datos.origen_cuenta_id, destino)
    }

    // La cartera ya esta probada por el `where` de la escritura: las cuentas son de este
    // usuario y de la misma cartera, o no se habria escrito nada. Se lee para pasarsela a
    // `reactivarCuenta`, que exige `cartera_id` en la firma.
    const cartera_id = await carteraSiEsMia(conexion, usuario_id, datos.origen_cuenta_id)
    if (cartera_id === undefined) throw new CuentaAjena()

    if (hayDestino) {
      await reactivarCuenta(conexion, usuario_id, cartera_id, destino)
    }

    const [pataOrigen, pataDestino] = insertadas
    if (!pataOrigen) throw new CuentaAjena()

    const aviso = await avisoDeTraspaso(conexion, {
      usuario_id,
      destino_cuenta_id: destino,
      saldoAntes,
      esPataSola: insertadas.length === 1,
      magnitud: pataOrigen.magnitud,
    })

    return {
      grupo_id: grupo?.id ?? 0,
      origen_id: pataOrigen.id,
      destino_id: pataDestino?.id ?? null,
      monto: pataOrigen.magnitud,
      periodo: pataOrigen.periodo,
      ...(aviso === undefined ? {} : { aviso }),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Avisos                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Los dos avisos de R1 y R4, que son **lecturas** y no cuentas.
 *
 * - El de pata unica sale de la **forma** del grupo, no de un calculo. No hay que medir el
 *   dinero suelto para decir que se mueve por el importe: el importe ya es el dato.
 * - El de deuda se decide comparando el saldo de la cuenta de destino antes y despues, y
 *   solo si la cuenta es de **credito**. Sin el filtro por tipo, mover dinero a una cuenta
 *   corriente anunciaria "se saldio una deuda" de una cuenta que no debe nada, que es un
 *   aviso falso. Ver D6.
 *
 * Los dos salen de una sola llamada, y la comparacion es `> 0` **en SQL**: comparar dos
 * importes como strings en JavaScript seria la regla del dinero rota, y es el unico punto
 * donde un importe se mira para decidir algo.
 */
async function avisoDeTraspaso(
  conexion: Base,
  datos: {
    usuario_id: number
    destino_cuenta_id: number | null
    saldoAntes: Dinero | undefined
    esPataSola: boolean
    magnitud: Dinero
  },
): Promise<string | undefined> {
  const avisos: string[] = []

  if (datos.saldoAntes !== undefined && datos.destino_cuenta_id !== null) {
    const [deuda] = await filas<{ salio_de_deuda: boolean; cantidad: Dinero }>(conexion, sql`
      select
        (${saldoDeCuenta('c')} - ${datos.saldoAntes}::numeric) > 0 as salio_de_deuda,
        (${saldoDeCuenta('c')} - ${datos.saldoAntes}::numeric)::text as cantidad
      from cuentas c
      join carteras t on t.id = c.cartera_id
      where c.id = ${datos.destino_cuenta_id}
        and c.tipo = 'credito'
        and t.usuario_id = ${datos.usuario_id}
        and c.eliminado_en is null
        -- R4 habla de **reducir** una deuda. Una tarjeta que no debe nada no tiene deuda que
        -- reducir: meterle dinero la deja con saldo a favor, y ahi el anuncio seria falso.
        and ${datos.saldoAntes}::numeric < 0
    `)

    if (deuda?.salio_de_deuda) {
      avisos.push(
        `El traspaso saldo ${paraCampo(deuda.cantidad)} de la deuda de la cuenta de credito.`,
      )
    }
  }

  if (datos.esPataSola) {
    avisos.push(
      `Quedo con una sola pata, sin contraparte: el dinero suelto y el patrimonio se mueven por ${paraCampo(
        datos.magnitud,
      )}.`,
    )
  }

  return avisos.length === 0 ? undefined : avisos.join(' ')
}

export { CuentasDeCarterasDistintas } from './errores-traspasos'
