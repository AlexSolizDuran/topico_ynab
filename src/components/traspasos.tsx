'use client'

/**
 * La vista de traspasos: el alta y la edicion de una pata.
 *
 * Tres cosas de este archivo que conviene tener presentes:
 *
 * 1. **El alta de un traspaso no acepta sobre.** Un traspaso no gasta: mueve dinero entre
 *    cuentas. Por eso el formulario no tiene un selector de sobre, y R2 no lo cuenta como
 *    pendiente aunque no tenga uno. Si se le agregara, la pantalla prometeria una asignacion
 *    que `editarMovimiento` rechaza con `TraspasoNoAsignable`.
 *
 * 2. **Editar una pata reescribe la opuesta** (D5). El formulario lo dice **antes** de
 *    guardar, no despues, con el aviso visible en el HTML y no en un `onClick`: el efecto
 *    sorprende, y un aviso que aparece solo cuando la operacion ya ocurrio no avisa de
 *    nada. Por eso el aviso es una pieza del formulario y no parte del resultado.
 *
 * 3. **El destino puede quedar vacio**, y vacio es una pata unica, no un formulario
 *    incompleto. El texto de la opcion vacia lo dice, porque "Sin contraparte" sin
 *    explicacion parece un forgot.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { MovimientoEnVista } from './transacciones'
import {
  accionEditarTraspaso,
  accionRegistrarTraspaso,
  type ResultadoDeTraspaso,
} from '../traspasos/acciones'
import { absDinero, paraCampo } from '../dinero'
import { Aviso, AvisoRetroactivo, Boton, Campo, type OpcionVista, Selector } from './sesion'
import detalle from './detalle.module.css'

/**
 * El estado de partida de cada formulario.
 *
 * Va anotado con el tipo del resultado y no como `{ ok: false } as const`: sin la anotacion,
 * TypeScript infiere el literal y `estado.campos` deja de existir. Es el mismo motivo, palabra
 * por palabra, que en `transacciones`.
 */
const INICIAL: ResultadoDeTraspaso = { ok: false }

/**
 * El texto de la opcion vacia del destino.
 *
 * Aparece en el desplegable y no en un parrafo aparte porque es la unica parte del formulario
 * donde "vacio" significa algo concreto en vez de "todavia no elegiste": acá significa que el
 * traspaso se va a quedar con una pata sola.
 */
const SIN_CONTRAPARTE = 'Sin contraparte (una pata sola)'

/**
 * El boton que se deshabilita mientras su formulario corre.
 *
 * Va duplicado desde `transacciones` a proposito: usa `useFormStatus`, que necesita el
 * contexto de React del cliente, y `sesion.tsx` es a proposito un modulo sin dependencias de
 * cliente para poder usarse desde server components. Cuatro lineas beat un `use client` en un
 * archivo compartido.
 */
function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

/**
 * El resultado de una accion, con el aviso retroactivo al lado.
 *
 * Las dos mitades van juntas por la misma razon que en `transacciones`: si la operacion se
 * hizo, el `aviso` dice que paso y el aviso retroactivo agrega el matiz de que tambien se
 * movio un mes anterior. En un error solo hay mensaje.
 */
function Resultado({ estado, periodo }: { estado: ResultadoDeTraspaso; periodo: string }) {
  if (estado.error) {
    return <Aviso tono="error">{estado.error}</Aviso>
  }
  return (
    <div className={detalle.bloque}>
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
      <AvisoRetroactivo periodoAfectado={estado.periodo_afectado} periodoActual={periodo} />
    </div>
  )
}

/**
 * El bloque de arriba del formulario: el resultado y el pique para mirar los campos.
 *
 * El detalle de cada campo no va aca: cada `Campo` y cada `Selector` ya muestran el suyo desde
 * `estado.campos`, que es donde llega.
 */
function Campos({ estado, periodo }: { estado: ResultadoDeTraspaso; periodo: string }) {
  return (
    <>
      <Resultado estado={estado} periodo={periodo} />
      {estado.campos && !estado.error ? (
        <p className={detalle.nota}>
          Revisá los campos marcados e intentá de nuevo.
        </p>
      ) : null}
    </>
  )
}

