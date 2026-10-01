import { redirect } from 'next/navigation'
import { FormularioCambiarContrasena, FormularioDatosPerfil } from '@/components/formularios-sesion'
import { sesionActual } from '@/sesion/server'
import { obtenerCliente } from '@/db/cliente'
import { buscarPorId } from '@/repos/usuarios'
import producto from '@/components/producto.module.css'
import tema from '@/components/tema-oscuro.module.css'

export const metadata = { title: 'Perfil' }

/**
 * Perfil del usuario: sus datos y su contrasena, en una sola pantalla.
 *
 * El cambio de contrasena vivia en `/contrasena`, dentro del grupo `(sesion)`, que
 * es el grupo de las pantallas sin sesion: se veian sin la barra de navegacion, y
 * desde ahi no se llegaba a ningun lado. Ahora conviven los dos formularios, que es
 * lo que el usuario espera de una pantalla de perfil.
 *
 * Se compone de dos modulos: `producto.module.css` da el contenedor y las tarjetas, y
 * `tema-oscuro.module.css` la paleta y las primitivas. Los formularios de adentro son
 * `Campo`, `Boton` y `Aviso` compartidos, que el tema repinta por descendencia: no hay una
 * version oscura de `formularios-sesion.tsx`.
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
    <main className={`${producto.pantalla} ${tema.oscuro}`}>
      <div className={tema.rejilla} aria-hidden="true" />
        <div className={tema.aurora} aria-hidden="true" />
        <div className={tema.grano} aria-hidden="true" />

      <div className={`${producto.contenido} ${producto.contenidoEstrecho}`}>
        <header className={producto.encabezado}>
          <h1 className={producto.titulo}>Tu perfil</h1>
          <p className={producto.bajada}>
            Sesion de {usuario.nombre_usuario}. Tu nombre de usuario y tu zona horaria no se
            pueden cambiar.
          </p>
        </header>

        <section className={producto.tarjeta}>
          <h2 className={producto.seccionTitulo}>Tus datos</h2>
          <hr className={producto.division} />
          <FormularioDatosPerfil
            nombre={usuario.nombre}
            apellido={usuario.apellido}
            correo={usuario.correo}
            nombre_usuario={usuario.nombre_usuario}
            zona_horaria={usuario.zona_horaria}
          />
        </section>

        <section className={producto.tarjeta}>
          <h2 className={producto.seccionTitulo}>Tu contrasena</h2>
          <p className={producto.seccionBajada}>
            Al cambiarla se cierran tus otras sesiones abiertas.
          </p>
          <FormularioCambiarContrasena />
        </section>
      </div>
    </main>
  )
}
