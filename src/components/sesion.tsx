/**
 * Piezas de interfaz compartidas por las pantallas de sesion.
 *
 * Sin dependencias de cliente: son server components. La unica parte que
 * necesita interactividad es el `useActionState` de cada formulario, y vive en
 * `FormularioSesion`.
 *
 * `Selector` y `Campo` estan aca y no en cada componente de capacidad porque los dos son
 * primitivas de formulario, no de una capacidad: los usan `transacciones` y `traspasos`
 * igual, y duplicar un desplegable de cincuenta lineas en dos archivos es una copia que
 * hay que recordar actualizar en los dos lados. El `import type` de cada componente
 * tambien es lo que evita que esto arrastre el cliente a un server component.
 */

import type { HTMLInputTypeAttribute, ReactNode } from 'react'
import Link from 'next/link'
import sesion from '../app/(sesion)/sesion.module.css'
import tema from './tema-oscuro.module.css'
import { BotonTema } from './boton-tema'

/**
 * El sobre de la marca, dibujado igual que el de la portada.
 *
 * Va aca y no se importa de la portada porque `page.tsx` es una pagina: importarla traeria
 * el modulo entero y ademas su `metadata` al arbol de las pantallas de sesion. Un icono de
 * seis lineas no justifica eso.
 */
function IconoSobre({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20v2.2H2z" />
      <path d="M4.4 6.6 12 12.4l7.6-5.8 1.5 1.9L12 15.2 2.9 8.5z" />
    </svg>
  )
}

