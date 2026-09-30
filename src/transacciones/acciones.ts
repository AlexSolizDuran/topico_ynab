'use server'

import { revalidatePath } from 'next/cache'
import { obtenerCliente } from '../db/cliente'
import { aEntero, exigirEntero } from '../enteros'
import { CuentaAjena } from '../repos/cuentas'
import { ImporteInvalido } from '../repos/errores-asignaciones'
import {
  ImporteCero,
  MovimientoEliminado,
  MovimientoNoExiste,
  MovimientoYaEliminado,
  SobreDeOtraCartera,
  TraspasoNoAsignable,
  TraspasoNoRegistrable,
} from '../repos/errores-movimientos'
import {
  asignarSobre,
  editarMovimiento,
  eliminarMovimiento,
  quitarSobre,
  registrarMovimiento,
  restaurarMovimiento,
} from '../repos/movimientos'
import { SobreNoExiste } from '../repos/sobres'
import { exigirTokenProteccion } from '../sesion/proteccion'
import { SesionRequerida, exigirSesion } from '../sesion/server'
import {
  ErroresDeMovimiento,
  validarAlta,
  validarAsignacionSobre,
  validarEdicion,
} from './validacion'

/**
 * Server Actions de `transacciones`.
 *
 * Adaptadores finos, como los de `carteras`, `cuentas`, `grupos` y `sobres`. Lo que
 * respetan, en este orden y siempre antes del repositorio:
 *
 * 1. `exigirTokenProteccion()`. Es el CSRF: sin el, la peticion no trae nada que la
 *    vincule a esta sesion. El mensaje que sale es el generico, igual que en las otras
 *    capacidades, para que un envio sin token no le diga al otro sitio por que fallo.
 * 2. `exigirSesion()`. El `usuario_id` sale de aca y **nunca** del formulario. Por eso el
 *    `cuenta_id` que manda el formulario es lo unico que el usuario elige, y el
 *    repositorio deduce la cartera de el: un `cartera_id` inventado no llega ni a existir.
 *
 * El `cartera_id` que reciben estas acciones es el de la ruta, no un campo del formulario.
 * No es una confianza: el repositorio lo cruza con la cuenta en cada llamada.
 */

/** Como el resto de las acciones del proyecto: `ok`, y el error con su mensaje. */
export interface ResultadoDeMovimiento {
  ok: boolean
  error?: string
  campos?: Record<string, string>
  aviso?: string
  /**
   * El periodo al que el alta o la edicion movio algo. Lo usa la vista para el aviso
   * retroactivo de R7: si es anterior al periodo que se esta viendo, el derivado de ese
   * mes cambio y hace falta decirlo. Ver el grupo 8.
   */
  periodo_afectado?: string
}

/**
 * Traduce el error al `Resultado`.
 *
 * Cada error de dominio pasa con **su** mensaje, no con uno generico: R3 pide que el
 * usuario distinga "no existe o no es tuyo" de "es de otra cartera", y un `catch` que se
 * come el mensaje hace las dos cosas indistinguibles en la pantalla.
 *
 * La lista son **exactamente** los errores que `repos/movimientos.ts` puede lanzar, mas
 * `ErroresDeMovimiento` de la validacion y `SesionRequerida` del servidor. No es una lista
 * de errores "que podrian": cada rama esta justificada por un `throw` concreto, y las
 * pruebas de este archivo la recorren entera. Un error que se agregue al repositorio y se
 * olvide aca no falla nada en compilacion -el `catch` lo absorbs-, asi que la unica defensa
 * es que este comentario y la tabla de pruebas esten al dia.
 *
 * Notese lo que **no** esta: `CarteraAjena` ni `CarteraArchivada`. Estas acciones no
 * reciben un `cartera_id` de confianza para cruzar contra el usuario: el repositorio lo
 * deduce de la cuenta y si esa cuenta no es del usuario lanza `CuentaAjena`. Nombrar los de
 * cartera seria suplantar una comprobacion que no ocurre.
 *
 * Y notese lo que **ya no** esta: `PataDeTraspaso`. `070` D5 cambio esa regla —editar una
 * pata ahora reescribe el grupo entero—, asi que el error no lo lanza nadie. Dejarlo en la
 * lista haria que este comentario, que promete listar solo lo alcanzable, mintiera.
 */
function aResultado(error: unknown): ResultadoDeMovimiento {
  if (error instanceof ErroresDeMovimiento) {
    return { ok: false, error: error.message, campos: error.campos }
  }
  if (
    error instanceof MovimientoNoExiste ||
    error instanceof MovimientoEliminado ||
    error instanceof MovimientoYaEliminado ||
    error instanceof TraspasoNoRegistrable ||
    error instanceof TraspasoNoAsignable ||
    error instanceof SobreDeOtraCartera ||
    error instanceof SobreNoExiste ||
    error instanceof ImporteCero ||
    error instanceof ImporteInvalido ||
    error instanceof CuentaAjena ||
    error instanceof SesionRequerida
  ) {
    return { ok: false, error: error.message }
  }

  console.error('[transacciones] fallo no controlado:', error)
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
 * `tipo` no viaja desde el formulario como decision: si viene, es el que el usuario
 * eligio en un selector; si no, lo deduce el repositorio del signo del importe. Es lo que
 * hace que un campo de texto con `450` sea un gasto y con `-450` tambien, sin que haya que
 * explicar el signo en la etiqueta.
 */
export async function accionRegistrarMovimiento(
  cartera_id: number,
  _estado: ResultadoDeMovimiento,
  datos: FormData,
): Promise<ResultadoDeMovimiento> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarAlta({
      cuenta_id: texto(datos, 'cuenta_id'),
      sobre_id: texto(datos, 'sobre_id'),
      monto: texto(datos, 'monto'),
      fecha: texto(datos, 'fecha'),
      descripcion: texto(datos, 'descripcion'),
      comercio: texto(datos, 'comercio'),
      tipo: texto(datos, 'tipo') || undefined,
    })

    const creado = await registrarMovimiento(db, sesion.usuario_id, {
      cuenta_id: exigirEntero(validado.cuenta_id, 'la cuenta'),
      sobre_id: aEntero(validado.sobre_id),
      monto: validado.monto,
      fecha: validado.fecha,
      descripcion: validado.descripcion,
      comercio: validado.comercio === '' ? null : validado.comercio,
      tipo: validado.tipo,
    })

    revalidatePath(`/cartera/${cartera_id}`)
    return {
      ok: true,
      aviso: `El movimiento quedo registrado en ${creado.periodo}.`,
      periodo_afectado: creado.periodo,
    }
  } catch (error) {
    return aResultado(error)
  }
}