/**
 * El aviso de que editar una pata reescribe la opuesta (D5).
 *
 * Va en el formulario, arriba del boton y siempre presente mientras el formulario esta abierto,
 * no condicionado a que el usuario toque algo. Es la unica forma de que "antes de guardar" sea
 * literal: si apareciera al perder el foco o al enviar, ya se habria enviado.
 *
 * `adversario` es el nombre de la otra pata. Si no hay contraparte, el aviso cambia de texto en
 * vez de decir "la otra pata" de una pata que no existe: en ese caso lo que se reescribe es el
 * grupo, y sigue siendo una sola fila.
 */
function AvisoDeEdicionEnEspejo({ adversario }: { adversario?: string }) {
  return (
    <p className={detalle.avisoAtencion}>
      <strong>Esto mueve las dos patas.</strong>{' '}
      {adversario === undefined ? (
        <>
          Corregir este traspaso reescribe su grupo entero. Quedará con una sola pata, sin
          contraparte: el cambio queda hecho a medias y eso es lo que R1 avisa, no un error.
        </>
      ) : (
        <>
          Al guardar, <strong>{adversario}</strong> se corrige en espejo con el importe opuesto y
          la misma fecha y descripcion. No se puede corregir una pata sin la otra.
        </>
      )}
    </p>
  )
}

/** Los campos que el alta y la edicion comparten, con los valores ya escritos o no. */
function CamposDelTraspaso({
  estado,
  periodo,
  cuentas,
  origen,
  destino,
  valores,
}: {
  estado: ResultadoDeTraspaso
  periodo: string
  /** La misma lista para los dos desplegables: los dos eligen cuentas de esta cartera. */
  cuentas: ReadonlyArray<OpcionVista>
  /** El id de la cuenta ya elegida, como texto. `''` en el alta. */
  origen: string
  /** El id de la contraparte, o `''` para un grupo de una sola pata. */
  destino: string
  valores?: {
    monto: string
    fecha: string
    descripcion: string
    comercio: string | null
  }
}) {
  return (
    <>
      <Campos estado={estado} periodo={periodo} />
      <div className={detalle.grillaDos}>
        <Selector
          opciones={cuentas}
          nombre="origen_cuenta_id"
          etiqueta="Desde"
          seleccionado={origen}
          vacio="Elegi la cuenta de la que sale"
          error={estado.campos?.origen_cuenta_id}
        />
        <Selector
          opciones={cuentas}
          nombre="destino_cuenta_id"
          etiqueta="Hasta"
          seleccionado={destino}
          vacio={SIN_CONTRAPARTE}
          requerido={false}
          error={estado.campos?.destino_cuenta_id}
        />
        <Campo
          nombre="monto"
          etiqueta="Importe"
          ayuda="Siempre en positivo: es la cantidad que viaja, no el signo que queda en cada cuenta."
          error={estado.campos?.monto}
          defaultValue={valores?.monto}
        />
        <Campo
          nombre="fecha"
          etiqueta="Fecha"
          tipo="date"
          ayuda="El dia que el traspaso pertenece a ese mes, no el dia que lo anotas."
          error={estado.campos?.fecha}
          defaultValue={valores?.fecha}
        />
        <Campo
          nombre="descripcion"
          etiqueta="Descripcion"
          ayuda="Opcional. Sale en las dos patas."
          requerido={false}
          defaultValue={valores?.descripcion}
        />
        <Campo
          nombre="comercio"
          etiqueta="Comercio"
          ayuda="Opcional. No hace falta en un traspaso: no hay comercio del otro lado."
          requerido={false}
          defaultValue={valores?.comercio ?? undefined}
        />
      </div>
    </>
  )
}

/**
 * Alta de un traspaso.
 *
 * `estadoInicial` no lo manda nadie en produccion: existe para que una prueba pueda renderizar
 * el aviso ya emitido y comprobar que sale en el HTML, igual que en `transacciones`.
 */
