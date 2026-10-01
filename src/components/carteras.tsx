'use client'

/**
 * Vista de carteras.
 *
 * Lo unico de este archivo que es de cliente es el estado del formulario, por
 * `useActionState`. Las reglas —la moneda no se cambia, una cartera archivada no
 * opera, no se suman carteras— estan en el repositorio y en la pagina, no aqui.
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

const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

export function FormularioNuevaCartera() {
  const [estado, accion] = useActionState(accionCrearCartera, INICIAL)

  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      <Campo
        nombre="nombre"
        etiqueta="Nombre de la cartera"
        error={estado.campos?.nombre}
        ayuda={`Hasta ${NOMBRE_CARTERA_MAXIMO} caracteres.`}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Moneda</span>
        <select
          name="moneda"
          defaultValue={MONEDA_POR_DEFECTO}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {MONEDAS.map((moneda) => (
            <option key={moneda.codigo} value={moneda.codigo}>
              {etiquetaMoneda(moneda)}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          La moneda se define aqui y no se puede cambiar despues.
        </span>
        {estado.campos?.moneda ? (
          <span className="text-xs text-red-600">{estado.campos.moneda}</span>
        ) : null}
      </label>

      <AccionPendiente>Crear cartera</AccionPendiente>
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
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{nombre}</p>
          <p className="text-xs text-slate-500">Moneda {moneda}</p>
        </div>
        <a
          href={`/cartera/${cartera_id}`}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Entrar
        </a>
      </div>

      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estadoArchivo.error ? <Aviso tono="error">{estadoArchivo.error}</Aviso> : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500">Editar o archivar</summary>
        <form action={renombrar} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Campo nombre="nombre" etiqueta="Nuevo nombre" error={estado.campos?.nombre} />
          </div>
          <AccionPendiente>Renombrar</AccionPendiente>
        </form>
        <form action={archivar} className="mt-2">
          <AccionPendiente>Archivar cartera</AccionPendiente>
        </form>
      </details>
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
    <li className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-700">{nombre}</p>
          <p className="text-xs text-slate-500">
            Moneda {moneda} · archivada, con sus datos
          </p>
        </div>
        <form action={restaurar}>
          <AccionPendiente>Restaurar</AccionPendiente>
        </form>
      </div>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
    </li>
  )
}
