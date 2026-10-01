'use client'

/**
 * Los tres paneles de operacion de una cartera: cuentas, grupos con sus sobres, y movimientos.
 *
 * Va **debajo** del resumen, no mezclado con el. El resumen es una foto: dice como van las
 * cifras. Esto es la mesa de trabajo: donde se crean y se corrigen las cosas. La diferencia no
 * es de estilo sino de que el resumen no escribe y esto si, asi que el resumen sigue siendo el
 * mismo componente de solo lectura y esta se agrega debajo con `children`.
 *
 * **Cada fila es de lectura.** La cuenta, el sobre y el movimiento muestran nombre e importe y
 * nada mas; todo lo que se les puede hacer vive en el modal del "⋯". El motivo es que con los
 * formularios embebidos, una cartera de veinte sobres son veinte veces ocho formularios, y la
 * fila deja de leerse como un sobre con un disponible y pasa a ser un panel de botones.
 *
 * El orden de los paneles no es estetico. Cuentas van arriba porque el saldo de una cuenta es
 * de donde sale el disponible de los sobres, y los sobres van antes que los movimientos porque
 * un movimiento sin sobre es un movimiento a medio hacer: la pantalla tiene que poder llegar
 * al sobre antes de poder corregir el movimiento.
 */

import { FilaCuenta, FilaCuentaArchivada, FormularioNuevaCuenta } from './cuentas'
import { FilaGrupo, FilaGrupoArchivado, FormularioNuevoGrupo } from './grupos'
import {
  FilaSobre,
  FilaSobreArchivado,
  FormularioNuevoSobre,
  type AsignacionVista,
} from './sobres'
import {
  FormularioNuevoMovimiento,
  ListaMovimientos,
  ListaMovimientosEliminados,
  type MovimientoEnVista,
} from './transacciones'
import { FormularioNuevoTraspaso } from './traspasos'
import { Modal } from './modal'
import { formatear } from '../dinero'
import producto from './producto.module.css'
import detalle from './detalle.module.css'
import tema from './tema-oscuro.module.css'

export interface PropsPanelOperaciones {
  cartera_id: number
  /** El dinero suelto de la cartera, para el aviso de los sobres en negativo. */
  dinero_suelto: string
  moneda: string
  periodo: string

  cuentas: {
    id: number
    nombre: string
    tipo: string
    saldo: string
    saldo_inicial: string
    archivada: boolean
    tieneMovimientos: boolean
  }[]
  cuentasArchivadas: { id: number; nombre: string; saldo: string }[]

  grupos: {
    id: number
    nombre: string
    orden: number
    total_disponible: string
    sobres: {
      id: number
      nombre: string
      grupo_id: number
      orden: number
      disponible: string
      archivado: boolean
      es_negativo: boolean
      eliminable: boolean
    }[]
  }[]
  gruposArchivados: { id: number; nombre: string }[]
  sobresArchivados: {
    id: number
    nombre: string
    grupo_id: number
    disponible: string
    es_negativo: boolean
    archivado: boolean
  }[]
  /** Los archivados que acumularon una devolucion: tienen disponible sin destino. */
  sobresArchivadosConSaldo: {
    id: number
    nombre: string
    grupo_id: number
    disponible: string
    es_negativo: boolean
    archivado: boolean
  }[]

  /** Las asignaciones de cada sobre, para el modal de corregir. */
  asignacionesPorSobre: Record<number, AsignacionVista[]>

  movimientos: MovimientoEnVista[]
  movimientosEliminados: MovimientoEnVista[]
  /** Mapa de `movimiento_id` a la fecha del borrado. Es un `Map` y no un objeto porque las
   * claves son ids de la base, y un objeto los volveria string en el camino. */
  eliminados_en: ReadonlyMap<number, string | null>

  /** Filtro de movimientos, tal como viene de la URL. */
  filtro: {
    texto: string
    cuenta_id: string
    sobre_id: string
    tipo: string
    desde: string
    hasta: string
  }
  hayFiltro: boolean
  filtroInvalido: boolean
}

/** El titulo del panel y el boton que abre su alta. */
function CabeceraDePanel({
  titulo,
  bajada,
  accion,
}: {
  titulo: string
  bajada?: string
  /** El boton de alta, ya con su `Modal` envuelto. */
  accion: React.ReactNode
}) {
  return (
    <div className={detalle.panelCabecera}>
      <div>
        <h2 className={producto.seccionTitulo}>{titulo}</h2>
        {bajada ? <p className={producto.seccionBajada}>{bajada}</p> : null}
      </div>
      {accion}
    </div>
  )
}

