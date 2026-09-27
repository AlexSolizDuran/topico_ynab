import { redirect } from 'next/navigation'
import { FormularioCambiarContrasena } from '@/components/formularios-sesion'
import { PantallaSesion } from '@/components/sesion'
import { sesionActual } from '@/sesion/server'

export const metadata = { title: 'Cambiar contrasena' }

export default async function PaginaContrasena() {
  const sesion = await sesionActual()

  // Sin sesion no hay nada que cambiar, y tampoco hay token de proteccion con el
  // que validar el formulario: redirigir es mejor que un error.
  if (!sesion) redirect('/entrar')

  return (
    <PantallaSesion
      titulo="Cambia tu contrasena"
      subtitulo={`Sesion de ${sesion.nombre_usuario}`}
      pie="Al cambiarla, se cierran tus otras sesiones abiertas."
    >
      <FormularioCambiarContrasena />
    </PantallaSesion>
  )
}
