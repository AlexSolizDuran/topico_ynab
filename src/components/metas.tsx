'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  accionAbandonarMeta,
  accionCompletarMeta,
  accionCrearMeta,
  type ResultadoMeta,
} from '../metas/acciones'
import type { Meta } from '../db/schema'
import type { ProgresoMeta } from '../repos/metas'
import { formatear } from '../dinero'
import { Aviso, Boton, Campo } from './sesion'

const INICIAL: ResultadoMeta = { ok: false }

function AccionPendiente({
  children,
  tono = 'normal',
}: {
  children: React.ReactNode
  tono?: 'normal' | 'peligro' | 'exito'
}) {
  const { pending } = useFormStatus()
  if (tono === 'peligro') {
    return (
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
      >
        {pending ? 'Procesando...' : children}
      </button>
    )
  }
  if (tono === 'exito') {
    return (
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? 'Completando...' : children}
      </button>
    )
  }
  return (
    <Boton pendiente={pending}>
      {pending ? 'Guardando...' : children}
    </Boton>
  )
}

export function TarjetaMeta({
  meta,
  progreso,
  moneda,
  cartera_id,
  periodo,
  token_proteccion,
}: {
  meta: Meta
  progreso: ProgresoMeta
  moneda: string
  cartera_id: number
  periodo?: string
  token_proteccion?: string
}) {
  const [estadoCompletar, formActionCompletar] = useActionState(accionCompletarMeta, INICIAL)
  const [estadoAbandonar, formActionAbandonar] = useActionState(accionAbandonarMeta, INICIAL)

  const anchoBarra = Math.min(100, Math.max(0, progreso.porcentaje))

  const badgeColor =
    progreso.estado_visual === 'cumplida'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : progreso.estado_visual === 'retrasada'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-blue-200 bg-blue-50 text-blue-700'

  const textoEstado =
    progreso.estado_visual === 'cumplida'
      ? 'Objetivo alcanzado'
      : progreso.estado_visual === 'retrasada'
        ? progreso.vencida
          ? 'Fecha limite vencida'
          : 'Retrasada'
        : 'En camino'

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-800">
      {estadoCompletar.error && <Aviso tono="error">{estadoCompletar.error}</Aviso>}
      {estadoAbandonar.error && <Aviso tono="error">{estadoAbandonar.error}</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">Meta de ahorro:</span>
          <span className="font-bold text-slate-900">
            {formatear(progreso.monto_objetivo, moneda)}
          </span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeColor}`}>
            {textoEstado}
          </span>
        </div>

        <div className="text-xs text-slate-500">
          <span>{progreso.porcentaje}% completado</span>
        </div>
      </div>

      {/* Barra de progreso visual */}
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full transition-all duration-300 ${
            progreso.estado_visual === 'cumplida'
              ? 'bg-emerald-500'
              : progreso.estado_visual === 'retrasada'
                ? 'bg-amber-500'
                : 'bg-blue-600'
          }`}
          style={{ width: `${anchoBarra}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-slate-600">
        <div>
          <span>Disponible: </span>
          <strong className="text-slate-900">{formatear(progreso.disponible, moneda)}</strong>
          {progreso.restante !== '0.00' && (
            <span> • Faltan: {formatear(progreso.restante, moneda)}</span>
          )}
        </div>

        {progreso.fecha_limite && (
          <div>
            <span>Fecha limite: </span>
            <strong className="text-slate-900">{progreso.fecha_limite}</strong>
            {progreso.ritmo_periodo && (
              <span> • Necesitas {formatear(progreso.ritmo_periodo, moneda)} / periodo</span>
            )}
          </div>
        )}
      </div>

      {progreso.estado_visual === 'retrasada' && progreso.falta_para_ritmo && (
        <div className="mt-2 text-xs font-medium text-rose-600">
          Faltan {formatear(progreso.falta_para_ritmo, moneda)} asignados en este periodo para alcanzar el ritmo necesario.
        </div>
      )}

      {/* Botones de acción manual */}
      <div className="mt-3 flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
        <form action={formActionAbandonar}>
          <input type="hidden" name="id" value={meta.id} />
          <input type="hidden" name="cartera_id" value={cartera_id} />
          {token_proteccion && <input type="hidden" name="token_proteccion" value={token_proteccion} />}
          <AccionPendiente tono="peligro">Abandonar meta</AccionPendiente>
        </form>

        <form action={formActionCompletar}>
          <input type="hidden" name="id" value={meta.id} />
          <input type="hidden" name="cartera_id" value={cartera_id} />
          {periodo && <input type="hidden" name="periodo" value={periodo} />}
          {token_proteccion && <input type="hidden" name="token_proteccion" value={token_proteccion} />}
          <AccionPendiente tono="exito">
            {progreso.estado_visual === 'cumplida' ? 'Confirmar meta cumplida' : 'Completar meta'}
          </AccionPendiente>
        </form>
      </div>
    </div>
  )
}

export function FormularioNuevaMeta({
  sobre_id,
  cartera_id,
  token_proteccion,
}: {
  sobre_id: number
  cartera_id: number
  token_proteccion?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [estado, formAction] = useActionState(accionCrearMeta, INICIAL)

  if (!abierto) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
        >
          + Definir meta de ahorro
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Nueva meta de ahorro</h4>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Cancelar
        </button>
      </div>

      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado.aviso && <Aviso tono="exito">{estado.aviso}</Aviso>}

      <input type="hidden" name="sobre_id" value={sobre_id} />
      <input type="hidden" name="cartera_id" value={cartera_id} />
      {token_proteccion && <input type="hidden" name="token_proteccion" value={token_proteccion} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          nombre="monto_objetivo"
          etiqueta="Monto objetivo"
          error={estado.campos?.monto_objetivo}
          requerido
        />

        <Campo
          nombre="fecha_limite"
          etiqueta="Fecha limite (opcional)"
          tipo="date"
          error={estado.campos?.fecha_limite}
          requerido={false}
        />
      </div>

      <div className="flex justify-end pt-1">
        <AccionPendiente>Guardar meta</AccionPendiente>
      </div>
    </form>
  )
}

export function HistorialMetas({
  historial,
  moneda,
}: {
  historial: ReadonlyArray<Meta>
  moneda: string
}) {
  const [expandido, setExpandido] = useState(false)

  if (historial.length === 0) return null

  return (
    <div className="mt-2 text-xs">
      <button
        type="button"
        onClick={() => setExpandido(!expandido)}
        className="text-slate-500 hover:text-slate-800 underline"
      >
        {expandido ? 'Ocultar historial de metas' : `Ver historial (${historial.length} metas anteriores)`}
      </button>

      {expandido && (
        <ul className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-slate-700">
          {historial.map((meta) => {
            const fechaFin = meta.completada_en ?? meta.abandonada_en
            return (
              <li key={meta.id} className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-medium text-slate-900">
                    {formatear(meta.monto_objetivo, moneda)}
                  </span>
                  {meta.fecha_limite && <span> (Limite: {meta.fecha_limite})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      meta.estado === 'completada'
                        ? 'bg-emerald-100 text-emerald-800'
                        : meta.estado === 'abandonada'
                          ? 'bg-neutral-200 text-neutral-700'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {meta.estado}
                  </span>
                  {fechaFin && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(fechaFin).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
