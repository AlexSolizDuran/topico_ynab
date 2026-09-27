'use client'

/**
 * Componentes de grupos.
 *
 * Un grupo no tiene saldo: por eso no hay ningun `formatear` en este archivo. Lo que
 * se muestra es el nombre, el orden y si esta archivado. El total de cada grupo lo
 * agreguen sus sobres, y llega con `050-sobres`.
 *
 * Plegar y desplegar es estado del cliente y no una peticion: es una preferencia de
 * como se esta leyendo la lista, no un cambio en los datos. Por eso se resuelve con
 * `useState` y no con una Server Action — mandarla al servidor haria que cada
 * despliegue del grupo reescribiera lo que el usuario tiene abierto.
 */

import { useState } from 'react'
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
    <form action={accion} className="flex flex-col gap-4">
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

export function FilaGrupo({
  cartera_id,
  grupo_id,
  nombre,
  orden,
  children,
}: {
  cartera_id: number
  grupo_id: number
  nombre: string
  orden: number
  /** Los sobres del grupo. Vacio hoy; `050-sobres` lo llena. */
  children?: React.ReactNode
}) {
  const [plegado, setPlegado] = useState(false)
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

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{nombre}</p>
          <p className="text-xs text-slate-500">posicion {orden}</p>
        </div>
        <button
          type="button"
          onClick={() => setPlegado((antes) => !antes)}
          aria-expanded={!plegado}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          {plegado ? 'Desplegar' : 'Plegar'}
        </button>
      </div>

      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estadoOrden.error ? <Aviso tono="error">{estadoOrden.error}</Aviso> : null}
      {estadoArchivo.error ? <Aviso tono="error">{estadoArchivo.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      {plegado ? null : (
        <div className="mt-3">
          {children ?? (
            <p className="text-sm text-slate-500">
              Todavia no hay sobres en este grupo.
            </p>
          )}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500">Editar grupo</summary>

        <form action={renombrar} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Campo nombre="nombre" etiqueta="Nuevo nombre" error={estado.campos?.nombre} />
          </div>
          <AccionPendiente>Renombrar</AccionPendiente>
        </form>

        <form action={reordenar} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Campo
              nombre="orden"
              etiqueta="Posicion"
              error={estadoOrden.campos?.orden}
              ayuda="Un entero igual o mayor que cero."
            />
          </div>
          <AccionPendiente>Mover</AccionPendiente>
        </form>

        <form action={archivar} className="mt-3">
          <AccionPendiente>Archivar grupo</AccionPendiente>
        </form>
        <p className="mt-1 text-xs text-slate-500">
          Archivar un grupo no borra sus sobres ni cambia sus disponibles: solo deja de
          aparecer en el agrupamiento.
        </p>
      </details>
    </li>
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
    <li className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{nombre}</p>
        <form action={restaurar}>
          <AccionPendiente>Restaurar</AccionPendiente>
        </form>
      </div>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
    </li>
  )
}
