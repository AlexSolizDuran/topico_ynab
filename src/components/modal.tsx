'use client'

/**
 * El modal: la pantalla donde se crea y se edita.
 *
 * La pagina de una cartera es de **lectura**. Los listados se despliegan en la pagina con
 * `<details>` —el pliegue de un grupo, los sobres archivados— y todo lo que escribe, que es
 * un formulario, vive aca. La division no es estetica: un formulario embebido en la fila
 * empuja el nombre y el disponible hacia abajo y convierte cada sobre en un panel de
 * botones.
 *
 * Se arma sobre el `<dialog>` nativo y no sobre un `<div role="dialog">` porque el navegador
 * da la capa superior, el fondo atenuado, la trampa de foco y la salida con Escape sin una
 * linea de estado de apertura. El estado que si hay —que accion esta elegida— es de la
 * seleccion *dentro* del modal, no de si esta abierto.
 *
 * **El contenido se monta siempre, nunca con `{elegida && ...}`.** Tres razones:
 *
 *  1. Un `<dialog>` cerrado sigue en el DOM, asi que el HTML del servidor sale completo y las
 *     pruebas de pagina —que renderizan la pagina entera y assertan sobre sus etiquetas— no
 *     dependen de que un modal este abierto.
 *  2. El error de una validacion aparece en el panel que ya estaba montado, con el borrador
 *     del usuario intacto. Montar el formulario al elegir la accion lo perderia en cada
 *     intento fallido.
 *  3. El cierre con Escape, el click en el fondo y el boton de cerrar devuelven el modal a
 *     su estado de partida sin que haya que coordinates el desenlace a mano.
 *
 * El precio es que el DOM lleva todos los formularios de la pagina siempre. Ese precio ya se
 * pagaba antes de esto: estaban dentro de `<details>`, que tampoco se desmonta. Lo que cambia
 * es quien los muestra, no cuantos viajan.
 */

import { useRef, useState, type ReactNode } from 'react'
import detalle from './detalle.module.css'

/** Los tres puntos del disparador de acciones de una fila. */
function Puntos() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </svg>
  )
}

export function Modal({
  titulo,
  disparador,
  claseDisparador = detalle.punto,
  ancho = false,
  onClose,
  children,
}: {
  /** Lo que anuncia el dialog. Va en `aria-label` y en el encabezado visible. */
  titulo: string
  /** Lo que muestra el boton que abre el modal. Por defecto, los tres puntos. */
  disparador?: ReactNode
  /** Como se ve ese boton: `detalle.punto` para el "⋯", `detalle.enlaceAccion` para "+ Nueva…". */
  claseDisparador?: string
  /** Para los formularios largos: el de un sobre trae el historial de asignaciones. */
  ancho?: boolean
  /** Corre al cerrarse, para devolver el modal a su estado de partida. */
  onClose?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className={claseDisparador}
        aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}
      >
        {disparador ?? <Puntos />}
      </button>

      <dialog
        ref={ref}
        className={ancho ? `${detalle.modal} ${detalle.modalAncho}` : detalle.modal}
        aria-label={titulo}
        onClose={onClose}
      >
        <div className={detalle.modalCuerpo}>
          <div className={detalle.modalEncabezado}>
            <h2 className={detalle.modalTitulo}>{titulo}</h2>
            {/*
              `method="dialog"` cierra sin pasar por el servidor: cerrar no es una mutacion.
              Un `formAction` de verdad habria que distinguirla accion por accion.
            */}
            <form method="dialog">
              <button type="submit" className={detalle.enlaceSuave}>
                Cerrar
              </button>
            </form>
          </div>

          {children}
        </div>
      </dialog>
    </>
  )
}

/**
 * El modal de las acciones de una fila: primero pregunta cual, despues la muestra.
 *
 * Todos los paneles estan montados y lo unico que cambia es su atributo `hidden`. Por eso
 * aca no hay ningun `{elegida && ...}`: ver el comentario del `Modal` de arriba.
 *
 * El estado se reinicia en `onClose` y no al abrir. Si se reiniciara al abrir habria un
 * instante con el modal ya visible y todavia la eleccion anterior; con `onClose`, Escape, el
 * fondo y el boton de cerrar hacen los tres lo mismo.
 */
export function MenuDeFila({
  titulo,
  acciones,
}: {
  titulo: string
  acciones: { etiqueta: string; peligro?: boolean; contenido: ReactNode }[]
}) {
  const [elegida, setElegida] = useState<string | null>(null)

  return (
    <Modal titulo={titulo} ancho onClose={() => setElegida(null)}>
      <ul className={detalle.menu} hidden={elegida !== null}>
        {acciones.map((accion) => (
          <li key={accion.etiqueta}>
            <button
              type="button"
              className={`${detalle.menuItem} ${accion.peligro ? detalle.menuPeligro : ''}`}
              onClick={() => setElegida(accion.etiqueta)}
            >
              {accion.etiqueta}
            </button>
          </li>
        ))}
      </ul>

      {elegida === null ? null : (
        <button type="button" className={detalle.enlaceSuave} onClick={() => setElegida(null)}>
          Volver a las acciones
        </button>
      )}

      {acciones.map((accion) => (
        <div key={accion.etiqueta} hidden={elegida !== accion.etiqueta}>
          {accion.contenido}
        </div>
      ))}
    </Modal>
  )
}

/**
 * El paso previo a archivar o a borrar.
 *
 * No dice "¿estas seguro?": dice **que pasa con los datos**. Un "¿seguro?" no le dice al
 * usuario si el movimiento cae con su pata de traspaso, si el sobre deja de admitir
 * asignaciones, o si el grupo conserva sus sobres. Esa consecuencia es lo que hace que la
 * confirmacion valga algo.
 *
 * Va antes del formulario y no alrededor: el `useActionState` del formulario ya sabe si
 * fallo, y el error aparece en el formulario, que es donde estan los campos marcados.
 */
export function Confirmar({
  titulo,
  children,
  childrenAcciones,
}: {
  titulo: string
  children: ReactNode
  /** El boton de confirmar y el de cancelar, con sus clases. */
  childrenAcciones: ReactNode
}) {
  return (
    <div className={detalle.confirmacion}>
      <h3 className={detalle.confirmacionTitulo}>{titulo}</h3>
      <div className={detalle.confirmacionTexto}>{children}</div>
      <div className={detalle.confirmacionAcciones}>{childrenAcciones}</div>
    </div>
  )
}