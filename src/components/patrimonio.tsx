'use client'

import React, { useState } from 'react'
import { formatear, type Dinero } from '../dinero'
import type { HistorialPatrimonio, PuntoPatrimonio } from '../repos/patrimonio'
import { MENSAJE_HISTORIA_MODIFICADA } from '../patrimonio/retroactividad'

export interface PropsTarjetaPatrimonio {
  patrimonio: Dinero
  enSobres: Dinero
  dineroSuelto: Dinero
  moneda: string
  periodo?: string
}

/**
 * Bloque principal de Patrimonio:
 * Muestra la cifra destacada y el desglose de la invariante:
 * patrimonio = suma(disponibles) + dinero_suelto
 */
export function TarjetaPatrimonio({
  patrimonio,
  enSobres,
  dineroSuelto,
  moneda,
  periodo,
}: PropsTarjetaPatrimonio) {
  const [detallesAbiertos, setDetallesAbiertos] = useState(false)

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 text-center">
      <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">
        Patrimonio {periodo ? `(${periodo})` : ''}
      </div>
      <div className="mt-2 text-4xl font-extrabold text-gray-900 tracking-tight tabular-nums">
        {formatear(patrimonio, moneda)}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setDetallesAbiertos((v) => !v)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 cursor-pointer"
          aria-expanded={detallesAbiertos}
        >
          <span>
            = {formatear(enSobres, moneda)} en sobres + {formatear(dineroSuelto, moneda)} sin asignar
          </span>
          <span className="text-[10px]">{detallesAbiertos ? '▲' : '▼'}</span>
        </button>
      </div>

      {detallesAbiertos && (
        <div className="mt-4 pt-4 border-t border-gray-100 text-left grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600 block text-xs">Disponible en sobres:</span>
            <span className="font-semibold text-gray-900 tabular-nums">
              {formatear(enSobres, moneda)}
            </span>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600 block text-xs">Dinero suelto (sin asignar):</span>
            <span className="font-semibold text-gray-900 tabular-nums">
              {formatear(dineroSuelto, moneda)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export interface PropsEvolucionPatrimonio {
  historial: HistorialPatrimonio
  avisoRetroactivo?: boolean
}

/**
 * Tabla y serie de evolución cronológica del patrimonio mes a mes.
 * Cumple con R2 y R4: orden cronológico, variaciones relativas, aislamiento por cartera.
 */
export function EvolucionPatrimonio({ historial, avisoRetroactivo }: PropsEvolucionPatrimonio) {
  const { periodos, moneda, nombre_cartera } = historial

  if (periodos.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-8 text-center text-gray-500">
        No hay registros históricos de patrimonio en esta cartera.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
      {avisoRetroactivo && <AvisoHistoriaModificada />}

      <div className="p-5 border-b border-gray-100 flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Evolución del Patrimonio</h2>
          <p className="text-xs text-gray-500">Cartera: {nombre_cartera} ({moneda})</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
          {periodos.length} {periodos.length === 1 ? 'periodo' : 'periodos'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase border-b border-gray-200">
              <th className="py-3 px-4 font-semibold">Periodo</th>
              <th className="py-3 px-4 font-semibold text-right">En Sobres</th>
              <th className="py-3 px-4 font-semibold text-right">Dinero Suelto</th>
              <th className="py-3 px-4 font-semibold text-right">Patrimonio</th>
              <th className="py-3 px-4 font-semibold text-right">Variación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {periodos.map((punto, index) => (
              <FilaPeriodo key={punto.periodo} punto={punto} moneda={moneda} esPrimero={index === 0} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilaPeriodo({
  punto,
  moneda,
  esPrimero,
}: {
  punto: PuntoPatrimonio
  moneda: string
  esPrimero: boolean
}) {
  const tieneVariacion = punto.diferencia_absoluta !== null && punto.porcentaje_texto !== null
  const esPositivo = (punto.variacion_porcentual ?? 0) > 0
  const esNegativo = (punto.variacion_porcentual ?? 0) < 0

  return (
    <tr className="hover:bg-gray-50/80 transition-colors">
      <td className="py-3.5 px-4 font-medium text-gray-900">{punto.periodo}</td>
      <td className="py-3.5 px-4 text-right text-gray-600 tabular-nums">
        {formatear(punto.disponible_sobres, moneda)}
      </td>
      <td className="py-3.5 px-4 text-right text-gray-600 tabular-nums">
        {formatear(punto.dinero_suelto, moneda)}
      </td>
      <td className="py-3.5 px-4 text-right font-bold text-gray-900 tabular-nums">
        {formatear(punto.patrimonio, moneda)}
      </td>
      <td className="py-3.5 px-4 text-right tabular-nums">
        {esPrimero ? (
          <span className="text-xs text-gray-400 font-medium">Primer periodo</span>
        ) : tieneVariacion ? (
          <span
            className={`inline-flex items-center gap-1 font-semibold text-xs px-2 py-0.5 rounded-full ${
              esPositivo
                ? 'bg-emerald-50 text-emerald-700'
                : esNegativo
                ? 'bg-rose-50 text-rose-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <span>{punto.porcentaje_texto}</span>
            <span className="text-[11px] text-gray-500 font-normal">
              ({punto.diferencia_absoluta && formatear(punto.diferencia_absoluta, moneda)})
            </span>
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </td>
    </tr>
  )
}

export function AvisoHistoriaModificada({
  mensaje = MENSAJE_HISTORIA_MODIFICADA,
}: {
  mensaje?: string
}) {
  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 p-4 text-amber-900 flex items-center justify-between text-sm"
    >
      <div className="flex items-center gap-2">
        <span className="text-amber-600 font-bold" aria-hidden="true">
          ℹ
        </span>
        <span>{mensaje}</span>
      </div>
    </div>
  )
}
