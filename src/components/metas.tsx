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
import detalle from './detalle.module.css'

const INICIAL: ResultadoMeta = { ok: false }

/**
 * El sufijo de la clase de la barra, derivando del estado visual.
 *
 * Vive en una funcion y no en un ternario dentro del `className` porque el nombre de la clase
 * se compone: `barra` + `Cumplida` / `Retrasada` / `EnCamino`. Las tres clases estan
 * declaradas en `detalle.module.css`, asi que un estado nuevo rompe el typecheck y no la
 * pantalla en silencio.
 */
function barraEstado(estado: ProgresoMeta['estado_visual']): 'Cumplida' | 'Retrasada' | 'EnCamino' {
  if (estado === 'cumplida') return 'Cumplida'
  if (estado === 'retrasada') return 'Retrasada'
  return 'EnCamino'
}

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
      <button type="submit" disabled={pending} className={detalle.botonPeligro}>
        {pending ? 'Procesando...' : children}
      </button>
    )
  }
  if (tono === 'exito') {
    return (
      <button type="submit" disabled={pending} className={detalle.botonExito}>
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

  /*
   * El estado va en el texto del badge (`textoEstado`) y no solo en el color: el mismo texto
   * dice "Objetivo alcanzado", "Retrasada" o "En camino", asi que la vista no depende de
   * distinguir verde de rojo.
   */
  const badgeColor =
    progreso.estado_visual === 'cumplida'
      ? detalle.badgeCumplida
      : progreso.estado_visual === 'retrasada'
        ? detalle.badgeRetrasada
        : detalle.badgeEnCamino

  const textoEstado =
    progreso.estado_visual === 'cumplida'
      ? 'Objetivo alcanzado'
      : progreso.estado_visual === 'retrasada'
        ? progreso.vencida
          ? 'Fecha limite vencida'
          : 'Retrasada'
        : 'En camino'

  return (
    <div className={`${detalle.item} ${detalle.itemCorto}`}>
      {estadoCompletar.error && <Aviso tono="error">{estadoCompletar.error}</Aviso>}
      {estadoAbandonar.error && <Aviso tono="error">{estadoAbandonar.error}</Aviso>}

      <div className={detalle.itemEncabezado}>
        <div className={detalle.filaNombre}>
          <span className={detalle.etiquetaFuerte}>Meta de ahorro:</span>
          <span className={`${detalle.itemValor} ${detalle.valorMedio}`}>
            {formatear(progreso.monto_objetivo, moneda)}
          </span>
          <span className={`${detalle.pill} ${badgeColor}`}>{textoEstado}</span>
        </div>

        <div className={detalle.nota}>
          <span>{progreso.porcentaje}% completado</span>
        </div>
      </div>

      {/*
        Barra de progreso. El ancho sale de `progreso.porcentaje`, que el repositorio ya
        acoto a 0..100 y `anchoBarra` vuelve a acotar; el color repite el del badge.
      */}
      <div className={detalle.barraCarril}>
        <div
          className={`${detalle.barra} ${detalle[`barra${barraEstado(progreso.estado_visual)}`]}`}
          style={{ width: `${anchoBarra}%` }}
        />
      </div>

      <div className={detalle.datosMeta}>
        <div>
          <span>Disponible: </span>
          <strong className={detalle.tinta}>{formatear(progreso.disponible, moneda)}</strong>
          {progreso.restante !== '0.00' && (
            <span> • Faltan: {formatear(progreso.restante, moneda)}</span>
          )}
        </div>

        {progreso.fecha_limite && (
          <div>
            <span>Fecha limite: </span>
            <strong className={detalle.tinta}>{progreso.fecha_limite}</strong>
            {progreso.ritmo_periodo && (
              <span> • Necesitas {formatear(progreso.ritmo_periodo, moneda)} / periodo</span>
            )}
          </div>
        )}
      </div>

      {progreso.estado_visual === 'retrasada' && progreso.falta_para_ritmo && (
        <div className={detalle.notaRiesgo}>
          Faltan {formatear(progreso.falta_para_ritmo, moneda)} asignados en este periodo para alcanzar el ritmo necesario.
        </div>
      )}

      {/* Botones de acción manual */}
      <div className={detalle.barraAcciones}>
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
      <div className={detalle.desplegable}>
        <button type="button" onClick={() => setAbierto(true)} className={detalle.enlaceAccion}>
          + Definir meta de ahorro
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className={`${detalle.formulario} ${detalle.formularioAnidado}`}>
      <div className={detalle.itemEncabezado}>
        <h4 className={detalle.itemNombre}>Nueva meta de ahorro</h4>
        <button type="button" onClick={() => setAbierto(false)} className={detalle.enlaceSuave}>
          Cancelar
        </button>
      </div>

      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado.aviso && <Aviso tono="exito">{estado.aviso}</Aviso>}

      <input type="hidden" name="sobre_id" value={sobre_id} />
      <input type="hidden" name="cartera_id" value={cartera_id} />
      {token_proteccion && <input type="hidden" name="token_proteccion" value={token_proteccion} />}

      <div className={detalle.grillaDos}>
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

      <div className={detalle.alDerecha}>
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
    <div className={detalle.bloque}>
      <button type="button" onClick={() => setExpandido(!expandido)} className={detalle.enlaceSuave}>
        {expandido ? 'Ocultar historial de metas' : `Ver historial (${historial.length} metas anteriores)`}
      </button>

      {expandido && (
        <ul className={detalle.historial}>
          {historial.map((meta) => {
            const fechaFin = meta.completada_en ?? meta.abandonada_en
            return (
              <li key={meta.id} className={detalle.fila}>
                <div>
                  <span className={detalle.itemNombreChico}>
                    {formatear(meta.monto_objetivo, moneda)}
                  </span>
                  {meta.fecha_limite && <span> (Limite: {meta.fecha_limite})</span>}
                </div>
                <div className={detalle.acciones}>
                  <span className={`${detalle.pill} ${detalle[`estado${meta.estado}`]}`}>
                    {meta.estado}
                  </span>
                  {fechaFin && (
                    <span className={detalle.notaCorta}>
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
