/**
 * Piezas de interfaz compartidas por las pantallas de sesion.
 *
 * Sin dependencias de cliente: son server components. La unica parte que
 * necesita interactividad es el `useActionState` de cada formulario, y vive en
 * `FormularioSesion`.
 */

import type { ReactNode } from 'react'

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
}: {
  nombre: string
  etiqueta: string
  tipo?: 'text' | 'email' | 'password'
  autoComplete?: string
  requerido?: boolean
  ayuda?: string
  error?: string
  minLength?: number
  autoFocus?: boolean
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

/** Marco centrado de las pantallas de sesion. */
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-bold tracking-tight text-blue-600">Sobres</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{titulo}</h1>
          {subtitulo ? <p className="mt-1 text-sm text-slate-500">{subtitulo}</p> : null}
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>

        {pie ? <div className="mt-6 text-center text-sm text-slate-500">{pie}</div> : null}
      </div>
    </main>
  )
}
