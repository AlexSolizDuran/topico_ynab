'use client'

/**
 * Componentes de grupos.
 *
 * Un grupo no tiene saldo: por eso no hay ningun `formatear` en este archivo. Lo que
 * se muestra es el nombre y la posicion. El total de cada grupo lo agregan sus sobres.
 *
 * Esta tarjeta es de lectura: nombre, posicion y el "⋯" con las tres acciones. El pliegue
 * **no** vive aca sino en el `<details>` que la pagina pone al lado del total, porque R35
 * pide que plegar esconda los sobres y deje el total a la vista, y un estado de React
 * dentro de la tarjeta no puede hacer las dos cosas: el total esta fuera de ella.
 */

import { useFormStatus } from 'react-dom'
import { useActionState } from 'react'
import {
  accionArchivarGrupo,
  accionCrearGrupo,
  accionRenombrarGrupo,
  accionReordenarGrupo,
  accionRestaurarGrupo,
  type ResultadoDeGrupo,
} from '../grupos/acciones'
import { Aviso, Boton, Campo } from './sesion'
import { Confirmar, MenuDeFila } from './modal'
import detalle from './detalle.module.css'

const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

export function FormularioNuevoGrupo({ cartera_id }: { cartera_id: number }) {
  const [estado, accion] = useActionState(
    (prev: ResultadoDeGrupo, datos: FormData) => accionCrearGrupo(cartera_id, prev, datos),
    INICIAL,
  )

  return (
    <form action={accion} className={detalle.formulario}>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
      <Campo
        nombre="nombre"
        etiqueta="Nombre del grupo"
        error={estado.campos?.nombre}
        ayuda="Los grupos ordenan los sobres. No tienen presupuesto propio."
      />
      <AccionPendiente>Crear grupo</AccionPendiente>
    </form>
  )
}

/**
 * Un grupo con su total y su cantidad de sobres.
 *
 * El total y el contador llegan desde la pagina, que es quien ya los tiene calculados y
 * formatea con `formatear` —este archivo no formatea nada porque un grupo no tiene saldo
 * propio: el total es la suma de los disponibles de los sobres que contiene, y cada uno
 * de esos importes ya viene formateado de su propia fila.
 *
 * Los tres datos van en la **misma fila**: nombre a la izquierda, contador al lado y total
 * a la derecha. Antes el nombre y las acciones vivian en una tarjeta y el total en un
 * parrafo suelto debajo, con lo que"How much do I have in Needs" obligaba a unir dos filas
 * separadas por el menu de acciones.
 */
