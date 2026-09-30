'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import { exigirEntero } from '../enteros'
import { CuentaAjena } from '../repos/cuentas'
import { ImporteInvalido } from '../repos/errores-asignaciones'
import { ImporteCero } from '../repos/errores-movimientos'
import { CuentasDeCarterasDistintas } from '../repos/errores-traspasos'
import { editarMovimiento } from '../repos/movimientos'
import { registrarTraspaso } from '../repos/traspasos'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import { ErroresDeTraspaso, destinoComoId, validarAlta, validarEdicion } from './validacion'

/**
 * Server Actions de `traspasos`.
 *
 * Adaptadores finos, como los de `carteras`, `cuentas`, `grupos`, `sobres` y
 * `transacciones`. Lo que respetan, en este orden y siempre antes del repositorio:
 *
 * 1. `exigirTokenProteccion()`. Es el CSRF: sin el, la peticion no trae nada que la
 *    vincule a esta sesion. El mensaje que sale es el generico, igual que en las otras
 *    capacidades, para que un envio sin token no le diga al otro sitio por que fallo.
 * 2. `exigirSesion()`. El `usuario_id` sale de aca y **nunca** del formulario.
 *
 * El `cartera_id` que reciben estas acciones es el de la ruta, no un campo del formulario, y
 * no se usa para decidir nada: solo para el `revalidatePath`. La cartera del traspaso la
 * deduce el repositorio de las cuentas, que es lo que impide que un `cartera_id` inventado
 * llegue a existir. Ver D2 y D7.
 */

/** Como el resto de las acciones del proyecto: `ok`, y el error con su mensaje. */
export interface ResultadoDeTraspaso {
  ok: boolean
  error?: string
  campos?: Record<string, string>
  aviso?: string
  /**
   * El periodo al que la operacion movio algo. Lo usa la vista para el aviso retroactivo de
   * `transacciones` R7: si es anterior al periodo que se esta viendo, el derivado de ese mes
   * cambio y hace falta decirlo.
   */
  periodo_afectado?: string
}

/**
 * Traduce el error al `Resultado`.
 *
 * Cada error de dominio pasa con **su** mensaje, no con uno generico. Dos razones, y las dos
 * son de R1 y R4:
 *
 * - "esa cuenta no es tuya" y "las dos cuentas son de carteras distintas" son errores
 *   **distintos** que el repositorio lanza por separado. Un `catch` que se come el mensaje
 *   los vuelve indistinguibles en la pantalla, que es justo lo que R1 prohibe.
 * - El aviso de `ResultadoDeTraspaso.aviso` no es un error: viaja por su propio campo y no
 *   por `error`, porque un traspaso que dejo el grupo con una sola pata esta **bien** hecho y
 *   solo avisa. Mezclarlos seria decir que la operacion fallo.
 *
 * La lista son **exactamente** los errores que `repos/traspasos.ts` puede lanzar, mas
 * `ErroresDeTraspaso` de la validacion y `SesionRequerida` del servidor. Un error que se
 * agregue al repositorio y se olvide aca no falla nada en compilacion —el `catch` lo
 * absorbe—, asi que la unica defensa es que este comentario y la tabla de pruebas esten al
 * dia. Ver el mismo criterio en `transacciones/acciones.ts`.
 */
function aResultado(error: unknown): ResultadoDeTraspaso {
  if (error instanceof ErroresDeTraspaso) {
    return { ok: false, error: error.message, campos: error.campos }
  }
  if (
    error instanceof CuentasDeCarterasDistintas ||
    error instanceof CuentaAjena ||
    error instanceof ImporteCero ||
    error instanceof ImporteInvalido ||
    error instanceof SesionRequerida
  ) {
    return { ok: false, error: error.message }
  }

  console.error('[traspasos] fallo no controlado:', error)
  return { ok: false, error: 'Ocurrio un problema. Intenta de nuevo.' }
}

