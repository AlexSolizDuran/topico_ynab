import { redirect } from 'next/navigation'
import { obtenerCliente } from '@/db/cliente'
import { listarCarteras } from '@/repos/carteras'
import { consultarComparativo } from '@/repos/comparativos'
import { sesionActual } from '@/sesion/server'
import { VistaComparativos } from '@/components/comparativos'
import producto from '@/components/producto.module.css'
import tema from '@/components/tema-oscuro.module.css'

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
	searchParams?: Promise<{ cartera?: string; mes?: string; referencia?: string; recalculado?: string }>
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
		<main className={`${producto.pantalla} ${tema.oscuro}`}>
			<div className={tema.rejilla} aria-hidden="true" />
        <div className={tema.aurora} aria-hidden="true" />
        <div className={tema.grano} aria-hidden="true" />

			<div className={producto.contenido}>
				{/*
					R3 pide que el sistema avise que la comparacion cambio. El aviso va **aca** y
					no en la pantalla de edicion, porque la pagina que cambia es esta: los totales
					que se movieron son los que se estan mirando.

					Llega por la URL y no por un estado guardado: `recalculado=1` lo pone el enlace
					"Ver la comparacion recalculada" que aparece junto al aviso retroactivo de R7,
					despues de una alta, una edicion o un borrado. No hay tabla nueva ni historial:
					el aviso describe el acto recien hecho, no un estado permanente. Y cambiar el
					periodo o la cartera descarta la bandera por el solo hecho de reconstruir el
					query string, que es lo correcto — es otra comparacion, con otros numeros.
				*/}
				<VistaComparativos
					datos={datos}
					carterasDisponibles={activas.map(({ id, nombre, moneda }) => ({ id, nombre, moneda }))}
					avisoRecalculo={params.recalculado === '1'}
				/>
			</div>
		</main>
	)
}
