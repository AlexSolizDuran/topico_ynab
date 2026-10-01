import { redirect } from 'next/navigation'
import { obtenerCliente } from '@/db/cliente'
import { listarCarteras } from '@/repos/carteras'
import { consultarResumenGlobal } from '@/repos/resumen-global'
import { sesionActual } from '@/sesion/server'
import { VistaResumen } from '@/components/resumen'
import producto from '@/components/producto.module.css'
import tema from '@/components/tema-oscuro.module.css'

export const metadata = { title: 'Resumen' }

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Resumen global: el unico panel que mira TODAS las carteras a la vez.
 *
 * No suma monedas distintas. `consultarResumenGlobal` devuelve un grupo por moneda y el
 * componente dibuja uno a la vez; el capital total que ve el usuario es el de una moneda,
 * nunca una mezcla. Ver `panel` R11.
 *
 * Sin carteras no hay nada que resumir: redirige a `/carteras`, que es donde se crea la
 * primera.
 */
export default async function PaginaResumen({
  searchParams,
}: {
  searchParams?: Promise<{ mes?: string }>
}) {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const db = obtenerCliente()
  const carteras = await listarCarteras(db, sesion.usuario_id)
  if (carteras.length === 0) redirect('/carteras')

  const params = searchParams ? await searchParams : {}
  const periodo = params.mes || periodoActual()
  const datos = await consultarResumenGlobal(db, sesion.usuario_id, periodo)

  return (
    <main className={`${producto.pantalla} ${tema.oscuro}`}>
      <div className={tema.rejilla} aria-hidden="true" />
      <div className={tema.aurora} aria-hidden="true" />
      <div className={tema.grano} aria-hidden="true" />

      <div className={producto.contenido}>
        <VistaResumen datos={datos} />
      </div>
    </main>
  )
}