export function PanelOperaciones({
  cartera_id,
  dinero_suelto,
  moneda,
  periodo,
  cuentas,
  cuentasArchivadas,
  grupos,
  gruposArchivados,
  sobresArchivados,
  sobresArchivadosConSaldo,
  asignacionesPorSobre,
  movimientos,
  movimientosEliminados,
  eliminados_en,
  filtro,
  hayFiltro,
  filtroInvalido,
}: PropsPanelOperaciones) {
  /*
   * Las opciones de los selectores se arman una vez y se comparten.
   *
   * Van como `{ id, nombre }` y no como las filas de la base: el desplegable de "mover a otro
   * sobre" necesita el nombre del destino, no su disponible, y mandar la fila entera al
   * cliente seria mandar el disponible de cada sobre a un `<option>` que no lo muestra.
   */
  const opcionesCuentas = cuentas.map((c) => ({ id: c.id, nombre: c.nombre }))
  const opcionesGrupos = grupos.map((g) => ({ id: g.id, nombre: g.nombre }))
  const opcionesSobres = grupos.flatMap((g) =>
    g.sobres.map((s) => ({ id: s.id, nombre: s.nombre })),
  )

  return (
    <>
      {/* -------------------------------------------------------------- cuentas */}
      <section id="cuentas" className={`${producto.tarjeta} ${tema.oscuro}`}>
        <CabeceraDePanel
          titulo="Cuentas"
          bajada="El saldo de cada una se deriva de su saldo inicial y sus movimientos."
          accion={
            <Modal
              titulo="Nueva cuenta"
              disparador="+ Nueva cuenta"
              claseDisparador={detalle.enlaceAccion}
            >
              <FormularioNuevaCuenta cartera_id={cartera_id} />
            </Modal>
          }
        />

        <ul className={detalle.lista}>
          {cuentas.map((cuenta) => (
            <FilaCuenta
              key={cuenta.id}
              cartera_id={cartera_id}
              cuenta_id={cuenta.id}
              nombre={cuenta.nombre}
              tipo={cuenta.tipo}
              saldo={cuenta.saldo}
              saldo_inicial={cuenta.saldo_inicial}
              moneda={moneda}
              tieneMovimientos={cuenta.tieneMovimientos}
            />
          ))}
        </ul>

        {cuentas.length === 0 ? (
          <p className={detalle.vacio}>Todavia no hay cuentas en esta cartera.</p>
        ) : null}

        {/*
          Las cuentas archivadas van en una seccion propia, con su encabezado, y **no** en un
          `<details>`. No es una decision de gusto: `tests/grupos/plegado.test.ts` toma el primer
          `<details>` del HTML asumiendo que es el pliegue del grupo, y las cuentas van antes que
          los grupos. Un desplegable aca descolocaria esa asercion en silencio, sin fallar por la
          razon correcta.
        */}
        {cuentasArchivadas.length > 0 ? (
          <>
            <hr className={producto.division} />
            <h3 className={producto.subtitulo}>Cuentas archivadas</h3>
            <ul className={detalle.lista}>
              {cuentasArchivadas.map((cuenta) => (
                <FilaCuentaArchivada
                  key={cuenta.id}
                  cartera_id={cartera_id}
                  cuenta_id={cuenta.id}
                  nombre={cuenta.nombre}
                  saldo={cuenta.saldo}
                  moneda={moneda}
                />
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {/* ------------------------------------------------- grupos y sus sobres */}
      <section id="sobres" className={`${producto.tarjeta} ${tema.oscuro}`}>
        <CabeceraDePanel
          titulo="Grupos y sobres"
          bajada="Los grupos ordenan los sobres. No tienen presupuesto propio: su total es la suma de los disponibles de los sobres que contienen."
          accion={
            <div className={detalle.acciones}>
              <Modal
                titulo="Nuevo grupo"
                disparador="+ Nuevo grupo"
                claseDisparador={detalle.enlaceAccion}
              >
                <FormularioNuevoGrupo cartera_id={cartera_id} />
              </Modal>
              <Modal
                titulo="Nuevo sobre"
                disparador="+ Nuevo sobre"
                claseDisparador={detalle.enlaceAccion}
              >
                <FormularioNuevoSobre cartera_id={cartera_id} grupos={opcionesGrupos} />
              </Modal>
            </div>
          }
        />

        {grupos.length === 0 ? (
          <p className={detalle.vacio}>Todavia no hay grupos en esta cartera.</p>
        ) : (
          <ul className={detalle.listaGrupos}>
            {grupos.map((grupo) => {
              const delGrupo = grupo.sobres
              /* Cuantos sobres del grupo estan en desborde. */
              const desbordeDelGrupo = delGrupo.filter((s) => s.es_negativo).length

              return (
                <li key={grupo.id} className={detalle.grupoBloque}>
                  {/*
                    Nombre, contador, total y menu en una sola fila.

                    Antes el nombre y el menu estaban en una tarjeta con recuadro y el total en
                    un parrafo suelto debajo. Con eso, "cuanto tengo en Necesidades" obligaba a
                    unir dos filas separadas por el menu, y el total —el dato que uno va a
                    buscar— era el mas pequeno de los tres. Los tres van juntos ahora, con el
                    total a la derecha en la tipografia de cifras.
                  */}
                  <FilaGrupo
                    cartera_id={cartera_id}
                    grupo_id={grupo.id}
                    nombre={grupo.nombre}
                    orden={grupo.orden}
                    total={formatear(grupo.total_disponible, moneda)}
                    cantidadSobres={delGrupo.length}
                  />

                  {/*
                    El total de arriba esta **fuera** del `<details>` de abajo, y es a proposito:
                    R35 pide que plegar un grupo esconda sus sobres pero deje el total a la
                    vista. Un total adentro del desplegable desapareceria con el, que es justo
                    lo que R35 prohibe.

                    Este parrafo dice la composicion del total, no el total: cuanto hay y
                    cuantos de esos sobres estan en negativo.
                  */}
                  <p className={detalle.totalGrupo}>
                    {delGrupo.length === 0
                      ? 'Sin sobres todavia'
                      : desbordeDelGrupo === 0
                        ? `${delGrupo.length} ${delGrupo.length === 1 ? 'sobre' : 'sobres'} con saldo`
                        : `${delGrupo.length} ${delGrupo.length === 1 ? 'sobre' : 'sobres'}, ${desbordeDelGrupo} en negativo`}
                  </p>

                  <details className={detalle.desplegable} open>
                    <summary className={detalle.resumen}>
                      {delGrupo.length === 0 ? 'Agregar un sobre' : 'Ver sobres'}
                    </summary>
                    <ul className={detalle.sublista}>
                      {delGrupo.map((sobre) => (
                        <FilaSobre
                          key={sobre.id}
                          cartera_id={cartera_id}
                          sobre_id={sobre.id}
                          nombre={sobre.nombre}
                          disponible={sobre.disponible}
                          negativo={sobre.es_negativo}
                          eliminable={sobre.eliminable}
                          periodo={periodo}
                          moneda={moneda}
                          grupo_id={grupo.id}
                          grupos={opcionesGrupos}
                          otrosSobres={opcionesSobres.filter((o) => o.id !== sobre.id)}
                          dinero_suelto={
                            sobre.es_negativo ? dinero_suelto : ''
                          }
                          asignaciones={asignacionesPorSobre[sobre.id] ?? []}
                        />
                      ))}
                      {delGrupo.length === 0 ? (
                        <li className={detalle.vacioItem}>
                          Este grupo todavia no tiene sobres.
                        </li>
                      ) : null}
                    </ul>
                  </details>
                </li>
              )
            })}
          </ul>
        )}

        {/*
          Los grupos archivados y los sobres archivados van en `<details>` **despues** del panel
          de grupos, asi que el primer `<details>` de la pagina sigue siendo el pliegue de un
          grupo y la asercion de `plegado.test.ts` sigue apuntando al lugar correcto.
        */}
        {gruposArchivados.length > 0 || sobresArchivados.length > 0 ? (
          <div className={detalle.bloque}>
            {gruposArchivados.length > 0 ? (
              <details className={detalle.desplegable}>
                <summary className={detalle.resumen}>
                  Grupos archivados ({gruposArchivados.length})
                </summary>
                <ul className={detalle.lista}>
                  {gruposArchivados.map((grupo) => (
                    <FilaGrupoArchivado
                      key={grupo.id}
                      cartera_id={cartera_id}
                      grupo_id={grupo.id}
                      nombre={grupo.nombre}
                    />
                  ))}
                </ul>
              </details>
            ) : null}

            {/*
              Los sobres archivados se parten en dos listas, como los mostraba la pagina de
              cartera: los que quedaron planos y los que acumularon una devolucion. El dinero
              sin destino en un sobre archivado es distinto de un sobre archivado a secas, y por
              eso el segundo grupo tiene su propio desplegable.
            */}
            {sobresArchivados.length > 0 || sobresArchivadosConSaldo.length > 0 ? (
              <details className={detalle.desplegable}>
                <summary className={detalle.resumen}>
                  Sobres archivados ({sobresArchivados.length + sobresArchivadosConSaldo.length})
                </summary>
                <ul className={detalle.lista}>
                  {sobresArchivados.map((sobre) => (
                    <FilaSobreArchivado
                      key={sobre.id}
                      cartera_id={cartera_id}
                      sobre_id={sobre.id}
                      nombre={sobre.nombre}
                      disponible={sobre.disponible}
                      enNegativo={sobre.es_negativo}
                      moneda={moneda}
                      periodo={periodo}
                    />
                  ))}
                </ul>

                {sobresArchivadosConSaldo.length > 0 ? (
                  <>
                    <h4 className={`${producto.subtitulo} ${detalle.atencion}`}>
                      Archivados con dinero
                    </h4>
                    <p className={detalle.nota}>
                      Recibieron devoluciones y siguen archivados: el disponible quedo sin
                      destino. Los que estan en negativo ya salen arriba, en rojo.
                    </p>
                    <ul className={detalle.lista}>
                      {sobresArchivadosConSaldo.map((sobre) => (
                        <FilaSobreArchivado
                          key={sobre.id}
                          cartera_id={cartera_id}
                          sobre_id={sobre.id}
                          nombre={sobre.nombre}
                          disponible={sobre.disponible}
                          enNegativo={sobre.es_negativo}
                          moneda={moneda}
                          periodo={periodo}
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ movimientos */}
      <section id="movimientos" className={`${producto.tarjeta} ${tema.oscuro}`}>
        <CabeceraDePanel
          titulo="Movimientos"
          bajada="El saldo de cada cuenta sale de su saldo inicial mas estos movimientos. Un movimiento sin sobre queda pendiente: su dinero esta en la cuenta y todavia no tiene destino."
          accion={
            <div className={detalle.acciones}>
              <Modal
                titulo="Nuevo movimiento"
                disparador="+ Nuevo movimiento"
                claseDisparador={detalle.enlaceAccion}
              >
                {cuentas.length > 0 ? (
                  <FormularioNuevoMovimiento
                    cartera_id={cartera_id}
                    cuentas={opcionesCuentas}
                    sobres={opcionesSobres}
                    periodo={periodo}
                  />
                ) : (
                  <p className={detalle.nota}>
                    Hace falta una cuenta antes de registrar un movimiento.
                  </p>
                )}
              </Modal>

              {/*
                El traspaso necesita **dos** cuentas: R1 prohibe el alta vacia. Con una sola
                cuenta el boton no aparece, y no es un caso raro — es el estado de una cartera
                recien creada.
              */}
              {cuentas.length > 1 ? (
                <Modal
                  titulo="Nuevo traspaso"
                  disparador="+ Nuevo traspaso"
                  claseDisparador={detalle.enlaceAccion}
                >
                  <FormularioNuevoTraspaso
                    cartera_id={cartera_id}
                    cuentas={opcionesCuentas}
                    periodo={periodo}
                  />
                </Modal>
              ) : null}
            </div>
          }
        />

        <ListaMovimientos
          cartera_id={cartera_id}
          movimientos={movimientos}
          cuentas={opcionesCuentas}
          sobres={opcionesSobres}
          moneda={moneda}
          periodo={periodo}
          filtro={{
            texto: filtro.texto,
            cuenta_id: filtro.cuenta_id,
            sobre_id: filtro.sobre_id,
            tipo: filtro.tipo || '',
            desde: filtro.desde,
            hasta: filtro.hasta,
          }}
          hayFiltro={hayFiltro}
          filtroInvalido={filtroInvalido}
        />

        <ListaMovimientosEliminados
          cartera_id={cartera_id}
          movimientos={movimientosEliminados}
          moneda={moneda}
          eliminados_en={eliminados_en}
        />
      </section>
    </>
  )
}