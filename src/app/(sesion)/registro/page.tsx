import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FormularioRegistro } from '@/components/formularios-sesion'
import { PantallaSesion } from '@/components/sesion'
import { emitirTokenDeFormulario } from '@/sesion/formulario'
import { sesionActual } from '@/sesion/server'

export const metadata = { title: 'Registrarse' }

export default async function PaginaRegistro() {
  if (await sesionActual()) redirect('/panel')

  await emitirTokenDeFormulario()

  return (
    <PantallaSesion
      titulo="Crea tu cuenta"
      subtitulo="Empiezas con una cartera en pesos mexicanos."
      pie={
        <>
          Ya tienes cuenta?{' '}
          <Link href="/entrar" className="font-semibold text-blue-600 hover:underline">
            Entra
          </Link>
        </>
      }
    >
      <FormularioRegistro />
    </PantallaSesion>
  )
}
