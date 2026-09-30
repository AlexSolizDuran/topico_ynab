'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { formatear } from '../dinero'
import type { DatosPanel } from '../repos/panel'

export interface CarteraOpcion {
  id: number
  nombre: string
  moneda: string
}

export interface PropsPanelResumen {
  datos: DatosPanel
  carterasDisponibles?: CarteraOpcion[]
  avisoRecalculo?: boolean
}

/**
 * Vista de resumen de cartera (Panel de Control).
 *
 * Cumple con R1-R13:
 * - Vista de SOLO LECTURA sin formularios de captura directa
 * - Desglose de patrimonio derivado
 * - Dinero suelto y aviso de sobreasignación
 * - Cuentas con crédito en rojo y archivadas separadas
 * - Sobres agrupados con pliegue y desbordes priorizados
 * - Cobertura manual de desborde cuando hay dinero suelto suficiente
 * - Gastos e ingresos del periodo (sin traspasos)
 * - Conteo y acceso a movimientos sin asignar
 * - Avance de metas activas con destaque de retrasadas
 * - Aislamiento por cartera y sin totales combinados
 */
export function PanelResumen({
  datos,
  carterasDisponibles = [],
  avisoRecalculo = false,
}: PropsPanelResumen) {
  const { cartera, periodo, patrimonio, dinero_suelto, cuentas, grupos, totales_periodo, pendientes_asignacion, metas_activas } = datos
  const moneda = cartera.moneda

  const [desglosePatrimonioAbierto, setDesglosePatrimonioAbierto] = useState(false)
  const [archivadasAbiertas, setArchivadasAbiertas] = useState(false)
  const [gruposColapsados, setGruposColapsados] = useState<Record<number, boolean>>({})

  const toggleGrupo = (id: number) => {
    setGruposColapsados((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Aviso de recálculo retroactivo */}
      {avisoRecalculo && (
        <div role="status" className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-900 text-sm flex items-center gap-2">
          <span className="font-bold text-amber-600">ℹ</span>
          <span>Los valores mostrados han sido recalculados tras registrar o modificar operaciones de periodos anteriores.</span>
        </div>
      )}

      {/* Barra superior con selector de cartera */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider block">Cartera activa</span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">{cartera.nombre}</span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">
              {moneda}
            </span>
          </div>
        </div>

        {/* Selector de carteras independientes (nunca suma ni arrastra cifras de otra cartera) */}
        {carterasDisponibles.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="selector-cartera-panel" className="text-xs text-gray-500">
              Cambiar a:
            </label>
            <div className="flex gap-1">
              {carterasDisponibles
                .filter((c) => c.id !== cartera.id)
                .map((c) => (
                  <Link
                    key={c.id}
                    href={`/cartera/${c.id}`}
                    className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium transition-colors"
                  >
                    {c.nombre} ({c.moneda})
                  </Link>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* BLOQUE 1: Patrimonio Destacado */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center shadow-xs">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Patrimonio Neto
        </div>
        <div className="mt-2 text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight tabular-nums">
          {formatear(patrimonio.total, moneda)}
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setDesglosePatrimonioAbierto((v) => !v)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 cursor-pointer"
            aria-expanded={desglosePatrimonioAbierto}
          >
            <span>
              = {formatear(patrimonio.en_sobres, moneda)} en sobres + {formatear(patrimonio.dinero_suelto, moneda)} sin asignar
            </span>
            <span className="text-[10px]">{desglosePatrimonioAbierto ? '▲' : '▼'}</span>
          </button>
        </div>

        {desglosePatrimonioAbierto && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-left">
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-500 block text-xs">Disponible en sobres:</span>
              <span className="font-semibold text-gray-900 tabular-nums">{formatear(patrimonio.en_sobres, moneda)}</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-500 block text-xs">Dinero suelto (sin asignar):</span>
              <span className="font-semibold text-gray-900 tabular-nums">{formatear(patrimonio.dinero_suelto, moneda)}</span>
            </div>
          </div>
        )}
      </div>

      {/* BLOQUE 2: Dinero Suelto y Desbordes */}
      <div className={`rounded-xl border p-5 ${dinero_suelto.es_negativo ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-200'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider block text-gray-600">
              Dinero Suelto
            </span>
            <span className={`text-2xl font-bold tabular-nums ${dinero_suelto.es_negativo ? 'text-rose-700' : 'text-gray-900'}`}>
              {formatear(dinero_suelto.monto, moneda)}
            </span>
            {dinero_suelto.sobreasignado && (
              <p className="text-xs font-medium text-rose-700 mt-1">
                {dinero_suelto.aviso_sobreasignado}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/cartera/${cartera.id}?accion=asignar`}
              className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Asignar dinero
            </Link>
          </div>
        </div>

        {/* Acciones para tapar desbordes si existen sobres en negativo */}
        {datos.desbordes_acciones.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200/60 space-y-2">
            <span className="text-xs font-bold text-gray-700 block uppercase">Desbordes detectados</span>
            {datos.desbordes_acciones.map((desborde) => (
              <div key={desborde.sobre_id} className="flex flex-wrap items-center justify-between p-2.5 bg-white/80 rounded-lg text-sm border border-gray-200 gap-2">
                <div>
                  <span className="font-semibold text-gray-900">{desborde.nombre_sobre}: </span>
                  <span className="text-rose-600 font-bold tabular-nums">{formatear(desborde.disponible_negativo, moneda)}</span>
                </div>
                {desborde.puede_tapar ? (
                  <Link
                    href={`/cartera/${cartera.id}?tapar_sobre=${desborde.sobre_id}&origen=suelto`}
                    className="text-xs font-semibold px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
                  >
                    Tapar desborde con dinero suelto
                  </Link>
                ) : (
                  <span className="text-xs text-gray-500 italic">
                    El dinero suelto actual no cubre este desborde
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BLOQUE 3 Y 5 EN GRID: Cuentas y Totales del periodo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BLOQUE 3: Cuentas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-900 text-base">Cuentas</h3>
            <Link href={`/cartera/${cartera.id}/cuentas`} className="text-xs text-blue-600 hover:underline">
              Ver todas
            </Link>
          </div>

          <div className="divide-y divide-gray-100 text-sm">
            {cuentas.activas.map((c) => {
              const esDeuda = c.tipo === 'credito' || c.saldo.startsWith('-')
              return (
                <div key={c.id} className="py-2.5 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-gray-800">{c.nombre}</span>
                    <span className="text-xs text-gray-400 block capitalize">{c.tipo}</span>
                  </div>
                  <span className={`font-semibold tabular-nums ${esDeuda ? 'text-rose-600' : 'text-gray-900'}`}>
                    {formatear(c.saldo, moneda)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-sm font-bold text-gray-900">
            <span>Total cuentas activas</span>
            <span className="tabular-nums">{formatear(cuentas.total_activas, moneda)}</span>
          </div>

          {cuentas.archivadas.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setArchivadasAbiertas((v) => !v)}
                className="text-xs text-gray-500 hover:text-gray-700 flex justify-between w-full"
              >
                <span>Cuentas archivadas ({cuentas.archivadas.length})</span>
                <span>{archivadasAbiertas ? '▲' : '▼'}</span>
              </button>
              {archivadasAbiertas && (
                <div className="mt-2 divide-y divide-gray-100 text-xs text-gray-500">
                  {cuentas.archivadas.map((c) => (
                    <div key={c.id} className="py-1.5 flex justify-between">
                      <span>{c.nombre} (archivada)</span>
                      <span className="tabular-nums">{formatear(c.saldo, moneda)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BLOQUE 5: Totales del Periodo (Ingresos y Gastos sin contar traspasos) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-900 text-base">Mes: {periodo}</h3>
              <Link href={`/cartera/${cartera.id}/movimientos`} className="text-xs text-blue-600 hover:underline">
                Movimientos
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 text-center">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <span className="text-xs text-emerald-800 font-medium block">Ingresos del mes</span>
                <span className="text-lg font-bold text-emerald-700 tabular-nums">
                  +{formatear(totales_periodo.ingresado, moneda)}
                </span>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                <span className="text-xs text-rose-800 font-medium block">Gastos del mes</span>
                <span className="text-lg font-bold text-rose-700 tabular-nums">
                  -{formatear(totales_periodo.gastado, moneda)}
                </span>
              </div>
            </div>
          </div>

          {/* BLOQUE 6: Movimientos sin asignar */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500 block">Movimientos sin sobre asignado</span>
              <span className="text-sm font-bold text-gray-800">
                {pendientes_asignacion.cantidad === 0
                  ? 'Todos asignados'
                  : `${pendientes_asignacion.cantidad} ${pendientes_asignacion.cantidad === 1 ? 'movimiento' : 'movimientos'} pendiente`}
              </span>
            </div>
            {pendientes_asignacion.cantidad > 0 && (
              <Link
                href={`/cartera/${cartera.id}/movimientos?filtro=sin_sobre`}
                className="text-xs font-semibold px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded transition-colors"
              >
                Asignar
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* BLOQUE 4: Sobres agrupados por grupo y metas activas */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900 text-base">Sobres presupuestarios</h3>
          <Link href={`/cartera/${cartera.id}/sobres`} className="text-xs text-blue-600 hover:underline">
            Ver todos los sobres
          </Link>
        </div>

        {/* Metas activas destacadas */}
        {metas_activas.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200/60">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-2">
              Progreso de metas activas
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {metas_activas.map((meta) => (
                <div
                  key={meta.id}
                  className={`p-3 rounded-lg border bg-white ${meta.retrasada ? 'border-amber-300 ring-1 ring-amber-300' : 'border-gray-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-gray-900 text-sm">{meta.nombre_sobre}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.retrasada ? 'bg-amber-100 text-amber-800' : meta.estado_visual === 'cumplida' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                      {meta.retrasada ? 'Retrasada' : meta.estado_visual === 'cumplida' ? 'Cumplida' : 'En camino'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 flex justify-between">
                    <span>{formatear(meta.disponible, moneda)} de {formatear(meta.monto_objetivo, moneda)}</span>
                    <span className="font-bold text-gray-700">{meta.porcentaje}%</span>
                  </div>
                  <div className="mt-1 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${meta.retrasada ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(meta.porcentaje, 100)}%` }}
                    />
                  </div>
                  {meta.retrasada && meta.falta_para_ritmo && (
                    <p className="mt-2 text-[11px] text-amber-800 font-medium">
                      Faltan {formatear(meta.falta_para_ritmo, moneda)} para alcanzar el ritmo necesario este mes.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de grupos */}
        <div className="space-y-4">
          {grupos.map((grupo) => {
            const colapsado = gruposColapsados[grupo.id] ?? false
            return (
              <div key={grupo.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGrupo(grupo.id)}
                  className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100/80 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{colapsado ? '▶' : '▼'}</span>
                    <span className="font-bold text-gray-800 text-sm">{grupo.nombre}</span>
                    <span className="text-xs text-gray-400">({grupo.sobres.length})</span>
                  </div>
                  <span className="font-bold text-gray-900 text-sm tabular-nums">
                    {formatear(grupo.total_disponible, moneda)}
                  </span>
                </button>

                {!colapsado && (
                  <div className="divide-y divide-gray-100 p-2">
                    {grupo.sobres.map((sobre) => (
                      <div key={sobre.id} className="py-2 px-3 flex justify-between items-center text-sm hover:bg-gray-50/50 rounded">
                        <div>
                          <span className={`font-medium ${sobre.es_negativo ? 'text-rose-700' : 'text-gray-800'}`}>
                            {sobre.nombre}
                          </span>
                          {sobre.es_negativo && (
                            <span className="ml-2 text-xs font-semibold px-2 py-0.5 bg-rose-100 text-rose-800 rounded">
                              En rojo (-{sobre.desborde && formatear(sobre.desborde, moneda)})
                            </span>
                          )}
                        </div>
                        <span className={`font-bold tabular-nums ${sobre.es_negativo ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {formatear(sobre.disponible, moneda)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