/** Aviso general, arriba del formulario. */
export function Aviso({
  tono,
  children,
}: {
  tono: 'error' | 'exito'
  children: ReactNode
}) {
  const estilos =
    tono === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <p
      role={tono === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm ${estilos}`}
    >
      {children}
    </p>
  )
}

/**
 * Campo de formulario con etiqueta, ayuda y error.
 *
 * La etiqueta esta siempre visible y el error va associado por `aria-describedby`
 * y `aria-invalid`: el error no puede quedar solo en rojo, porque el color no
 * llega a quien no distingue rojo y verde, y porque un lector de pantalla no lo
 * leeria.
 */
export function Campo({
  nombre,
  etiqueta,
  tipo = 'text',
  autoComplete,
  requerido = true,
  ayuda,
  error,
  minLength,
  autoFocus,
  defaultValue,
}: {
  nombre: string
  etiqueta: string
  /**
   * El `type` del `<input>`, el de HTML y no una union propia.
   *
   * `transacciones` necesita `date` —la fecha de un movimiento es un dia local, y por eso
   * se pide con `<input type="date">` y no con un `text` que hay que interpretar—. Enumerar
   * los tipos aca seria una lista que queda corta en el proximo formulario y que obliga a
   * tocar este archivo compartido cada vez. Los tipos que existian antes siguen valiendo.
   */
  tipo?: HTMLInputTypeAttribute
  autoComplete?: string
  requerido?: boolean
  ayuda?: string
  error?: string
  minLength?: number
  autoFocus?: boolean
  /**
   * El valor con el que el campo arranca escrito.
   *
   * Va como `defaultValue` y no como `value`: un `value` sin `onChange` vuelve el campo de
   * solo lectura en React, y un formulario de correccion que no se puede corregir no
   * corrige nada. Es lo que necesita el formulario de edicion de `transacciones`.
   */
  defaultValue?: string
}) {
  const idAyuda = ayuda ? `${nombre}-ayuda` : undefined
  const idError = error ? `${nombre}-error` : undefined
  const descritoPor = [idAyuda, idError].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nombre} className="text-sm font-medium text-slate-700">
        {etiqueta}
      </label>

      <input
        id={nombre}
        name={nombre}
        type={tipo}
        defaultValue={defaultValue}
        required={requerido}
        autoComplete={autoComplete}
        minLength={minLength}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={descritoPor}
        className={`rounded-xl border bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none transition focus:ring-2 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
        }`}
      />

      {ayuda ? (
        <p id={idAyuda} className="text-xs text-slate-500">
          {ayuda}
        </p>
      ) : null}

      {error ? (
        <p id={idError} className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Boton principal. */
export function Boton({
  children,
  pendiente = false,
}: {
  children: ReactNode
  pendiente?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={pendiente}
      aria-busy={pendiente}
      className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pendiente ? 'Un momento...' : children}
    </button>
  )
}

/**
 * Una opcion de un desplegable de la vista.
 *
 * Es `{ id, nombre }` y no la fila de la base: la vista no necesita el saldo de una cuenta
 * para ponerla en un `<option>`, y mandar la fila entera hacia el cliente seria mandar de mas
 * lo que el desplegable no muestra.
 */
export interface OpcionVista {
  id: number
  nombre: string
}

/**
 * Desplegable de opciones.
 *
 * Es uncontrolled a proposito: `defaultValue`, no `value`. Con `value` React lo trataria
 * como de solo lectura y el usuario no podria cambiar la cuenta en un formulario que ya
 * salio con un error.
 */
export function Selector({
  opciones,
  nombre,
  etiqueta,
  seleccionado,
  vacio,
  error,
  requerido = true,
}: {
  opciones: ReadonlyArray<OpcionVista>
  nombre: string
  etiqueta: string
  seleccionado?: string
  /** La opcion vacia. Sin ella el selector no puede quedar sin valor. */
  vacio?: string
  error?: string
  requerido?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      <select
        name={nombre}
        defaultValue={seleccionado ?? ''}
        required={requerido}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      >
        {vacio !== undefined ? <option value="">{vacio}</option> : null}
        {opciones.map((opcion) => (
          <option key={opcion.id} value={opcion.id}>
            {opcion.nombre}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  )
}

/**
 * El aviso retroactivo de R7.
 *
 * Sale cuando el periodo de la fecha de la operacion es **anterior** al que se esta
 * mirando. La comparacion es entre strings `AAAA-MM`, que en ese formato ordenan igual que
 * las fechas: no hace falta parsear, y `periodo` no es un numero.
 *
 * La comparacion es `<` y no `!==`: una operacion del mes actual, o de uno posterior —que el
 * usuario puede registrar, porque los meses futuros no son una operacion que R1 prohiba
 * aca— no recalcula un derivado anterior, asi que no hay nada que avisar. Solo el `<` avisa.
 *
 * Vive aca y no en `transacciones.tsx` porque lo usan `transacciones` y `traspasos` igual. Si
 * se quedara en el primero, `traspasos` lo importaria de un modulo que a su vez importa el
 * formulario de edicion de este, y ese ciclo entre dos client components es de los que
 * funcionan por casualidad. El texto dice "la operacion" y no "el movimiento" por lo mismo:
 * un traspaso tambien puede caer en un mes anterior.
 */
export function AvisoRetroactivo({
  periodoAfectado,
  periodoActual,
}: {
  periodoAfectado?: string
  periodoActual: string
}) {
  if (!periodoAfectado || periodoAfectado >= periodoActual) return null

  return (
    <Aviso tono="exito">
      La operación entró en {periodoAfectado}. Ese mes y los siguientes cambian sus
      derivados: el disponible del sobre y el dinero suelto ya están recalculados para{' '}
      {periodoAfectado}, y para los meses posteriores también.
    </Aviso>
  )
}

/*
 * Marco centrado de las pantallas de sesion.
 *
 * Se compone de DOS modulos a proposito:
 *
 *  - `(sesion)/sesion.module.css` aporta lo propio de estas dos pantallas: auroras, grano,
 *    tarjeta y pie. Se importa aca y no en las paginas porque ambas comparten este marco.
 *  - `tema-oscuro.module.css` aporta la paleta y el formato de `Campo`, `Boton` y `Aviso`.
 *    Va en la clase `oscuro`, no en una version oscura de esas primitivas: las pantallas de
 *    producto las usan y siguen claras, y dos copias del mismo campo se desincronizan en el
 *    primer cambio.
 *
 * Se mantiene `main` con el `aria-label`: es la unica region de la pagina, asi que asi se
 * anuncia en un lector de pantalla.
 */
export function PantallaSesion({
  titulo,
  subtitulo,
  children,
  pie,
}: {
  titulo: string
  subtitulo?: string
  children: ReactNode
  pie?: ReactNode
}) {
  return (
    <main aria-label={titulo} className={`${sesion.pantalla} ${tema.oscuro}`}>
      <div aria-hidden="true" className={sesion.aurora}>
        <span />
      </div>
      <div aria-hidden="true" className={tema.rejilla} />
      <div aria-hidden="true" className={tema.grano} />

      <div className={sesion.temaEsquina}>
        <BotonTema />
      </div>

      {/*
       * La tarjeta y el pie van dentro de una columna. `.pantalla` es un flex con
       * `justify-content: center`, asi que como hermanos el pie se alineaba AL LADO de la
       * caja en vez de debajo. Este wrapper es lo que los apila.
       */}
      <div className={sesion.columna}>
        <div className={sesion.tarjeta}>
          <div className={sesion.encabezado}>
            <Link href="/" className={sesion.marca}>
              <span className={sesion.marcaIcono}>
                <IconoSobre className="h-4.5 w-4.5" />
              </span>
              Sobres
            </Link>

            <h1 className={sesion.titular}>{titulo}</h1>
            {subtitulo ? <p className={sesion.subtitulo}>{subtitulo}</p> : null}
          </div>

          <div className="flex flex-col gap-5">{children}</div>
        </div>

        {pie ? <p className={sesion.pie}>{pie}</p> : null}
      </div>
    </main>
  )
}
