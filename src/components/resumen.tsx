'use client'

import { useState } from 'react'
import { absDinero, esCero, esNegativo, formatear } from '../dinero'
import { aCentimos, deCentimos } from '../patrimonio/calculos'
import type {
  CarteraResumen,
  ComercioResumen,
  DatosResumenGlobal,
  GrupoMoneda,
  PuntoFlujo,
} from '../repos/resumen-global'
import estilos from './resumen.module.css'
import producto from './producto.module.css'

/**
 * Resumen global, agrupado por moneda.
 *
 * Un bloque por moneda, nunca un total mezclado: el sistema no tiene tipo de cambio, asi
 * que sumar MXN con USD daria un numero que no existe (`panel` R11). Con varias monedas el
 * usuario elige cual mira; con una sola, el bloque aparece directo.
 *
 * Es de solo lectura. El unico control que envia algo es el mes, y es un filtro de la
 * vista: no toca ningun dato.
 */
export function VistaResumen({ datos }: { datos: DatosResumenGlobal }) {
  const [monedaActiva, setMonedaActiva] = useState(datos.grupos[0]?.moneda ?? '')
  const grupo = datos.grupos.find((g) => g.moneda === monedaActiva) ?? datos.grupos[0]

  return (
    <div className={estilos.vista}>
      <header className={producto.encabezado}>
        <h1 className={producto.titulo}>Resumen</h1>
        <p className={producto.bajada}>
          Todo tu dinero, agrupado por moneda. Las carteras de monedas distintas nunca se suman
          entre si.
        </p>

        <form method="get" action="/resumen" className={estilos.periodoForm}>
          <label htmlFor="resumen-mes" className={estilos.periodoEtiqueta}>
            Mes
          </label>
          <input id="resumen-mes" type="month" name="mes" defaultValue={datos.periodo} />
          <button type="submit">Ver</button>
        </form>
      </header>

      {datos.grupos.length > 1 ? (
        <div className={estilos.monedas} role="tablist" aria-label="Moneda">
          {datos.grupos.map((g) => {
            const activa = g.moneda === grupo?.moneda
            return (
              <button
                key={g.moneda}
                type="button"
                role="tab"
                aria-selected={activa}
                className={`${estilos.monedaPestana} ${activa ? estilos.monedaActiva : ''}`}
                onClick={() => setMonedaActiva(g.moneda)}
              >
                {g.moneda}
              </button>
            )
          })}
        </div>
      ) : null}

      {grupo ? (
        <GrupoVista grupo={grupo} periodo={datos.periodo} />
      ) : (
        <p className={estilos.vacio}>Todavia no tienes carteras.</p>
      )}
    </div>
  )
}

function GrupoVista({ grupo, periodo }: { grupo: GrupoMoneda; periodo: string }) {
  const { moneda } = grupo

  const tonoNeto = esCero(grupo.flujo.neto)
    ? undefined
    : esNegativo(grupo.flujo.neto)
      ? 'riesgo'
      : 'ingreso'

  return (
    <>
      <section className={producto.tarjeta}>
        <h2 className={producto.seccionTitulo}>Capital en {moneda}</h2>
        <p className={producto.seccionBajada}>
          Al cierre del periodo. Suma solo carteras en {moneda}.
        </p>

        <div className={estilos.cifras}>
          <Cifra etiqueta="Patrimonio" valor={formatear(grupo.capital.patrimonio, moneda)} destacada />
          <Cifra etiqueta="En sobres" valor={formatear(grupo.capital.en_sobres, moneda)} />
          <Cifra etiqueta="Sin asignar" valor={formatear(grupo.capital.dinero_suelto, moneda)} />
        </div>

        <div className={estilos.cifrasMenor}>
          <Cifra
            etiqueta="Ingresos del mes"
            valor={`+${formatear(grupo.flujo.ingresado, moneda)}`}
            tono="ingreso"
          />
          <Cifra
            etiqueta="Gastos del mes"
            valor={`-${formatear(absDinero(grupo.flujo.gastado), moneda)}`}
            tono="gasto"
          />
          <Cifra etiqueta="Neto del mes" valor={formatear(grupo.flujo.neto, moneda)} tono={tonoNeto} />
        </div>
      </section>

      <TablaCarteras carteras={grupo.carteras} moneda={moneda} />

      <TablaSerie
        titulo="Ultimos 12 meses"
        bajada="Ingresos, gastos y neto mes a mes."
        puntos={grupo.mensual}
        moneda={moneda}
      />

      <TablaSerie
        titulo="Por anio"
        bajada="El acumulado de cada anio con actividad."
        puntos={grupo.anual}
        moneda={moneda}
      />

      <BarrasDiario puntos={grupo.diario} moneda={moneda} periodo={periodo} />

      <TablaComercios comercios={grupo.top_comercios} moneda={moneda} />
    </>
  )
}

function Cifra({
  etiqueta,
  valor,
  tono,
  destacada = false,
}: {
  etiqueta: string
  valor: string
  tono?: 'ingreso' | 'gasto' | 'riesgo'
  destacada?: boolean
}) {
  const claseTono =
    tono === 'ingreso'
      ? estilos.ingreso
      : tono === 'gasto'
        ? estilos.gasto
        : tono === 'riesgo'
          ? estilos.riesgo
          : ''

  return (
    <div className={estilos.cifra}>
      <span className={estilos.cifraEtiqueta}>{etiqueta}</span>
      <span
        className={`${estilos.cifraValor} ${destacada ? estilos.cifraVela : ''} ${claseTono}`}
      >
        {valor}
      </span>
    </div>
  )
}

