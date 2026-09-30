import { redirect } from 'next/navigation'
import { obtenerCliente } from '@/db/cliente'
import { listarCarteras } from '@/repos/carteras'
import { sesionActual } from '@/sesion/server'
import { consultarDatosPanel } from '@/repos/panel'
import { PanelResumen } from '@/components/panel'

export const metadata = { title: 'Panel' }

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

export default async function PaginaPanel({
  searchParams,
}: {
  searchParams?: Promise<{ cartera?: string; mes?: string }>
}) {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const db = obtenerCliente()
  const todas = await listarCarteras(db, sesion.usuario_id)
  const activas = todas.filter((c) => !c.archivada)

  if (activas.length === 0) {
    redirect('/carteras')
  }

  const params = searchParams ? await searchParams : {}
  const carteraIdSolicitada = params.cartera ? Number(params.cartera) : null

  let carteraSeleccionada = activas[0]!
  if (carteraIdSolicitada) {
    const encontrada = activas.find((c) => c.id === carteraIdSolicitada)
    if (encontrada) {
      carteraSeleccionada = encontrada
    }
  }

  const periodo = params.mes || periodoActual()
  const datos = await consultarDatosPanel(db, sesion.usuario_id, carteraSeleccionada.id, periodo)

  const opcionesCarteras = activas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    moneda: c.moneda,
  }))

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PanelResumen
        datos={datos}
        carterasDisponibles={opcionesCarteras}
      />
    </main>
  )
}
