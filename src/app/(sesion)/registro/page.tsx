import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FormularioRegistro } from '@/components/formularios-sesion'
import { PantallaSesion } from '@/components/sesion'
import { sesionActual } from '@/sesion/server'
import estilos from '../sesion.module.css'

export const metadata = { title: 'Registrarse' }

export default async function PaginaRegistro() {
  if (await sesionActual()) redirect('/panel')

  return (
    <PantallaSesion
      titulo="Crea tu cuenta"
      subtitulo="Empiezas con una cartera en pesos mexicanos."
      pie={
        <>
          Ya tienes cuenta?{' '}
          <Link href="/entrar" className={estilos.pieEnlace}>
            Entra
          </Link>
        </>
      }
    >
      <FormularioRegistro />
    </PantallaSesion>
  )
}