export function FormularioNuevoTraspaso({
  cartera_id,
  cuentas,
  periodo,
  estadoInicial,
}: {
  cartera_id: number
  cuentas: ReadonlyArray<OpcionVista>
  /** El mes que se esta mirando, para el aviso retroactivo. */
  periodo: string
  estadoInicial?: ResultadoDeTraspaso
}) {
  const [estado, enviar] = useActionState(
    (prev: ResultadoDeTraspaso, datos: FormData) =>
      accionRegistrarTraspaso(cartera_id, prev, datos),
    estadoInicial ?? INICIAL,
  )

  return (
    <form action={enviar} className={detalle.formulario}>
      <CamposDelTraspaso
        estado={estado}
        periodo={periodo}
        cuentas={cuentas}
        origen=""
        destino=""
      />
      <p className={detalle.nota}>
        Un traspaso con destino mueve dinero de una cuenta a otra y no toca ningun sobre. Si lo
        deixas sin contraparte, sale una sola pata y la app te avisa.
      </p>
      <div className={detalle.alDerecha}>
        <AccionPendiente>Registrar traspaso</AccionPendiente>
      </div>
    </form>
  )
}

/**
 * Editar una pata, que reescribe el grupo entero.
 *
 * Los dos selectores van con `defaultValue` y no con `value`: son uncontrolled, y con `value`
 * React los volveria de solo lectura y el usuario no podria corregir nada.
 *
 * El destino se precarga con la contraparte real de la fila. Viene del `leftJoin` de la vista
 * y es `null` cuando el grupo tiene una sola pata, que es el unico caso en que el desplegable
 * muestra la opcion vacia.
 */
export function FilaEditarTraspaso({
  cartera_id,
  movimiento,
  cuentas,
  periodo,
}: {
  cartera_id: number
  movimiento: MovimientoEnVista
  cuentas: ReadonlyArray<OpcionVista>
  periodo: string
}) {
  const [estado, enviar] = useActionState(
    (prev: ResultadoDeTraspaso, datos: FormData) =>
      accionEditarTraspaso(cartera_id, movimiento.id, prev, datos),
    INICIAL,
  )

  return (
    <form action={enviar} className={`${detalle.formulario} ${detalle.formularioAnidado}`}>
      <CamposDelTraspaso
        estado={estado}
        periodo={periodo}
        cuentas={cuentas}
        origen={String(movimiento.cuenta_id)}
        destino={
          movimiento.contraparte_cuenta_id === null ? '' : String(movimiento.contraparte_cuenta_id)
        }
        valores={{
          // El campo va en positivo: el usuario escribe cuanto viaja. `absDinero` quita el
          // signo con una operacion de string, no con `Math.abs(Number(...))`, que a esta
          // magnitud pierde centavos.
          monto: paraCampo(absDinero(movimiento.monto)),
          fecha: movimiento.fecha,
          descripcion: movimiento.descripcion,
          comercio: movimiento.comercio,
        }}
      />
      <AvisoDeEdicionEnEspejo adversario={movimiento.contraparte_cuenta_nombre ?? undefined} />
      <div className={detalle.alDerecha}>
        <AccionPendiente>Guardar el traspaso</AccionPendiente>
      </div>
    </form>
  )
}

/**
 * Como el historial distingue un traspaso del resto (R4).
 *
 * No es solo una etiqueta: el signo del importe ya lo delata, asi que lo que hace falta es
 * decir **de donde a donde**. Con contraparte dice "De A a B"; sin ella, "De A, sin contraparte",
 * que es la forma de que se vea que al grupo le falta una pata y no que el dato vino vacio.
 *
 * Devuelve `null` para los movimientos que no son de traspaso, y el que llama lo compose con
 * el nombre de su cuenta.
 */
export function RecorridoDeTraspaso({ movimiento }: { movimiento: MovimientoEnVista }) {
  if (movimiento.tipo !== 'traspaso') return null

  return movimiento.contraparte_cuenta_nombre === null ? (
    <span className={detalle.tenue}>De {movimiento.cuenta_nombre}, sin contraparte</span>
  ) : (
    <span className={detalle.tenue}>
      De {movimiento.cuenta_nombre} a {movimiento.contraparte_cuenta_nombre}
    </span>
  )
}
