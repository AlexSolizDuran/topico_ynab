'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatear } from '../dinero'
import estilos from './comparativos.module.css'
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
    <div className={estilos.vista} data-testid="vista-comparativos">
      {/*
        El aviso de recalculo usa `role="status"` y no una clase propia a proposito: el tema
        oscuro lo pinta por ese atributo, igual que los avisos de error. Asi el mismo estado se
        ve igual aca que en cualquier formulario.
      */}
      {avisoRecalculo && (
        <div role="status" aria-live="polite" data-testid="aviso-recalculo">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Aviso de recálculo:</span>
            <span>
              Los resultados de la comparación cambiaron debido a correcciones en movimientos de periodos anteriores.
            </span>
          </div>
        </div>
      )}

      {/* Encabezado y selector de cartera */}
      <div className={estilos.encabezado}>
        <div>
          <h1 className={estilos.titulo}>Comparativo de periodos</h1>
          <p className={estilos.bajada}>
            Evolución del gasto y uso de sobres en{' '}
            <span className={estilos.carteraNombre}>{cartera.nombre}</span> ({moneda})
          </p>
        </div>

        {carterasDisponibles.length > 1 && (
          <div className={estilos.selector}>
            <label htmlFor="selector-cartera-comp" className={estilos.etiqueta}>
              Cartera:
            </label>
            <select
              id="selector-cartera-comp"
              data-testid="selector-cartera"
              value={cartera.id}
              onChange={(e) => onCambiarCartera?.(Number(e.target.value))}
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
      <div className={estilos.controles}>
        <div className={estilos.control}>
          <label htmlFor="select-periodo-ref" className={estilos.controlEtiqueta}>
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
          >
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p} {p === periodoRef ? '(Referencia actual)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className={estilos.control}>
          <label htmlFor="input-umbral-pct" className={estilos.controlEtiqueta}>
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
          />
        </div>

        <div className={estilos.control}>
          <label htmlFor="input-umbral-monto" className={estilos.controlEtiqueta}>
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
          />
        </div>
      </div>

      {/* Sección: Variaciones relevantes destacadas */}
      <section className={estilos.tarjeta}>
        <div className={estilos.tarjetaCabecera}>
          <h2 className={estilos.seccionTitulo}>Variaciones relevantes</h2>
          <span className={estilos.seccionNota}>
            Criterio: &gt;= {umbralPct}% o &gt;= {formatear(umbralMonto, moneda)} vs {periodoRef}
          </span>
        </div>

        {datosCalculados.hayVariacionesDestacadas ? (
          <div className={estilos.destacadas} data-testid="contenedor-variaciones-destacadas">
            {datosCalculados.elementosDestacados.map((item, idx) => {
              const esAumento = item.direccion === 'aumento'
              return (
                <div
                  key={`${item.tipo}-${item.id}-${item.periodo}-${idx}`}
                  data-testid="tarjeta-variacion-destacada"
                  className={`${estilos.destacada} ${
                    esAumento ? estilos.destacadaAumento : estilos.destacadaDisminucion
                  }`}
                >
                  <div className={estilos.destacadaTop}>
                    <div>
                      <span className={estilos.destacadaTipo}>
                        {item.tipo === 'grupo' ? 'Grupo' : 'Sobre'}
                      </span>
                      <p className={estilos.destacadaNombre}>{item.nombre}</p>
                    </div>
                    {/* El chip repite en texto lo que el borde dice en color. */}
                    <span
                      className={`${estilos.chip} ${
                        esAumento ? estilos.chipAumento : estilos.chipDisminucion
                      }`}
                    >
                      {item.direccion === 'aumento' ? 'Aumento' : 'Disminución'}
                    </span>
                  </div>

                  <div className={estilos.destacadaPie}>
                    <span className={estilos.destacadaPeriodo}>En {item.periodo}:</span>
                    <div className={estilos.derecha}>
                      <span className={estilos.destacadaValor}>
                        {esAumento ? '+' : '-'}
                        {formatear(item.diferencia_absoluta, moneda)}
                      </span>
                      {item.porcentaje && (
                        <span className={estilos.destacadaPorcentaje}>({item.porcentaje})</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div data-testid="sin-variaciones-relevantes" className={estilos.vacio}>
            <p className={estilos.vacioTitulo}>Sin variaciones relevantes</p>
            <p className={estilos.vacioTexto}>
              Ningún sobre ni grupo supera el umbral configurado respecto a {periodoRef}.
            </p>
          </div>
        )}
      </section>

      {/* Matriz comparativa detallada por grupos y sobres */}
      <section className={estilos.tablaCaja}>
        <div className={estilos.tablaCabecera}>
          <h2 className={estilos.seccionTitulo}>Desglose de gastos por categoría</h2>
          <span className={estilos.seccionNota}>Excluye traspasos entre cuentas</span>
        </div>

        <div className={estilos.tablaScroll}>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th>Categoría / Sobre</th>
                <th className={estilos.derecha}>
                  {periodoRef} <span className={estilos.ref}>(Ref)</span>
                </th>
                {periodosComparados.map((p) => (
                  <th key={p} className={estilos.derecha} colSpan={2}>
                    {p}
                  </th>
                ))}
              </tr>
              {periodosComparados.length > 0 && (
                <tr>
                  <th />
                  <th className={estilos.derecha}>Gasto</th>
                  {periodosComparados.map((p) => (
                    <React.Fragment key={`sub-${p}`}>
                      <th className={estilos.derecha}>Gasto</th>
                      <th className={estilos.derecha}>Diferencia</th>
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
                      className={`${estilos.fila} ${estilos.filaGrupo}`}
                      onClick={() => toggleGrupo(grupo.id)}
                    >
                      <td className={estilos.celdaNombre}>
                        <span className={estilos.caret}>{colapsado ? '▶' : '▼'}</span>
                        <span className={estilos.celdaGrupo}>{grupo.nombre}</span>
                        {grupo.tiene_variacion_destacada && (
                          <span className={estilos.badgeVariacion}>Variación</span>
                        )}
                      </td>
                      <td className={estilos.derecha}>
                        {formatear(grupo.totales_por_periodo[periodoRef] ?? '0.00', moneda)}
                      </td>
                      {periodosComparados.map((p) => {
                        const v = grupo.variaciones[p]
                        const esAumento = v?.direccion === 'aumento'
                        return (
                          <React.Fragment key={`g-${grupo.id}-${p}`}>
                            <td className={estilos.importe}>
                              {formatear(grupo.totales_por_periodo[p] ?? '0.00', moneda)}
                            </td>
                            <td className={estilos.derecha}>
                              {v ? (
                                <span
                                  className={
                                    v.destacada
                                      ? esAumento
                                        ? estilos.aumento
                                        : estilos.disminucion
                                      : estilos.neutro
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
                          className={estilos.fila}
                        >
                          <td className={`${estilos.celdaNombre} ${estilos.celdaSobre}`}>
                            <span>{sobre.nombre}</span>
                            {sobre.archivado && (
                              <span className={estilos.badgeArchivado}>Archivado</span>
                            )}
                          </td>
                          <td className={estilos.derecha}>
                            {formatear(sobre.importes_por_periodo[periodoRef] ?? '0.00', moneda)}
                          </td>
                          {periodosComparados.map((p) => {
                            const v = sobre.variaciones[p]
                            const esAumento = v?.direccion === 'aumento'
                            return (
                              <React.Fragment key={`s-${sobre.id}-${p}`}>
                                <td className={estilos.importe}>
                                  {formatear(sobre.importes_por_periodo[p] ?? '0.00', moneda)}
                                </td>
                                <td className={estilos.derecha}>
                                  {v ? (
                                    <span
                                      className={
                                        v.destacada
                                          ? esAumento
                                            ? estilos.aumento
                                            : estilos.disminucion
                                          : estilos.neutro
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
              <tr className={estilos.total}>
                <td>Total General</td>
                <td className={estilos.derecha}>
                  {formatear(datos.total_general_por_periodo[periodoRef] ?? '0.00', moneda)}
                </td>
                {periodosComparados.map((p) => {
                  const v = datosCalculados.variacionesTotalGeneral[p]
                  const esAumento = v?.direccion === 'aumento'
                  return (
                    <React.Fragment key={`tot-gen-${p}`}>
                      <td className={estilos.importe}>
                        {formatear(datos.total_general_por_periodo[p] ?? '0.00', moneda)}
                      </td>
                      <td className={estilos.derecha}>
                        {v ? (
                          <span
                            className={
                              v.destacada
                                ? esAumento
                                  ? estilos.aumento
                                  : estilos.disminucion
                                : estilos.neutro
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
