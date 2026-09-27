import { redirect } from 'next/navigation'
import { obtenerCliente } from '@/db/cliente'
import { contarCarteras } from '@/repos/carteras'
import { sesionActual } from '@/sesion/server'

export const metadata = { title: 'Panel' }

/**
 * Marcador de posicion del panel. Lo reemplaza `110-panel`.
 *
 * Lo que ya importa aqui es el control de acceso y la eleccion de cartera: sin
 * sesion, a la pantalla de entrada; con mas de una cartera, a la lista, porque el
 * sistema **no sabe cual** mostrar. Elegir por el usuario seria mostrar una cifra
 * de otra cartera.
 */
export default async function PaginaPanel() {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const total = await contarCarteras(obtenerCliente(), sesion.usuario_id)
  if (total > 1) redirect('/carteras')

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Panel</h1>
      <p className="mt-1 text-sm text-slate-500">Sesion de {sesion.nombre_usuario}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          El resumen de la cartera llega con <code>110-panel</code>.
        </p>
      </div>
    </main>
  )
}
