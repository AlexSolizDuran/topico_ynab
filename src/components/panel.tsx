'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatear } from '../dinero'
import type { DatosPanel } from '../repos/panel'
import estilos from './panel.module.css'
import tema from './tema-oscuro.module.css'

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
 *
 * El formato vive en `panel.module.css`. Este archivo decide que se muestra y con que regla
 * de negocio; el color y el espaciado, alla.
 */
export function PanelResumen({
  datos,
  carterasDisponibles = [],
  avisoRecalculo = false,
}: PropsPanelResumen) {
  const {
    cartera,
    periodo,
    patrimonio,
    dinero_suelto,
    cuentas,
    grupos,
    totales_periodo,
    pendientes_asignacion,
    metas_activas,
  } = datos
  const moneda = cartera.moneda

  const [desglosePatrimonioAbierto, setDesglosePatrimonioAbierto] = useState(false)
  const [archivadasAbiertas, setArchivadasAbiertas] = useState(false)
  const [gruposColapsados, setGruposColapsados] = useState<Record<number, boolean>>({})

  const toggleGrupo = (id: number) => {
    setGruposColapsados((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const rutaCartera = `/cartera/${cartera.id}`

  return (
    <main className={`${estilos.panel} ${tema.oscuro}`}>
      <div aria-hidden="true" className={tema.rejilla} />
      <div aria-hidden="true" className={tema.aurora} />
      <div aria-hidden="true" className={tema.grano} />

      <div className={estilos.contenido}>
        {/* Aviso de recálculo retroactivo */}
        {avisoRecalculo ? (
          <p role="status" className={estilos.aviso}>
            <span aria-hidden="true">i</span>
            <span>
              Los valores mostrados han sido recalculados tras registrar o modificar
              operaciones de periodos anteriores.
            </span>
          </p>
        ) : null}

        {/*
          Cartera activa, periodo y selector, en una sola fila.

          El enlace de cambio va a `/panel?cartera=<id>`, NO a `/cartera/<id>`: el requisito de
          cambiar cartera es "desde el propio panel", asi que cambiar tiene que dejar al
          usuario en el panel de la nueva cartera. Mandarlo a la pagina de detalle lo saca
          del panel y contradice el spec.

          Con una sola cartera no se muestra el grupo de cambio: no hay nada que elegir, y un
          selector de una opcion es ruido. El enlace a /carteras es lo que resuelve "quiero
          ver mis carteras" y "quiero crear otra".
        */}
        <header className={estilos.barraSuperior}>
          <div className={estilos.barraTitulo}>
            {/*
              "Cartera activa" sobre el nombre: con varias carteras, el nombre solo no dice si
              lo que se mira es esta o la otra. Es la unica etiqueta de la barra y por eso va
              en versalitas apagadas: informa, no compite con el nombre.
            */}
            <span className={estilos.barraEtiqueta}>Cartera activa</span>
            <h1 className={estilos.cartera}>{cartera.nombre}</h1>
            <span className={estilos.moneda}>{moneda}</span>
            {/*
              El periodo lleva "Mes:" adelante. El valor crudo, "2026-03", no dice si es un mes,
              un trimestre o un ejercicio, y es el dato que decide que sobres aparecen en el
              resumen.
            */}
            <span className={estilos.periodo}>Mes: {periodo}</span>
          </div>

          <div className={estilos.barraAcciones}>
            {carterasDisponibles.length > 1 ? (
              /*
               * Selector, no una lista de enlaces. Con varias carteras, los enlaces empujaban
               * un boton por cada una y la barra crecia con el numero de carteras; el
               * desplegable ocupa lo mismo con dos que con diez. La cartera que ya se esta
               * mirando es la opcion seleccionada, para que el control muestre el estado actual.
               *
               * Es un `<form method="get">` nativo y no un `router.push`: la pagina del panel
               * es un componente de servidor, y un GET vuelve a pedirla con la cartera nueva
               * sin arrastrar estado del cliente —que es justo lo que pide "al cambiar, no se
               * conserva importe de la cartera anterior" (R10)—. Al no usar `useRouter`, la
               * vista se puede renderizar en servidor sin contexto de router. El `mes` NO se
               * conserva a proposito: cambiar de cartera abre su periodo actual.
               */
              <form method="get" action="/panel" className={estilos.selectorCartera}>
                <label htmlFor="panel-cartera" className={estilos.selectorEtiqueta}>
                  Cambiar de cartera
                </label>
                <select
                  id="panel-cartera"
                  name="cartera"
                  className={estilos.selector}
                  defaultValue={cartera.id}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                >
                  {carterasDisponibles.map((c) => (
                    /*
                     * Nombre y moneda entre parentesis, no separados por un punto: es el
                     * formato que distingue dos carteras con el mismo nombre en monedas
                     * distintas, y el punto se leia como un separador de etiqueta.
                     */
                    <option key={c.id} value={c.id}>
                      {`${c.nombre} (${c.moneda})`}
                    </option>
                  ))}
                </select>
              </form>
            ) : null}

            <Link href="/carteras" className={`${estilos.cambio} ${estilos.cambioActual}`}>
              {carterasDisponibles.length > 1 ? 'Ver carteras' : 'Crear otra cartera'}
            </Link>
          </div>
        </header>

        {/*
          Las cifras.

          Los importes que el usuario compara entre si van en una sola grilla con divisores,
          no en cuatro tarjetas apiladas: patrimonio y dinero suelto en la fila de arriba
          porque son las dos que hay que contrastar, e ingresos, gastos y pendientes abajo,
          en linea mas chica. El desglose de la igualdad —que estaba escondido detras de un
          desplegable— queda siempre a la vista en una sola linea.
        */}
        <section aria-label="Resumen del periodo" className={estilos.tarjeta}>
          <div className={estilos.cifras}>
            <div className={`${estilos.celda} ${estilos.celdaVela}`}>
              <span className={estilos.celdaEtiqueta}>Patrimonio Neto</span>
              <span className={estilos.celdaValor}>{formatear(patrimonio.total, moneda)}</span>
            </div>

            <div className={estilos.celda}>
              <span className={estilos.celdaEtiqueta}>Dinero suelto</span>
              <span
                className={`${estilos.celdaValor} ${dinero_suelto.es_negativo ? estilos.riesgo : ''}`}
              >
                {formatear(dinero_suelto.monto, moneda)}
              </span>
            </div>
          </div>

          {dinero_suelto.sobreasignado ? (
            <p className={estilos.desglose}>{dinero_suelto.aviso_sobreasignado}</p>
          ) : null}

          <button
            type="button"
            onClick={() => setDesglosePatrimonioAbierto((v) => !v)}
            aria-expanded={desglosePatrimonioAbierto}
            className={estilos.desglose}
          >
            = {formatear(patrimonio.en_sobres, moneda)} en sobres +{' '}
            {formatear(patrimonio.dinero_suelto, moneda)} sin asignar
            <span aria-hidden="true" className={estilos.caret}>
              {' '}
              {desglosePatrimonioAbierto ? '▲' : '▼'}
            </span>
          </button>

          {desglosePatrimonioAbierto ? (
            <div className={estilos.desgloseAbierto}>
              <p className={estilos.desgloseCelda}>
                <span className={estilos.tipo}>Disponible en sobres</span>
                <span>{formatear(patrimonio.en_sobres, moneda)}</span>
              </p>
              <p className={estilos.desgloseCelda}>
                <span className={estilos.tipo}>Dinero suelto, sin asignar</span>
                <span>{formatear(patrimonio.dinero_suelto, moneda)}</span>
              </p>
            </div>
          ) : null}

          <div className={`${estilos.cifras} ${estilos.cifrasMenor}`}>
            <div className={estilos.celdaMenor}>
              <span className={estilos.celdaEtiqueta}>Ingresos del mes</span>
              <span className={`${estilos.celdaValor} ${estilos.ingreso}`}>
                +{formatear(totales_periodo.ingresado, moneda)}
              </span>
            </div>

            <div className={estilos.celdaMenor}>
              <span className={estilos.celdaEtiqueta}>Gastos del mes</span>
              <span className={`${estilos.celdaValor} ${estilos.gasto}`}>
                -{formatear(totales_periodo.gastado, moneda)}
              </span>
            </div>

            {/* BLOQUE 6: movimientos sin sobre asignado */}
            <div className={`${estilos.celdaMenor} ${estilos.filaTotal}`}>
              <span className={estilos.celdaEtiqueta}>Sin sobre asignado</span>
              {/*
                Dice "movimientos pendientes" y no solo "pendientes": en la grilla de arriba la
                palabra suelta se lee como saldo sin asignar, y lo que se cuenta son
                operaciones, no dinero.
              */}
              <span className={estilos.celdaValor}>
                {pendientes_asignacion.cantidad === 0
                  ? 'Todos asignados'
                  : `${pendientes_asignacion.cantidad} movimientos pendiente${
                      pendientes_asignacion.cantidad === 1 ? '' : 's'
                    }`}
              </span>
              {pendientes_asignacion.cantidad > 0 ? (
                <Link
                  href={`${rutaCartera}?filtro=sin_sobre`}
                  className={`${estilos.boton} ${estilos.botonAmbar} mt-2`}
                >
                  Asignar
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {/* Acciones para tapar desbordes si existen sobres en negativo */}
        {datos.desbordes_acciones.length > 0 ? (
          <section aria-label="Desbordes detectados" className={estilos.tarjeta}>
            <div className={estilos.seccion}>
              <h2 className={estilos.titulo}>Desbordes detectados</h2>
              <Link
                href={`${rutaCartera}?accion=asignar`}
                className={`${estilos.boton} ${estilos.botonLima}`}
              >
                Asignar dinero
              </Link>
            </div>

            {datos.desbordes_acciones.map((desborde) => (
              <div key={desborde.sobre_id} className={estilos.desborde}>
                <p className={estilos.desbordeTexto}>
                  <span className={estilos.desbordeNombre}>{desborde.nombre_sobre}</span>
                  <span className={estilos.desbordeValor}>
                    -{formatear(desborde.disponible_negativo, moneda)}
                  </span>
                </p>

                {desborde.puede_tapar ? (
                  <Link
                    href={`${rutaCartera}?tapar_sobre=${desborde.sobre_id}&origen=suelto`}
                    className={`${estilos.boton} ${estilos.botonAmbar}`}
                  >
                    Tapar desborde con dinero suelto
                  </Link>
                ) : (
                  <span className={estilos.desbordeNota}>
                    El dinero suelto no cubre este desborde
                  </span>
                )}
              </div>
            ))}
          </section>
        ) : null}

        {/*
          Cuentas y sobres van en dos columnas en pantalla ancha. Antes eran la misma
          disposicion, pero cada bloque con su propia tarjeta y su propio encabezado pesado;
          aca comparten el mismo paso de separacion y el titulo va en versalitas de 11px.
        */}
        <div className={estilos.columnas}>
          {/* BLOQUE 3: Cuentas */}
          <section aria-label="Cuentas" className={estilos.tarjeta}>
            <div className={estilos.seccion}>
              <h2 className={estilos.titulo}>Cuentas</h2>
              <Link href={rutaCartera} className={estilos.enlaceSuave}>
                Ver todas
              </Link>
            </div>

            <div className={estilos.filas}>
              {cuentas.activas.map((c) => {
                const esDeuda = c.tipo === 'credito' || c.saldo.startsWith('-')

                return (
                  <div key={c.id} className={estilos.fila}>
                    <span className={estilos.filaNombre}>
                      <span>{c.nombre}</span>
                      <span className={estilos.tipo}>{c.tipo}</span>
                    </span>
                    <span
                      className={`${estilos.filaValor} ${esDeuda ? estilos.riesgo : ''}`}
                    >
                      {formatear(c.saldo, moneda)}
                    </span>
                  </div>
                )
              })}

              <div className={`${estilos.fila} ${estilos.filaTotal}`}>
                <span className={estilos.filaNombre}>
                  <span>Total cuentas activas</span>
                </span>
                <span className={estilos.filaValor}>
                  {formatear(cuentas.total_activas, moneda)}
                </span>
              </div>
            </div>

            {cuentas.archivadas.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setArchivadasAbiertas((v) => !v)}
                  aria-expanded={archivadasAbiertas}
                  className={estilos.desglose}
                >
                  Cuentas archivadas ({cuentas.archivadas.length})
                  <span aria-hidden="true" className={estilos.caret}>
                    {' '}
                    {archivadasAbiertas ? '▲' : '▼'}
                  </span>
                </button>

                {archivadasAbiertas ? (
                  <div className={estilos.filas}>
                    {cuentas.archivadas.map((c) => (
                      <div key={c.id} className={estilos.fila}>
                        <span className={estilos.filaNombre}>
                          <span>{c.nombre}</span>
                          <span className={estilos.tipo}>archivada</span>
                        </span>
                        <span className={estilos.filaValor}>
                          {formatear(c.saldo, moneda)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          {/* BLOQUE 4: Sobres agrupados por grupo */}
          <section aria-label="Sobres presupuestarios" className={estilos.tarjeta}>
            <div className={estilos.seccion}>
              <h2 className={estilos.titulo}>Sobres</h2>
              <Link href={rutaCartera} className={estilos.enlaceSuave}>
                Ver todos
              </Link>
            </div>

            {/* Metas activas. La etiqueta de estado y la barra van en la misma linea. */}
            {metas_activas.length > 0 ? (
              <>
                {/*
                  Subtitulo y no otra tarjeta: las metas comparten seccion con los sobres y
                  abrirlas aparte las separaria de la cartera a la que apuntan. El filete de
                  arriba las distingue sin sumar un borde mas.
                */}
                <h3 className={estilos.subtitulo}>Progreso de metas activas</h3>
                <div className={estilos.filas}>
                {metas_activas.map((meta) => (
                  <div key={meta.id} className={estilos.meta}>
                    <div className={estilos.metaCuerpo}>
                      <div className={estilos.sobreLinea}>
                        <span className={estilos.grupoNombre}>{meta.nombre_sobre}</span>
                        <span
                          className={`${estilos.etiquetaMeta} ${
                            meta.retrasada
                              ? estilos.etiquetaRetrasada
                              : meta.estado_visual === 'cumplida'
                                ? estilos.etiquetaCumplida
                                : estilos.etiquetaCamino
                          }`}
                        >
                          {meta.retrasada
                            ? 'Retrasada'
                            : meta.estado_visual === 'cumplida'
                              ? 'Cumplida'
                              : 'En camino'}
                        </span>
                      </div>

                      <div className={estilos.sobreLinea}>
                        <span className={estilos.tipo}>
                          {formatear(meta.disponible, moneda)} de{' '}
                          {formatear(meta.monto_objetivo, moneda)}
                        </span>
                        <span className={estilos.conteo}>{meta.porcentaje}%</span>
                      </div>

                      <div className={estilos.pista}>
                        <div
                          className={estilos.pistaRelleno}
                          style={{ width: `${Math.min(meta.porcentaje, 100)}%` }}
                        />
                      </div>

                      {meta.retrasada && meta.falta_para_ritmo ? (
                        <p className={`${estilos.tipo} mt-1`}>
                          Faltan {formatear(meta.falta_para_ritmo, moneda)} para alcanzar el
                          ritmo necesario este mes.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
                </div>
              </>
            ) : null}

            {/* Lista de grupos, plegable */}
            <div>
              {grupos.map((grupo) => {
                const colapsado = gruposColapsados[grupo.id] ?? false

                return (
                  <div key={grupo.id} className={estilos.grupo}>
                    <button
                      type="button"
                      onClick={() => toggleGrupo(grupo.id)}
                      aria-expanded={!colapsado}
                      className={estilos.grupoCabecera}
                    >
                      <span className={estilos.grupoIzquierda}>
                        <span
                          aria-hidden="true"
                          className={`${estilos.caret} ${colapsado ? '' : estilos.caretAbierto}`}
                        >
                          ▶
                        </span>
                        <span className={estilos.grupoNombre}>{grupo.nombre}</span>
                        <span className={estilos.conteo}>({grupo.sobres.length})</span>
                      </span>

                      <span className={estilos.filaValor}>
                        {formatear(grupo.total_disponible, moneda)}
                      </span>
                    </button>

                    {!colapsado ? (
                      <div>
                        {grupo.sobres.map((sobre) => (
                          <div key={sobre.id} className={estilos.sobre}>
                            <div className={estilos.sobreCuerpo}>
                              <div className={estilos.sobreLinea}>
                                <span
                                  className={
                                    sobre.es_negativo ? estilos.riesgo : estilos.filaNombre
                                  }
                                >
                                  {sobre.nombre}
                                </span>

                                {sobre.es_negativo ? (
                                  <span className={estilos.etiquetaRiesgo}>
                                    En rojo
                                  </span>
                                ) : null}
                              </div>

                              {sobre.es_negativo && sobre.desborde ? (
                                <p className={estilos.tipo}>
                                  Desborde {formatear(sobre.desborde, moneda)}
                                </p>
                              ) : null}
                            </div>

                            <span
                              className={`${estilos.filaValor} ${sobre.es_negativo ? estilos.riesgo : estilos.ingreso}`}
                            >
                              {formatear(sobre.disponible, moneda)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}