function TablaCarteras({ carteras, moneda }: { carteras: CarteraResumen[]; moneda: string }) {
  return (
    <section className={producto.tarjeta}>
      <h2 className={producto.seccionTitulo}>Carteras en {moneda}</h2>
      <p className={producto.seccionBajada}>El desglose de todo lo que suma el capital de arriba.</p>

      {carteras.length === 0 ? (
        <p className={estilos.vacio}>Sin carteras en {moneda}.</p>
      ) : (
        <div className={estilos.tablaScroll}>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th>Cartera</th>
                <th>Moneda</th>
                <th className={estilos.num}>Patrimonio</th>
                <th className={estilos.num}>En sobres</th>
                <th className={estilos.num}>Sin asignar</th>
              </tr>
            </thead>
            <tbody>
              {carteras.map((cartera) => (
                <tr key={cartera.id}>
                  <td>
                    {cartera.nombre}
                    {cartera.archivada ? <span className={estilos.etiqueta}>archivada</span> : null}
                  </td>
                  <td>{cartera.moneda}</td>
                  <td className={estilos.num}>{formatear(cartera.patrimonio, moneda)}</td>
                  <td className={estilos.num}>{formatear(cartera.en_sobres, moneda)}</td>
                  <td
                    className={`${estilos.num} ${esNegativo(cartera.dinero_suelto) ? estilos.riesgo : ''}`}
                  >
                    {formatear(cartera.dinero_suelto, moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TablaSerie({
  titulo,
  bajada,
  puntos,
  moneda,
}: {
  titulo: string
  bajada: string
  puntos: PuntoFlujo[]
  moneda: string
}) {
  return (
    <section className={producto.tarjeta}>
      <h2 className={producto.seccionTitulo}>{titulo}</h2>
      <p className={producto.seccionBajada}>{bajada}</p>

      {puntos.length === 0 ? (
        <p className={estilos.vacio}>Sin movimientos todavia.</p>
      ) : (
        <div className={estilos.tablaScroll}>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th>Periodo</th>
                <th className={estilos.num}>Ingresos</th>
                <th className={estilos.num}>Gastos</th>
                <th className={estilos.num}>Neto</th>
              </tr>
            </thead>
            <tbody>
              {puntos.map((punto) => (
                <tr key={punto.clave}>
                  <td>{punto.clave}</td>
                  <td className={estilos.num}>{formatear(punto.ingresado, moneda)}</td>
                  <td className={estilos.num}>{formatear(punto.gastado, moneda)}</td>
                  <td
                    className={`${estilos.num} ${
                      esCero(punto.neto) ? '' : esNegativo(punto.neto) ? estilos.riesgo : estilos.ingreso
                    }`}
                  >
                    {formatear(punto.neto, moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function BarrasDiario({
  puntos,
  moneda,
  periodo,
}: {
  puntos: PuntoFlujo[]
  moneda: string
  periodo: string
}) {
  const maxCentimos = puntos.reduce((max, punto) => {
    const cent = aCentimos(punto.gastado)
    return cent > max ? cent : max
  }, 0n)

  return (
    <section className={producto.tarjeta}>
      <h2 className={producto.seccionTitulo}>Gasto diario</h2>
      <p className={producto.seccionBajada}>
        Cada barra es el gasto de un dia del periodo. La linea de base es cero.
      </p>

      <div className={estilos.barras} role="img" aria-label="Gasto por dia del periodo">
        {puntos.map((punto) => {
          const cent = aCentimos(punto.gastado)
          const porcentaje = maxCentimos === 0n ? 0 : Number((cent * 100n) / maxCentimos)
          const dia = punto.clave.slice(-2)
          return (
            <span key={punto.clave} className={estilos.columna}>
              <span
                className={estilos.barra}
                style={{ height: `${porcentaje > 0 ? Math.max(porcentaje, 4) : 0}%` }}
                title={`${punto.clave}: ${formatear(punto.gastado, moneda)}`}
              />
              <span className={estilos.barraDia} aria-hidden="true">
                {dia}
              </span>
            </span>
          )
        })}
      </div>

      <p className={estilos.barraPie}>
        Dia con mas gasto: {formatear(deCentimos(maxCentimos), moneda)}
        {periodo ? ` en ${periodo}` : ''}.
      </p>
    </section>
  )
}

function TablaComercios({
  comercios,
  moneda,
}: {
  comercios: ComercioResumen[]
  moneda: string
}) {
  const totalCentimos = comercios.reduce((total, comercio) => total + aCentimos(comercio.gastado), 0n)

  return (
    <section className={producto.tarjeta}>
      <h2 className={producto.seccionTitulo}>Top comercios</h2>
      <p className={producto.seccionBajada}>
        Los gastos del periodo que tienen comercio, de mayor a menor.
      </p>

      {comercios.length === 0 ? (
        <p className={estilos.vacio}>Sin gastos con comercio en el periodo.</p>
      ) : (
        <div className={estilos.tablaScroll}>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th>Comercio</th>
                <th className={estilos.num}>Operaciones</th>
                <th className={estilos.num}>Gastado</th>
                <th className={estilos.num}>% del gasto</th>
              </tr>
            </thead>
            <tbody>
              {comercios.map((comercio) => {
                const porcentaje =
                  totalCentimos === 0n
                    ? 0
                    : Number((aCentimos(comercio.gastado) * 10000n) / totalCentimos) / 100
                return (
                  <tr key={comercio.comercio}>
                    <td>{comercio.comercio}</td>
                    <td className={estilos.num}>{comercio.operaciones}</td>
                    <td className={estilos.num}>{formatear(comercio.gastado, moneda)}</td>
                    <td className={estilos.num}>{porcentaje.toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