/** Lee un campo del `FormData` como texto. `null` y `undefined` dan cadena vacia. */
function texto(datos: FormData, clave: string): string {
  const valor = datos.get(clave)
  return valor === null || valor === undefined ? '' : String(valor)
}

/**
 * El alta.
 *
 * El destino se traduce aca con `destinoComoId`, y un `''` se vuelve `null`: esa traduccion
 * vive en la validacion y no se escribe a mano, para que el repositorio reciba siempre
 * `number | null` y nunca una cadena que se parezca a un id.
 */
export async function accionRegistrarTraspaso(
  cartera_id: number,
  _estado: ResultadoDeTraspaso,
  datos: FormData,
): Promise<ResultadoDeTraspaso> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarAlta({
      origen_cuenta_id: texto(datos, 'origen_cuenta_id'),
      destino_cuenta_id: texto(datos, 'destino_cuenta_id'),
      monto: texto(datos, 'monto'),
      fecha: texto(datos, 'fecha'),
      descripcion: texto(datos, 'descripcion'),
      comercio: texto(datos, 'comercio'),
    })

    const creado = await registrarTraspaso(db, sesion.usuario_id, {
      origen_cuenta_id: exigirEntero(validado.origen_cuenta_id, 'la cuenta de origen'),
      destino_cuenta_id: destinoComoId(validado.destino_cuenta_id),
      monto: validado.monto,
      fecha: validado.fecha,
      descripcion: validado.descripcion,
      comercio: validado.comercio === '' ? null : validado.comercio,
    })

    revalidatePath(`/cartera/${cartera_id}`)
    return {
      ok: true,
      // El aviso del repositorio, si vino, viaja aqui. No se arma un mensaje propio: el
      // repositorio ya sabe distinguir el caso de una sola pata del de una deuda saldada, y
      // duplicar ese texto en la UI es una segunda fuente de verdad.
      ...(creado.aviso === undefined ? {} : { aviso: creado.aviso }),
      periodo_afectado: creado.periodo,
    }
  } catch (error) {
    return aResultado(error)
  }
}

/**
 * La edicion de una pata, que reescribe el grupo entero (D5).
 *
 * No hay `accionEditarPata` distinta de la de `transacciones`: editar una pata **es** editar
 * un movimiento, y el repositorio decide solo si la fila tiene grupo. Una accion aparte
 * tendria que duplicar el camino del token, de la sesion y del mapeo de errores para hacer
 * exactamente lo mismo.
 *
 * El aviso de pata unica vuelve del repositorio en el mismo campo que en el alta, porque R1 lo
 * exige en cada operacion que deja el grupo con una sola pata. Ver D5 y D6.
 */
export async function accionEditarTraspaso(
  cartera_id: number,
  movimiento_id: number,
  _estado: ResultadoDeTraspaso,
  datos: FormData,
): Promise<ResultadoDeTraspaso> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarEdicion({
      origen_cuenta_id: texto(datos, 'origen_cuenta_id'),
      destino_cuenta_id: texto(datos, 'destino_cuenta_id'),
      monto: texto(datos, 'monto'),
      fecha: texto(datos, 'fecha'),
      descripcion: texto(datos, 'descripcion'),
      comercio: texto(datos, 'comercio'),
    })

    const corregido = await editarMovimiento(db, sesion.usuario_id, movimiento_id, {
      cuenta_id: exigirEntero(validado.origen_cuenta_id, 'la cuenta de origen'),
      monto: validado.monto,
      fecha: validado.fecha,
      descripcion: validado.descripcion,
      comercio: validado.comercio === '' ? null : validado.comercio,
    })

    revalidatePath(`/cartera/${cartera_id}`)
    return {
      ok: true,
      aviso: corregido.aviso ?? 'El traspaso quedo corregido.',
      periodo_afectado: corregido.periodo,
    }
  } catch (error) {
    return aResultado(error)
  }
}
