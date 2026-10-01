'use client'

import React, { useState } from 'react'
import { formatear, type Dinero } from '../dinero'
import type { HistorialPatrimonio, PuntoPatrimonio } from '../repos/patrimonio'
import { MENSAJE_HISTORIA_MODIFICADA } from '../patrimonio/retroactividad'
import detalle from './detalle.module.css'

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
    <div className={detalle.patrimonio}>
      <div className={detalle.patrimonioRotulo}>
        Patrimonio {periodo ? `(${periodo})` : ''}
      </div>
      <div className={detalle.patrimonioCifra}>{formatear(patrimonio, moneda)}</div>

      {/*
        La invariante va escrita y no solo insinuada: `patrimonio = en sobres + dinero suelto`.
        Con los tres numeros a la vista, el usuario puede comprobar la suma sin abrir nada; el
        boton solo hace explicito el desglose.
      */}
      <div className={detalle.patrimonioDesglose}>
        <button
          type="button"
          onClick={() => setDetallesAbiertos((v) => !v)}
          className={detalle.enlaceAccion}
          aria-expanded={detallesAbiertos}
        >
          <span>
            = {formatear(enSobres, moneda)} en sobres + {formatear(dineroSuelto, moneda)} sin asignar
          </span>
          <span className={detalle.caret}>{detallesAbiertos ? '▲' : '▼'}</span>
        </button>
      </div>

      {detallesAbiertos && (
        <div className={detalle.patrimonioDetalles}>
          <div className={detalle.patrimonioPieza}>
            <span className={detalle.patrimonioPiezaRotulo}>Disponible en sobres:</span>
            <span className={detalle.patrimonioPiezaCifra}>{formatear(enSobres, moneda)}</span>
          </div>
          <div className={detalle.patrimonioPieza}>
            <span className={detalle.patrimonioPiezaRotulo}>Dinero suelto (sin asignar):</span>
            <span className={detalle.patrimonioPiezaCifra}>{formatear(dineroSuelto, moneda)}</span>
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
      <div className={detalle.vacioCentrado}>
        No hay registros históricos de patrimonio en esta cartera.
      </div>
    )
  }

  return (
    <div className={detalle.patrimonio}>
      {avisoRetroactivo && <AvisoHistoriaModificada />}

      <div className={detalle.encabezadoTabla}>
        <div>
          <h2 className={detalle.itemNombre}>Evolución del Patrimonio</h2>
          <p className={detalle.itemDetalle}>
            Cartera: {nombre_cartera} ({moneda})
          </p>
        </div>
        <span className={detalle.pill}>
          {periodos.length} {periodos.length === 1 ? 'periodo' : 'periodos'}
        </span>
      </div>

      {/*
        `overflow-x-auto` con tabla de ancho minimo: cinco columnas de importes no entran en un
        movil, y dejar que la tabla se desplace horizontalmente es preferible a ocultar la
        columna de variacion, que es la que el usuario vino a ver.
      */}
      <div className={detalle.tablaContenedor}>
        <table className={detalle.tabla}>
          <thead>
            <tr className={detalle.tablaCabecera}>
              <th className={detalle.th}>Periodo</th>
              <th className={`${detalle.th} ${detalle.thDerecha}`}>En Sobres</th>
              <th className={`${detalle.th} ${detalle.thDerecha}`}>Dinero Suelto</th>
              <th className={`${detalle.th} ${detalle.thDerecha}`}>Patrimonio</th>
              <th className={`${detalle.th} ${detalle.thDerecha}`}>Variación</th>
            </tr>
          </thead>
          <tbody>
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
    <tr className={detalle.tr}>
      <td className={`${detalle.td} ${detalle.tdFuerte}`}>{punto.periodo}</td>
      <td className={`${detalle.td} ${detalle.tdDerecha} ${detalle.tenue}`}>
        {formatear(punto.disponible_sobres, moneda)}
      </td>
      <td className={`${detalle.td} ${detalle.tdDerecha} ${detalle.tenue}`}>
        {formatear(punto.dinero_suelto, moneda)}
      </td>
      <td className={`${detalle.td} ${detalle.tdDerecha} ${detalle.tdFuerte}`}>
        {formatear(punto.patrimonio, moneda)}
      </td>
      <td className={`${detalle.td} ${detalle.tdDerecha}`}>
        {esPrimero ? (
          <span className={detalle.notaCorta}>Primer periodo</span>
        ) : tieneVariacion ? (
          /*
            El signo del porcentaje ya dice la direccion: el color acompana. Un usuario que no
            distingue el verde del rojo lee "+12.3%" igual que uno que si.
          */
          <span
            className={`${detalle.pill} ${
              esPositivo ? detalle.positivo : esNegativo ? detalle.negativo : ''
            }`}
          >
            <span>{punto.porcentaje_texto}</span>
            <span className={detalle.notaCortaClara}>
              ({punto.diferencia_absoluta && formatear(punto.diferencia_absoluta, moneda)})
            </span>
          </span>
        ) : (
          <span className={detalle.notaCorta}>-</span>
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
    <div role="alert" className={detalle.avisoHistoria}>
      <div className={detalle.acciones}>
        <span className={detalle.avisoHistoriaIcono} aria-hidden="true">
          ℹ
        </span>
        <span>{mensaje}</span>
      </div>
    </div>
  )
}
