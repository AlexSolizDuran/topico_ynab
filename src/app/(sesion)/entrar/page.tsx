import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FormularioEntrar } from '@/components/formularios-sesion'
import { PantallaSesion } from '@/components/sesion'
import { sesionActual } from '@/sesion/server'

export const metadata = { title: 'Entrar' }

export default async function PaginaEntrar() {
  // Quien ya tiene sesion no ve el formulario: lo manda al panel. Sin esto, un
  // usuario autenticado podria ver la pantalla de entrada y pensar que salio.
  if (await sesionActual()) redirect('/panel')

  return (
    <PantallaSesion
      titulo="Entra a tu cuenta"
      pie={
        <>
          No tienes cuenta?{' '}
          <Link href="/registro" className="font-semibold text-blue-600 hover:underline">
            Registrate
          </Link>
        </>
      }
    >
      <FormularioEntrar />
    </PantallaSesion>
  )
}
