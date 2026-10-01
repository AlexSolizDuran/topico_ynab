import { redirect } from 'next/navigation'
import { FormularioCambiarContrasena, FormularioDatosPerfil } from '@/components/formularios-sesion'
import { sesionActual } from '@/sesion/server'
import { obtenerCliente } from '@/db/cliente'
import { buscarPorId } from '@/repos/usuarios'

export const metadata = { title: 'Perfil' }

/**
 * Perfil del usuario: sus datos y su contrasena, en una sola pantalla.
 *
 * El cambio de contrasena vivia en `/contrasena`, dentro del grupo `(sesion)`, que
 * es el grupo de las pantallas sin sesion: se veian sin la barra de navegacion, y
 * desde ahi no se llegaba a ningun lado. Ahora conviven los dos formularios, que es
 * lo que el usuario espera de una pantalla de perfil.
 */
export default async function PaginaPerfil() {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const db = obtenerCliente()

  // Se relee el usuario y no se usan los datos de la sesion: la sesion trae el
  // `nombre_usuario` con el que se entro, no el resto del perfil, que pudo cambiar
  // desde la ultima vez que se abrio esta pantalla.
  const usuario = await buscarPorId(db, sesion.usuario_id)
  if (!usuario) redirect('/entrar')

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tu perfil</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sesion de {usuario.nombre_usuario}. Tu nombre de usuario y tu zona horaria no se
          pueden cambiar.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold text-slate-900">Tus datos</h2>
        <FormularioDatosPerfil
          nombre={usuario.nombre}
          apellido={usuario.apellido}
          correo={usuario.correo}
          nombre_usuario={usuario.nombre_usuario}
          zona_horaria={usuario.zona_horaria}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Tu contrasena</h2>
        <p className="mb-5 text-sm text-slate-500">
          Al cambiarla se cierran tus otras sesiones abiertas.
        </p>
        <FormularioCambiarContrasena />
      </section>
    </main>
  )
}
