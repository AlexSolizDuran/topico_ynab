'use client'

/**
 * Vista de carteras.
 *
 * Lo unico de este archivo que es de cliente es el estado de los formularios, por
 * `useActionState`. Las reglas —la moneda no se cambia, una cartera archivada no opera, no se
 * suman carteras— estan en el repositorio y en la pagina, no aqui.
 *
 * Las clases salen de `carteras.module.css` y la paleta de `tema-oscuro.module.css`. No se
 * escriben utilidades de color sueltas: cualquier `text-slate-*` que se colara aqui seria
 * texto oscuro sobre fondo oscuro, que es el fallo que todavia arrastran las pantallas de
 * producto sin migrar.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  accionArchivarCartera,
  accionCrearCartera,
  accionRenombrarCartera,
  accionRestaurarCartera,
  type ResultadoDeCartera,
} from '../carteras/acciones'
import { MONEDA_POR_DEFECTO, MONEDAS, etiquetaMoneda } from '../carteras/monedas'
import { NOMBRE_CARTERA_MAXIMO } from '../carteras/validacion'
import { Aviso, Boton, Campo } from './sesion'
import estilos from './carteras.module.css'

const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

export function FormularioNuevaCartera() {
  const [estado, accion] = useActionState(accionCrearCartera, INICIAL)

  return (
    <form action={accion}>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      <div className={estilos.filaForm}>
        <Campo
          nombre="nombre"
          etiqueta="Nombre de la cartera"
          error={estado.campos?.nombre}
          ayuda={`Hasta ${NOMBRE_CARTERA_MAXIMO} caracteres.`}
        />

        {/*
         * El desplegable de moneda NO usa `Campo`. Es el unico select de la pantalla y su
         * opcion depende de una lista que se importa; `Campo` resuelve la etiqueta y el
         * error por su cuenta, asi que reutilizarlo obligaria a duplicar ese cableado. Las
         * clases del `select` las pinta `tema-oscuro.module.css` por descendencia.
         */}
        <label className={estilos.campo}>
          <span>Moneda</span>
          <select name="moneda" defaultValue={MONEDA_POR_DEFECTO}>
            {MONEDAS.map((moneda) => (
              <option key={moneda.codigo} value={moneda.codigo}>
                {etiquetaMoneda(moneda)}
              </option>
            ))}
          </select>
          <span className={estilos.nota}>Se define aca y no se cambia despues.</span>
          {estado.campos?.moneda ? (
            <span className={estilos.notaError}>{estado.campos.moneda}</span>
          ) : null}
        </label>
      </div>

      <div className={estilos.crear}>
        <AccionPendiente>Crear cartera</AccionPendiente>
      </div>
    </form>
  )
}

/** Una cartera activa: entrar, renombrar, archivar. */
export function FilaCarteraActiva({
  cartera_id,
  nombre,
  moneda,
}: {
  cartera_id: number
  nombre: string
  moneda: string
}) {
  const [estado, renombrar] = useActionState(
    (prev: ResultadoDeCartera, datos: FormData) => accionRenombrarCartera(cartera_id, prev, datos),
    INICIAL,
  )
  const [estadoArchivo, archivar] = useActionState(
    (prev: ResultadoDeCartera, datos: FormData) => accionArchivarCartera(cartera_id, prev, datos),
    INICIAL,
  )

  return (
    <li className={estilos.item}>
      <div className={estilos.itemInfo}>
        <p className={estilos.itemNombre}>{nombre}</p>
        <span className={estilos.itemMoneda}>{moneda}</span>
      </div>

      <a href={`/cartera/${cartera_id}`} className={estilos.entrar}>
        Entrar
      </a>

      {/*
       * Renombrar y archivar van plegados. Son operaciones de vez en cuando y no pueden
       * competir en jerarquia con "Entrar", que es lo que se hace en el 95% de las visitas.
       */}
      <div className={estilos.pie}>
        {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
        {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
        {estadoArchivo.error ? <Aviso tono="error">{estadoArchivo.error}</Aviso> : null}

        <details className={estilos.detalles}>
          <summary className={estilos.resumen}>Editar o archivar</summary>
          <div className={estilos.acciones}>
            <form action={renombrar}>
              <Campo nombre="nombre" etiqueta="Nuevo nombre" error={estado.campos?.nombre} />
              <AccionPendiente>Renombrar</AccionPendiente>
            </form>
            <form action={archivar}>
              <AccionPendiente>Archivar cartera</AccionPendiente>
            </form>
          </div>
        </details>
      </div>
    </li>
  )
}

/** Una cartera archivada conserva sus datos; solo falta restaurarla para usarla. */
export function FilaCarteraArchivada({
  cartera_id,
  nombre,
  moneda,
}: {
  cartera_id: number
  nombre: string
  moneda: string
}) {
  const [estado, restaurar] = useActionState(
    (prev: ResultadoDeCartera, datos: FormData) => accionRestaurarCartera(cartera_id, prev, datos),
    INICIAL,
  )

  return (
    <li className={`${estilos.item} ${estilos.archivada}`}>
      <div className={estilos.itemInfo}>
        <p className={estilos.itemNombre}>{nombre}</p>
        <span className={estilos.itemMoneda}>{moneda}</span>
        <p className={estilos.itemMeta}>Archivada, con sus datos</p>
      </div>

      <form action={restaurar}>
        <AccionPendiente>Restaurar</AccionPendiente>
      </form>

      {estado.error ? (
        <div className={estilos.pie}>
          <Aviso tono="error">{estado.error}</Aviso>
        </div>
      ) : null}
    </li>
  )
}