/**
 * La edicion.
 *
 * Los datos del formulario son los **valores efectivos**, no el parche: si el formulario
 * manda todos los campos, `editarMovimiento` valida contra lo que quedaria, no contra lo
 * que el usuario pretendia dejar sin tocar. Por eso el `tipo` no se pasa: no es editable.
 */
export async function accionEditarMovimiento(
  cartera_id: number,
  movimiento_id: number,
  _estado: ResultadoDeMovimiento,
  datos: FormData,
): Promise<ResultadoDeMovimiento> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const validado = validarEdicion({
      cuenta_id: texto(datos, 'cuenta_id'),
      sobre_id: texto(datos, 'sobre_id'),
      monto: texto(datos, 'monto'),
      fecha: texto(datos, 'fecha'),
      descripcion: texto(datos, 'descripcion'),
      comercio: texto(datos, 'comercio'),
    })

    const corregido = await editarMovimiento(db, sesion.usuario_id, movimiento_id, {
      cuenta_id: exigirEntero(validado.cuenta_id, 'la cuenta'),
      sobre_id: aEntero(validado.sobre_id),
      monto: validado.monto,
      fecha: validado.fecha,
      descripcion: validado.descripcion,
      comercio: validado.comercio === '' ? null : validado.comercio,
    })

    revalidatePath(`/cartera/${cartera_id}`)
    return {
      ok: true,
      aviso: 'El movimiento quedo corregido.',
      periodo_afectado: corregido.periodo,
    }
  } catch (error) {
    return aResultado(error)
  }
}

/**
 * Borrar, y el aviso que dice cuantas filas salieron.
 *
 * El numero va en el mensaje porque no siempre es uno: si el movimiento era una pata de
 * un traspaso, la cascada de D7 marco las dos. Decir "se borro" a secas dejaria al
 * usuario sin saber que tambien se fue la otra pata.
 */
export async function accionEliminarMovimiento(
  cartera_id: number,
  movimiento_id: number,
  _estado: ResultadoDeMovimiento,
  _datos: FormData,
): Promise<ResultadoDeMovimiento> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const resultado = await eliminarMovimiento(db, sesion.usuario_id, movimiento_id)

    revalidatePath(`/cartera/${cartera_id}`)
    return {
      ok: true,
      aviso:
        resultado.eliminados > 1
          ? `Se eliminaron ${resultado.eliminados} movimientos: el traspaso completo.`
          : 'El movimiento quedo eliminado. Puedes restaurarlo.',
    }
  } catch (error) {
    return aResultado(error)
  }
}

/** Restaurar, con la cascada en espejo: las dos patas vuelven juntas. */
export async function accionRestaurarMovimiento(
  cartera_id: number,
  movimiento_id: number,
  _estado: ResultadoDeMovimiento,
  _datos: FormData,
): Promise<ResultadoDeMovimiento> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const resultado = await restaurarMovimiento(db, sesion.usuario_id, movimiento_id)

    revalidatePath(`/cartera/${cartera_id}`)
    return {
      ok: true,
      aviso:
        resultado.restaurados > 1
          ? `Se restauraron ${resultado.restaurados} movimientos: el traspaso completo.`
          : 'El movimiento volvio a estar.',
    }
  } catch (error) {
    return aResultado(error)
  }
}

/**
 * Asignar un sobre, o quitarlo si el campo viene vacio.
 *
 * Una sola accion para las dos cosas: el formulario ya se llama "sobre" y su valor
 * vacio significa "ninguno", asi que partirlo en dos daria dos rutas para el mismo gesto
 * y la chance de que la UI ofrezca quitar a un movimiento que si tiene sobre.
 */
export async function accionAsignarSobre(
  cartera_id: number,
  movimiento_id: number,
  _estado: ResultadoDeMovimiento,
  datos: FormData,
): Promise<ResultadoDeMovimiento> {
  const db = obtenerCliente()
  try {
    await exigirTokenProteccion()
    const sesion = await exigirSesion()
    const { sobre_id } = validarAsignacionSobre({ sobre_id: texto(datos, 'sobre_id') })

    if (sobre_id === '') {
      await quitarSobre(db, sesion.usuario_id, movimiento_id)
    } else {
      await asignarSobre(db, sesion.usuario_id, movimiento_id, exigirEntero(sobre_id, 'el sobre'))
    }

    revalidatePath(`/cartera/${cartera_id}`)
    return { ok: true, aviso: sobre_id === '' ? 'Se le quito el sobre.' : 'Se le asigno el sobre.' }
  } catch (error) {
    return aResultado(error)
  }
}
