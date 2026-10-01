import { obtenerCliente } from '@/db/cliente'
import {
  contarCarteras,
  listarCarterasActivas,
  listarCarterasArchivadas,
} from '@/repos/carteras'
import { sesionActual } from '@/sesion/server'
import { redirect } from 'next/navigation'
import {
  FilaCarteraActiva,
  FilaCarteraArchivada,
  FormularioNuevaCartera,
} from '@/components/carteras'
import estilos from '@/components/carteras.module.css'
import tema from '@/components/tema-oscuro.module.css'

export const metadata = { title: 'Carteras' }

/**
 * Lista de carteras: la primera pantalla despues de entrar.
 *
 * Lo que esta vista NO hace es sumar. El sistema no tiene tipo de cambio, asi que dos carteras
 * en monedas distintas no producen un total: cada una se presenta sola, con su moneda a la
 * vista. Mostrar un total combinado seria inventar un numero que el sistema no sabe calcular, y
 * `carteras` R2 lo prohibe. Por eso el encabezado dice cuantas hay, pero no cuanto dinero hay.
 *
 * El selector de cartera persistente llega con `110-panel`; aca cada cartera es una fila con su
 * boton de entrada.
 *
 * La clase `oscuro` es la que activa `tema-oscuro.module.css`: tokens, fondo del shell, barra de
 * navegacion y primitivas de formulario. Es la misma clase que usan la portada, las pantallas
 * de sesion y el panel.
 */
export default async function PaginaCarteras() {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const db = obtenerCliente()
  const [activas, archivadas, total] = await Promise.all([
    listarCarterasActivas(db, sesion.usuario_id),
    listarCarterasArchivadas(db, sesion.usuario_id),
    contarCarteras(db, sesion.usuario_id),
  ])

  return (
    <main className={`${estilos.carteras} ${tema.oscuro}`}>
      <div className={tema.rejilla} aria-hidden="true" />
        <div className={tema.aurora} aria-hidden="true" />
        <div className={tema.grano} aria-hidden="true" />

      <div className={estilos.contenido}>
        <h1 className={estilos.titulo}>Carteras</h1>
        <p className={estilos.bajada}>
          {total === 1
            ? 'Tienes 1 cartera. Cada cartera tiene su propia moneda y no se suman entre si.'
            : `Tienes ${total} carteras. Cada una tiene su moneda y no se suman entre si.`}
        </p>

        {/*
         * Con cero carteras no hay lista que mostrar y la bajada ya dice "Tienes 0". Se deja
         * el hueco: agregar un `if` para esto solo agrega una rama que el texto de arriba ya
         * resuelve.
         */}
        <ul className={estilos.lista}>
          {activas.map((cartera) => (
            <FilaCarteraActiva
              key={cartera.id}
              cartera_id={cartera.id}
              nombre={cartera.nombre}
              moneda={cartera.moneda}
            />
          ))}
        </ul>

        {archivadas.length > 0 ? (
          <section className={estilos.seccion}>
            <h2 className={estilos.tituloSeccion}>Archivadas</h2>
            <ul className={estilos.lista}>
              {archivadas.map((cartera) => (
                <FilaCarteraArchivada
                  key={cartera.id}
                  cartera_id={cartera.id}
                  nombre={cartera.nombre}
                  moneda={cartera.moneda}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section className={estilos.seccion}>
          <div className={estilos.nueva}>
            <h2 className={estilos.nuevaTitulo}>Nueva cartera</h2>
            <p className={estilos.nuevaBajada}>
              La moneda se elige una vez, al crear la cartera, y despues ya no se cambia.
            </p>
            <FormularioNuevaCartera />
          </div>
        </section>
      </div>
    </main>
  )
}