export function FilaGrupo({
  cartera_id,
  grupo_id,
  nombre,
  orden,
  total,
  cantidadSobres,
}: {
  cartera_id: number
  grupo_id: number
  nombre: string
  orden: number
  /** El total del grupo, ya formateado por la pagina. */
  total: string
  /** Cuantos sobres contiene, para el contador. */
  cantidadSobres: number
}) {
  const [estado, renombrar] = useActionState(
    (prev: ResultadoDeGrupo, datos: FormData) =>
      accionRenombrarGrupo(cartera_id, grupo_id, prev, datos),
    INICIAL,
  )
  const [estadoOrden, reordenar] = useActionState(
    (prev: ResultadoDeGrupo, datos: FormData) =>
      accionReordenarGrupo(cartera_id, grupo_id, prev, datos),
    INICIAL,
  )
  const [estadoArchivo, archivar] = useActionState(
    (prev: ResultadoDeGrupo, datos: FormData) =>
      accionArchivarGrupo(cartera_id, grupo_id, prev, datos),
    INICIAL,
  )

  /*
 * El root es un `<div>` y no un `<li>`: la pagina lo envuelve en el `<li>` de la lista de
 * grupos, porque al lado de esta tarjeta van el contador y el desplegable de sobres, que R35
 * exige que sigan visibles al plegar. Si esta devolviera un `<li>`, el HTML seria un `<li>`
 * dentro de otro `<li>` —nesting invalido— y el navegador lo reestructuraria al parsear, con
 * lo que la hidratacion falla.
 *
 * El pliegue no vive aca sino en el `<details>` que la pagina pone al lado del contador: R35
 * pide que plegar esconda los sobres y deje el total, y un estado de React metido en la
 * tarjeta no puede cumplir las dos cosas a la vez porque el contador esta fuera de ella. Por
 * eso esta tarjeta no tiene boton de plegar —antes lo tenia y no ocultaba nada: la pagina nunca
 * le pasa `children`, asi que solo alternaba el texto de "no hay sobres" en grupos que si los
 * tienen.
 *
 * La fila es de lectura y por lo tanto **no** lleva el recuadro de `.item`: un grupo es una
 * cabecera de seccion, y dibujarlo con la misma caja que sus hijos —los sobres— lo hacia
 * parecer un sobre mas. El total va a la derecha en la tipografia de cifras del sistema para
 * que los totales de todos los grupos se alineen en columna.
 */
return (
    <div className={detalle.filaGrupo}>
      <div className={detalle.grupoTexto}>
        <p className={detalle.itemNombre}>{nombre}</p>
        <p className={detalle.itemDetalle}>
          {cantidadSobres} {cantidadSobres === 1 ? 'sobre' : 'sobres'}
        </p>
      </div>

      <p className={detalle.grupoTotal}>{total}</p>

      <MenuDeFila
        titulo={`Acciones de ${nombre}`}
        acciones={[
          {
            etiqueta: 'Renombrar',
            contenido: (
              <>
                {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
                {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
                <form action={renombrar} className={detalle.formularioCercano}>
                  <div className={detalle.crece}>
                    <Campo nombre="nombre" etiqueta="Nuevo nombre" error={estado.campos?.nombre} />
                  </div>
                  <AccionPendiente>Renombrar</AccionPendiente>
                </form>
              </>
            ),
          },
          {
            etiqueta: 'Mover de posicion',
            contenido: (
              <>
                {estadoOrden.error ? <Aviso tono="error">{estadoOrden.error}</Aviso> : null}
                {estadoOrden.aviso ? <Aviso tono="exito">{estadoOrden.aviso}</Aviso> : null}
                <form action={reordenar} className={detalle.formularioCercano}>
                  <div className={detalle.crece}>
                    <Campo
                      nombre="orden"
                      etiqueta="Posicion"
                      error={estadoOrden.campos?.orden}
                      ayuda="Un entero igual o mayor que cero."
                    />
                  </div>
                  <AccionPendiente>Mover</AccionPendiente>
                </form>
              </>
            ),
          },
          {
            etiqueta: 'Archivar grupo',
            peligro: true,
            contenido: (
              <>
                {estadoArchivo.error ? (
                  <Aviso tono="error">{estadoArchivo.error}</Aviso>
                ) : null}
                {estadoArchivo.aviso ? (
                  <Aviso tono="exito">{estadoArchivo.aviso}</Aviso>
                ) : null}
                <Confirmar
                  titulo="Archivar este grupo"
                  childrenAcciones={
                    <form action={archivar}>
                      <AccionPendiente>Archivar grupo</AccionPendiente>
                    </form>
                  }
                >
                  <p>
                    No borra sus sobres ni cambia sus disponibles: solo deja de aparecer en el
                    agrupamiento. Se puede restaurar cuando quieras.
                  </p>
                </Confirmar>
              </>
            ),
          },
        ]}
      />
    </div>
  )
}

export function FilaGrupoArchivado({
  cartera_id,
  grupo_id,
  nombre,
}: {
  cartera_id: number
  grupo_id: number
  nombre: string
}) {
  const [estado, restaurar] = useActionState(
    (prev: ResultadoDeGrupo, datos: FormData) =>
      accionRestaurarGrupo(cartera_id, grupo_id, prev, datos),
    INICIAL,
  )

  return (
    <li className={`${detalle.item} ${detalle.itemArchivado}`}>
      <div className={detalle.itemEncabezado}>
        <p className={detalle.itemNombre}>{nombre}</p>
        <form action={restaurar}>
          <AccionPendiente>Restaurar</AccionPendiente>
        </form>
      </div>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
    </li>
  )
}
