'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatear } from '../dinero'
import {
  calcularVariacionComparativo,
  type DatosComparativo,
  type ConfiguracionUmbral,
  type Variacion,
  type GrupoComparativo,
} from '../repos/comparativos'

export interface CarteraOpcion {
  id: number
  nombre: string
  moneda: string
}

export interface PropsVistaComparativos {
  datos: DatosComparativo
  carterasDisponibles?: CarteraOpcion[]
  avisoRecalculo?: boolean
  onCambiarReferencia?: (periodo: string) => void
  onCambiarUmbral?: (umbral: ConfiguracionUmbral) => void
  onCambiarCartera?: (carteraId: number) => void
}

/**
 * Vista de comparativo entre periodos.
 *
 * Cumple con R1-R4:
 * - R1: Desglose de gasto por sobre y grupo en periodos seleccionados, con diferencias respecto a referencia.
 * - R2: Destaque de variaciones según umbral (importe y porcentaje) con dirección (aumento/disminución).
 *       Aviso explícito "Sin variaciones relevantes" si no hay ninguna.
 * - R3: Notificación de recálculo retroactivo cuando aplique.
 * - R4: Aislamiento por cartera en su propia moneda sin totales cruzados.
 */
export function VistaComparativos({
  datos,
  carterasDisponibles = [],
  avisoRecalculo = false,
  onCambiarReferencia,
  onCambiarUmbral,
  onCambiarCartera,
}: PropsVistaComparativos) {
  const { cartera, periodos } = datos
  const moneda = cartera.moneda

  const [periodoRef, setPeriodoRef] = useState<string>(datos.periodo_referencia)
  const [umbralPct, setUmbralPct] = useState<number>(datos.umbral.porcentaje ?? 20)
  const [umbralMonto, setUmbralMonto] = useState<string>(datos.umbral.importe_absoluto ?? '500.00')
  const [gruposColapsados, setGruposColapsados] = useState<Record<number, boolean>>({})

  const umbralActual: ConfiguracionUmbral = useMemo(() => ({
    porcentaje: umbralPct,
    importe_absoluto: umbralMonto || undefined,
  }), [umbralPct, umbralMonto])

  // Recalcular variaciones dinámicamente si el usuario cambia el periodo de referencia o el umbral
  const datosCalculados = useMemo(() => {
    const elementosDestacados: {
      tipo: 'grupo' | 'sobre'
      id: number
      nombre: string
      periodo: string
      diferencia: string
      diferencia_absoluta: string
      direccion: 'aumento' | 'disminucion' | 'sin_cambio'
      porcentaje: string | null
    }[] = []

    const gruposProcesados: GrupoComparativo[] = datos.grupos.map((g) => {
      const sobresProcesados = g.sobres.map((s) => {
        const variacionesSobre: Record<string, Variacion> = {}
        let sobreTieneDestacada = false
        const refGasto = s.importes_por_periodo[periodoRef] ?? '0.00'

        for (const p of periodos) {
          if (p === periodoRef) continue
          const gastoP = s.importes_por_periodo[p] ?? '0.00'
          const v = calcularVariacionComparativo(p, gastoP, refGasto, umbralActual)
          variacionesSobre[p] = v
          if (v.destacada) {
            sobreTieneDestacada = true
            elementosDestacados.push({
              tipo: 'sobre',
              id: s.id,
              nombre: s.nombre,
              periodo: p,
              diferencia: v.diferencia,
              diferencia_absoluta: v.diferencia_absoluta,
              direccion: v.direccion,
              porcentaje: v.porcentaje,
            })
          }
        }

        return {
          ...s,
          variaciones: variacionesSobre,
          tiene_variacion_destacada: sobreTieneDestacada,
        }
      })

      const variacionesGrupo: Record<string, Variacion> = {}
      let grupoTieneDestacada = false
      const refTotal = g.totales_por_periodo[periodoRef] ?? '0.00'

      for (const p of periodos) {
        if (p === periodoRef) continue
        const totP = g.totales_por_periodo[p] ?? '0.00'
        const v = calcularVariacionComparativo(p, totP, refTotal, umbralActual)
        variacionesGrupo[p] = v
        if (v.destacada) {
          grupoTieneDestacada = true
          elementosDestacados.push({
            tipo: 'grupo',
            id: g.id,
            nombre: g.nombre,
            periodo: p,
            diferencia: v.diferencia,
            diferencia_absoluta: v.diferencia_absoluta,
            direccion: v.direccion,
            porcentaje: v.porcentaje,
          })
        }
      }

      return {
        ...g,
        sobres: sobresProcesados,
        variaciones: variacionesGrupo,
        tiene_variacion_destacada: grupoTieneDestacada,
      }
    })

    const variacionesTotalGeneral: Record<string, Variacion> = {}
    const refTotalGen = datos.total_general_por_periodo[periodoRef] ?? '0.00'
    for (const p of periodos) {
      if (p === periodoRef) continue
      const totP = datos.total_general_por_periodo[p] ?? '0.00'
      variacionesTotalGeneral[p] = calcularVariacionComparativo(p, totP, refTotalGen, umbralActual)
    }

    return {
      grupos: gruposProcesados,
      variacionesTotalGeneral,
      elementosDestacados,
      hayVariacionesDestacadas: elementosDestacados.length > 0,
    }
  }, [datos, periodos, periodoRef, umbralActual])

  const toggleGrupo = (id: number) => {
    setGruposColapsados((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const periodosComparados = periodos.filter((p) => p !== periodoRef)

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-slate-800" data-testid="vista-comparativos">
      {/* Aviso de recálculo retroactivo */}
      {avisoRecalculo && (
        <div
          role="status"
          aria-live="polite"
          data-testid="aviso-recalculo"
          className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r shadow-sm text-sm text-amber-900"
        >
          <div className="flex items-center space-x-2">
            <span className="font-semibold">Aviso de recálculo:</span>
            <span>
              Los resultados de la comparación cambiaron debido a correcciones en movimientos de periodos anteriores.
            </span>
          </div>
        </div>
      )}

      {/* Encabezado y selector de cartera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Comparativo de periodos</h1>
          <p className="text-sm text-slate-500">
            Evolución del gasto y uso de sobres en{' '}
            <span className="font-medium text-slate-700">{cartera.nombre}</span> ({moneda})
          </p>
        </div>

        {carterasDisponibles.length > 1 && (
          <div className="flex items-center space-x-2 text-sm">
            <label htmlFor="selector-cartera-comp" className="text-slate-600 font-medium">
              Cartera:
            </label>
            <select
              id="selector-cartera-comp"
              data-testid="selector-cartera"
              value={cartera.id}
              onChange={(e) => onCambiarCartera?.(Number(e.target.value))}
              className="border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {carterasDisponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Barra de controles: Periodo de referencia y Umbral */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <label htmlFor="select-periodo-ref" className="block font-semibold text-slate-700 mb-1">
            Periodo de referencia
          </label>
          <select
            id="select-periodo-ref"
            data-testid="selector-referencia"
            value={periodoRef}
            onChange={(e) => {
              const nuevo = e.target.value
              setPeriodoRef(nuevo)
              onCambiarReferencia?.(nuevo)
            }}
            className="w-full border border-slate-300 rounded px-3 py-2 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
          >
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p} {p === periodoRef ? '(Referencia actual)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="input-umbral-pct" className="block font-semibold text-slate-700 mb-1">
            Umbral porcentaje (%)
          </label>
          <input
            id="input-umbral-pct"
            data-testid="input-umbral-porcentaje"
            type="number"
            min="1"
            max="1000"
            value={umbralPct}
            onChange={(e) => {
              const val = Number(e.target.value) || 0
              setUmbralPct(val)
              onCambiarUmbral?.({ ...umbralActual, porcentaje: val })
            }}
            className="w-full border border-slate-300 rounded px-3 py-2 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="input-umbral-monto" className="block font-semibold text-slate-700 mb-1">
            Umbral importe absoluto ({moneda})
          </label>
          <input
            id="input-umbral-monto"
            data-testid="input-umbral-importe"
            type="text"
            value={umbralMonto}
            onChange={(e) => {
              const val = e.target.value
              setUmbralMonto(val)
              onCambiarUmbral?.({ ...umbralActual, importe_absoluto: val })
            }}
            className="w-full border border-slate-300 rounded px-3 py-2 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Sección: Variaciones relevantes destacadas */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900">Variaciones relevantes</h2>
          <span className="text-xs text-slate-500">
            Criterio: &gt;= {umbralPct}% o &gt;= {formatear(umbralMonto, moneda)} vs {periodoRef}
          </span>
        </div>

        {datosCalculados.hayVariacionesDestacadas ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="contenedor-variaciones-destacadas">
            {datosCalculados.elementosDestacados.map((item, idx) => {
              const esAumento = item.direccion === 'aumento'
              return (
                <div
                  key={`${item.tipo}-${item.id}-${item.periodo}-${idx}`}
                  data-testid="tarjeta-variacion-destacada"
                  className={`p-3.5 rounded-lg border flex flex-col justify-between ${
                    esAumento
                      ? 'bg-rose-50/50 border-rose-200 text-rose-950'
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs uppercase tracking-wider font-semibold opacity-75">
                        {item.tipo === 'grupo' ? 'Grupo' : 'Sobre'}
                      </span>
                      <p className="font-bold text-base text-slate-900">{item.nombre}</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        esAumento ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {item.direccion === 'aumento' ? 'Aumento' : 'Disminución'}
                    </span>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex justify-between items-baseline text-sm">
                    <span className="text-slate-600 font-medium">En {item.periodo}:</span>
                    <div className="text-right">
                      <span className="font-bold">
                        {esAumento ? '+' : '-'}
                        {formatear(item.diferencia_absoluta, moneda)}
                      </span>
                      {item.porcentaje && (
                        <span className="text-xs ml-1.5 opacity-80">({item.porcentaje})</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div
            data-testid="sin-variaciones-relevantes"
            className="p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg text-slate-500"
          >
            <p className="font-medium text-slate-700">Sin variaciones relevantes</p>
            <p className="text-xs mt-1">Ningún sobre ni grupo supera el umbral configurado respecto a {periodoRef}.</p>
          </div>
        )}
      </section>

      {/* Matriz comparativa detallada por grupos y sobres */}
      <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900">Desglose de gastos por categoría</h2>
          <span className="text-xs text-slate-500">Excluye traspasos entre cuentas</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600">
                <th className="p-3 font-semibold">Categoría / Sobre</th>
                <th className="p-3 text-right font-semibold">
                  {periodoRef} <span className="text-xs text-blue-600 font-normal">(Ref)</span>
                </th>
                {periodosComparados.map((p) => (
                  <th key={p} className="p-3 text-right font-semibold" colSpan={2}>
                    {p}
                  </th>
                ))}
              </tr>
              {periodosComparados.length > 0 && (
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="p-1.5"></th>
                  <th className="p-1.5 text-right font-normal">Gasto</th>
                  {periodosComparados.map((p) => (
                    <React.Fragment key={`sub-${p}`}>
                      <th className="p-1.5 text-right font-normal">Gasto</th>
                      <th className="p-1.5 text-right font-normal">Diferencia</th>
                    </React.Fragment>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {datosCalculados.grupos.map((grupo) => {
                const colapsado = gruposColapsados[grupo.id]
                return (
                  <React.Fragment key={`grupo-${grupo.id}`}>
                    {/* Fila del Grupo */}
                    <tr
                      data-testid={`fila-grupo-${grupo.id}`}
                      className="bg-slate-50/80 font-semibold border-b border-slate-200 hover:bg-slate-100/80 cursor-pointer"
                      onClick={() => toggleGrupo(grupo.id)}
                    >
                      <td className="p-3 flex items-center space-x-2">
                        <span className="text-xs text-slate-400">{colapsado ? '▶' : '▼'}</span>
                        <span className="text-slate-900">{grupo.nombre}</span>
                        {grupo.tiene_variacion_destacada && (
                          <span className="text-xs px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-normal">
                            Variación
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatear(grupo.totales_por_periodo[periodoRef] ?? '0.00', moneda)}
                      </td>
                      {periodosComparados.map((p) => {
                        const v = grupo.variaciones[p]
                        const esAumento = v?.direccion === 'aumento'
                        return (
                          <React.Fragment key={`g-${grupo.id}-${p}`}>
                            <td className="p-3 text-right font-mono text-slate-700">
                              {formatear(grupo.totales_por_periodo[p] ?? '0.00', moneda)}
                            </td>
                            <td className="p-3 text-right font-mono text-xs">
                              {v ? (
                                <span
                                  className={
                                    v.destacada
                                      ? esAumento
                                        ? 'text-rose-600 font-bold'
                                        : 'text-emerald-600 font-bold'
                                      : 'text-slate-500'
                                  }
                                >
                                  {esAumento ? '+' : ''}
                                  {formatear(v.diferencia, moneda)}
                                  {v.porcentaje && ` (${v.porcentaje})`}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>

                    {/* Filas de Sobres */}
                    {!colapsado &&
                      grupo.sobres.map((sobre) => (
                        <tr
                          key={`sobre-${sobre.id}`}
                          data-testid={`fila-sobre-${sobre.id}`}
                          className="border-b border-slate-100 hover:bg-slate-50/50 text-slate-700"
                        >
                          <td className="p-3 pl-8 text-sm flex items-center space-x-2">
                            <span>{sobre.nombre}</span>
                            {sobre.archivado && (
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded">
                                Archivado
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            {formatear(sobre.importes_por_periodo[periodoRef] ?? '0.00', moneda)}
                          </td>
                          {periodosComparados.map((p) => {
                            const v = sobre.variaciones[p]
                            const esAumento = v?.direccion === 'aumento'
                            return (
                              <React.Fragment key={`s-${sobre.id}-${p}`}>
                                <td className="p-3 text-right font-mono text-sm text-slate-600">
                                  {formatear(sobre.importes_por_periodo[p] ?? '0.00', moneda)}
                                </td>
                                <td className="p-3 text-right font-mono text-xs">
                                  {v ? (
                                    <span
                                      className={
                                        v.destacada
                                          ? esAumento
                                            ? 'text-rose-600 font-bold'
                                            : 'text-emerald-600 font-bold'
                                          : 'text-slate-500'
                                      }
                                    >
                                      {esAumento ? '+' : ''}
                                      {formatear(v.diferencia, moneda)}
                                      {v.porcentaje && ` (${v.porcentaje})`}
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </React.Fragment>
                            )
                          })}
                        </tr>
                      ))}
                  </React.Fragment>
                )
              })}
            </tbody>
            <tfoot>
              {/* Total General */}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                <td className="p-3">Total General</td>
                <td className="p-3 text-right font-mono">
                  {formatear(datos.total_general_por_periodo[periodoRef] ?? '0.00', moneda)}
                </td>
                {periodosComparados.map((p) => {
                  const v = datosCalculados.variacionesTotalGeneral[p]
                  const esAumento = v?.direccion === 'aumento'
                  return (
                    <React.Fragment key={`tot-gen-${p}`}>
                      <td className="p-3 text-right font-mono text-slate-900">
                        {formatear(datos.total_general_por_periodo[p] ?? '0.00', moneda)}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {v ? (
                          <span
                            className={
                              v.destacada
                                ? esAumento
                                  ? 'text-rose-600'
                                  : 'text-emerald-600'
                                : 'text-slate-600'
                            }
                          >
                            {esAumento ? '+' : ''}
                            {formatear(v.diferencia, moneda)}
                            {v.porcentaje && ` (${v.porcentaje})`}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </React.Fragment>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  )
}
