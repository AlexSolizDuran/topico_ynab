import { redirect } from 'next/navigation'
import { obtenerCliente } from '@/db/cliente'
import { listarCarteras } from '@/repos/carteras'
import { consultarComparativo } from '@/repos/comparativos'
import { sesionActual } from '@/sesion/server'
import { VistaComparativos } from '@/components/comparativos'

export const metadata = { title: 'Comparativos' }

function periodoActual(): string {
	const hoy = new Date()
	return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

function periodoAnterior(periodo: string): string {
	const fecha = new Date(`${periodo}-01T00:00:00`)
	if (Number.isNaN(fecha.getTime())) return periodoActual()
	fecha.setMonth(fecha.getMonth() - 1)
	return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

export default async function PaginaComparativos({
	searchParams,
}: {
	searchParams?: Promise<{ cartera?: string; mes?: string; referencia?: string }>
}) {
	const sesion = await sesionActual()
	if (!sesion) redirect('/entrar')

	const db = obtenerCliente()
	const activas = (await listarCarteras(db, sesion.usuario_id)).filter((cartera) => !cartera.archivada)
	if (activas.length === 0) redirect('/carteras')

	const params = searchParams ? await searchParams : {}
	const carteraId = params.cartera ? Number(params.cartera) : null
	const cartera = activas.find((item) => item.id === carteraId) ?? activas[0]!
	const mes = params.mes ?? periodoActual()
	const periodos = [periodoAnterior(mes), mes]
	const referencia = params.referencia && periodos.includes(params.referencia) ? params.referencia : mes
	const datos = await consultarComparativo(
		db,
		sesion.usuario_id,
		cartera.id,
		periodos,
		referencia,
	)

	return (
		<main className="mx-auto max-w-6xl px-4 py-8">
			<VistaComparativos
				datos={datos}
				carterasDisponibles={activas.map(({ id, nombre, moneda }) => ({ id, nombre, moneda }))}
			/>
		</main>
	)
}
