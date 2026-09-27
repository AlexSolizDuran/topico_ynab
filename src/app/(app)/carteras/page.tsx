import { obtenerCliente } from '@/db/cliente'
import {
  contarCarteras,
  listarCarterasActivas,
  listarCarterasArchivadas,
} from '@/repos/carteras'
import { sesionActual } from '@/sesion/server'
import { redirect } from 'next/navigation'
import {
  FilaCarteraActiva,
  FilaCarteraArchivada,
  FormularioNuevaCartera,
} from '@/components/carteras'

export const metadata = { title: 'Carteras' }

/**
 * Lista de carteras: la primera pantalla despues de entrar.
 *
 * Lo que esta vista NO hace es sumar. El sistema no tiene tipo de cambio, asi que
 * dos carteras en monedas distintas no producen un total: cada una se presenta
 * sola, con su moneda a la vista. Mostrar un total combinado seria inventar un
 * numero que el sistema no sabe calcular, y `carteras` R2 lo prohibe.
 *
 * El selector de cartera persistente llega con `110-panel`; aca cada cartera es una
 * fila con su boton de entrada.
 */
export default async function PaginaCarteras() {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const db = obtenerCliente()
  const [activas, archivadas, total] = await Promise.all([
    listarCarterasActivas(db, sesion.usuario_id),
    listarCarterasArchivadas(db, sesion.usuario_id),
    contarCarteras(db, sesion.usuario_id),
  ])

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Carteras</h1>
      <p className="mt-1 text-sm text-slate-500">
        {total === 1
          ? 'Tienes 1 cartera. Cada cartera tiene su propia moneda y no se suman entre si.'
          : `Tienes ${total} carteras. Cada una tiene su moneda y no se suman entre si.`}
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {activas.map((cartera) => (
          <FilaCarteraActiva
            key={cartera.id}
            cartera_id={cartera.id}
            nombre={cartera.nombre}
            moneda={cartera.moneda}
          />
        ))}
      </ul>

      {archivadas.length > 0 ? (
        <>
          <h2 className="mt-10 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Archivadas
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {archivadas.map((cartera) => (
              <FilaCarteraArchivada
                key={cartera.id}
                cartera_id={cartera.id}
                nombre={cartera.nombre}
                moneda={cartera.moneda}
              />
            ))}
          </ul>
        </>
      ) : null}

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nueva cartera</h2>
        <p className="mt-1 mb-5 text-sm text-slate-500">
          La moneda se elige una vez, al crear la cartera, y despues ya no se cambia.
        </p>
        <FormularioNuevaCartera />
      </section>
    </main>
  )
}
