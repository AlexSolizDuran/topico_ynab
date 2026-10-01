'use client'

/**
 * Barra de navegacion de las pantallas con sesion.
 *
 * Vive en el layout de `(app)` y es lo que responde a "adonde vuelvo" y "como
 * salgo". Sin ella, cerrar sesion era imposible: `accionCerrarSesion` existia y
 * ninguna pantalla la llamaba.
 *
 * El cierre va por Server Action y no por un enlace: la sesion vive en una fila de
 * `sesiones` y cerrarla la ELIMINA. Un enlace dejaria la fila y la cookie vivas.
 *
 * No pide la sesion ni lee la base. Cada pagina de `(app)` ya se protege con su
 * propio `sesionActual()`, y repetir la consulta aca seria una segunda vuelta a
 * Postgres en cada render por una barra que no muestra datos del usuario.
 */

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { accionCerrarSesion } from '@/sesion/acciones'

const ENLACES = [
  { href: '/panel', texto: 'Panel' },
  { href: '/carteras', texto: 'Carteras' },
  { href: '/comparativos', texto: 'Comparativos' },
  { href: '/perfil', texto: 'Perfil' },
] as const

/** Estado inicial: sin errores. El logout no necesita mostrar avisos de exito. */
const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function BotonSalir() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm font-medium text-texto-medio transition-colors hover:bg-superficie-tenue disabled:opacity-60"
    >
      {pending ? 'Saliendo...' : 'Salir'}
    </button>
  )
}

export function Navegacion() {
  // El logout va en un form porque es una operacion que cambia estado y por lo tanto
  // pasa por Server Action: la proteccion de token, el DELETE de la fila y la
  // limpieza de cookies ocurren en el servidor, no en el navegador.
  const [estado, accion] = useActionState(accionCerrarSesion, INICIAL)

  return (
    <header className="border-b border-borde bg-superficie">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/panel" className="text-base font-bold tracking-tight text-texto">
          Sobres
        </Link>

        <nav aria-label="Principal" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {ENLACES.map((enlace) => (
            <Link
              key={enlace.href}
              href={enlace.href}
              className="text-sm text-texto-medio transition-colors hover:text-marca"
            >
              {enlace.texto}
            </Link>
          ))}
        </nav>

        <form action={accion} className="ml-auto">
          <BotonSalir />
        </form>
      </div>

      {/*
        Un logout fallido se queda en la misma pantalla, asi que el error tiene que
        verse aca: sin esto el boton parece no hacer nada y el usuario cree que salio
        cuando la sesion sigue viva.
      */}
      {estado.error ? (
        <p role="alert" className="mx-auto max-w-5xl px-4 pb-3 text-sm text-negativo">
          {estado.error}
        </p>
      ) : null}
    </header>
  )
}