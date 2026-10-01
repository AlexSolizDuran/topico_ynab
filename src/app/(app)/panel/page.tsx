import { notFound, redirect } from 'next/navigation'
import { obtenerCliente } from '@/db/cliente'
import { listarCarteras } from '@/repos/carteras'
import { listarGruposArchivados } from '@/repos/grupos'
import {
  listarSobresArchivados,
  listarSobresArchivadosConSaldo,
} from '@/repos/sobres'
import { consultarDatosPanel } from '@/repos/panel'
import { listarAsignaciones } from '@/repos/asignaciones'
import {
  listarMovimientos,
  listarMovimientosEliminados,
  type MovimientoVisto,
} from '@/repos/movimientos'
import { ErroresDeMovimiento, validarFiltro } from '@/transacciones/validacion'
import { sesionActual } from '@/sesion/server'
import { aEntero } from '@/enteros'
import { PanelResumen } from '@/components/panel'
import {
  PanelOperaciones,
  type PropsPanelOperaciones,
} from '@/components/panel-operaciones'
import type { MovimientoEnVista } from '@/components/transacciones'
import type { AsignacionVista } from '@/components/sobres'

export const metadata = { title: 'Panel' }

/**
 * El mes que se mira.
 *
 * Se calcula en el servidor, una vez, y se pasa a todos los repositorios —disponibles,
 * resumen, totales y sobres— para que las cifras de la pagina hablen todas del mismo mes.
 * Cada repositorio recalcularlo por su cuenta abriria la puerta a que el disponible de una
 * tabla sea de junio y el dinero suelto de julio.
 */
function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

/**
 * El filtro de movimientos, tal como viene de la URL.
 *
 * El filtro vive en la URL y no en un estado del cliente: eso lo hace compartible y sobrevive
 * a un F5. Un filtro mal escrito se devuelve **invalido** en vez de ignorarse, porque una lista
 * vacia sin explicacion deja al usuario creyendo que filtro y son sus datos los que faltan.
 */
function filtroDeUrl(
  searchParams: Record<string, string | string[] | undefined>,
): { datos: ReturnType<typeof validarFiltro>; valido: boolean } {
  const primero = (valor: string | string[] | undefined): string =>
    Array.isArray(valor) ? (valor[0] ?? '') : (valor ?? '')

  const crudo = {
    texto: primero(searchParams.texto),
    cuenta_id: primero(searchParams.cuenta_id),
    sobre_id: primero(searchParams.sobre_id),
    // El `<select>` de tipo manda `''` en su opcion vacia, y `''` no es un `tipo` valido:
    // `z.enum` solo acepta las tres etiquetas. Sin esta conversion, `tipo=''` —o sea, toda URL
    // sin filtro— haria fallar `validarFiltro`. "No filtrar por tipo" es la **ausencia** de la
    // clave, no una cadena vacia.
    tipo: primero(searchParams.tipo) || undefined,
    desde: primero(searchParams.desde),
    hasta: primero(searchParams.hasta),
  }

  try {
    return { datos: validarFiltro(crudo), valido: true }
  } catch (error) {
    if (error instanceof ErroresDeMovimiento) return { datos: validarFiltro({}), valido: false }
    throw error
  }
}

/** Si hay algo que limpiar del lado de la URL. Un filtro **mal escrito** tambien cuenta. */
function hayFiltroEn(
  datos: ReturnType<typeof validarFiltro>,
  valido: boolean,
): boolean {
  return (
    !valido ||
    Boolean(
      datos.texto || datos.cuenta_id || datos.sobre_id || datos.tipo || datos.desde || datos.hasta,
    )
  )
}

/** El filtro, como lo espera el repositorio. */
function filtroDeRepos(datos: ReturnType<typeof validarFiltro>) {
  return {
    texto: datos.texto || undefined,
    cuenta_id: aEntero(datos.cuenta_id),
    sobre_id: aEntero(datos.sobre_id),
    tipo: datos.tipo,
    desde: datos.desde || undefined,
    hasta: datos.hasta || undefined,
  }
}

/**
 * La fila del repositorio, reducida a lo que la vista necesita.
 *
 * Va en una funcion porque la lista y la lista de eliminados dibujan **la misma fila**: si cada
 * una mapeara a su manera, un movimiento borrado y ese mismo restaurado se verian distinto, y
 * el usuario no reconoceria que es el mismo.
 */
function aEnVista(movimiento: MovimientoVisto): MovimientoEnVista {
  return {
    id: movimiento.id,
    cuenta_id: movimiento.cuenta_id,
    cuenta_nombre: movimiento.cuenta_nombre,
    sobre_id: movimiento.sobre_id,
    sobre_nombre: movimiento.sobre_nombre,
    tipo: movimiento.tipo,
    monto: movimiento.monto,
    fecha: movimiento.fecha,
    descripcion: movimiento.descripcion,
    comercio: movimiento.comercio,
    pendiente: movimiento.pendiente,
    pata: movimiento.transferencia_id !== null,
    contraparte_cuenta_id: movimiento.contraparte_cuenta_id,
    contraparte_cuenta_nombre: movimiento.contraparte_cuenta_nombre,
  }
}

/**
 * La cartera abierta, con todo lo que la pagina necesita y en una sola cartera.
 *
 * Esta pagina reemplazo a `/cartera/<id>`, que era la misma gestion mas junta: los grupos con
 * sus sobres, las cuentas y los movimientos vivian en un unico scroll de diez tarjetas, con
 * treinta y dos formularios embebidos. Ahora el resumen es arriba —patrimonio, dinero suelto,
 * totales del mes— y los tres paneles de operacion van debajo.
 *
 * **Una sola cartera, siempre.** La cartera abierta sale de `?cartera=` y se cruza con
 * `usuario_id` antes de leer una sola fila: una cartera ajena y una que no existen dan el mismo
 * `notFound`, porque la pagina no puede confirmar que el identificador existe.
 *
 * El `periodo` es de una sola vez para todos los repositorios, y el filtro de movimientos vive
 * en la URL. `listarMovimientos` **no** recibe `cartera_id`: transacciones R10 prohibe aceptar
 * una cartera declarada, y el repositorio deduce la cartera de la cuenta de cada fila. Por eso
 * el recorte a esta cartera se hace aca, sobre el `cartera_id` que la fila ya trae derivado —
 * un filtro sobre un entero, no sobre dinero.
 */
export default async function PaginaPanel({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const db = obtenerCliente()
  const todas = await listarCarteras(db, sesion.usuario_id)
  const activas = todas.filter((c) => !c.archivada)

  // Sin ninguna cartera no hay nada que mostrar: `/carteras` es donde se crea la primera.
  if (activas.length === 0) redirect('/carteras')

  const params = searchParams ? await searchParams : {}
  const carteraIdSolicitada = params.cartera ? aEntero(Array.isArray(params.cartera) ? params.cartera[0] : params.cartera) : null

  let cartera = activas[0]!
  if (carteraIdSolicitada !== null) {
    /*
     * Una cartera que no es de este usuario es un `notFound`, no un desvicio silencioso a la
     * primera cartera del usuario. Pedir la ajena y ver los numeros propios en silencio es peor
     * que un 404: el usuario creeria que esta viendo los de la ajena.
     */
    const encontrada = activas.find((c) => c.id === carteraIdSolicitada)
    if (!encontrada) notFound()
    cartera = encontrada
  }

  const periodo = periodoActual()
  const filtroUrl = filtroDeUrl(params)

  const datos = await consultarDatosPanel(db, sesion.usuario_id, cartera.id, periodo)

  /*
   * Lo archivado, que `consultarDatosPanel` no trae: el panel resume lo vivo y deja los
   * archivados para las listas de abajo.
   *
   * Los sobres archivados se parten en dos. Los que quedaron planos no tienen nada pendiente.
   * Los que acumularon una devolucion tienen disponible sin destino, y eso es otra situacion —
   * el dinero esta en un sobre que ya no recibe asignaciones— asi que van marcados aparte. Los que
   * quedaron en negativo **no** se repiten en la segunda lista: ya estan en la alerta de
   * arriba, que es donde el usuario tiene que mirar primero.
   */
  const [gruposArchivados, sobresArchivados, archivadosConSaldo] = await Promise.all([
    listarGruposArchivados(db, sesion.usuario_id, cartera.id),
    listarSobresArchivados(db, sesion.usuario_id, cartera.id, periodo),
    listarSobresArchivadosConSaldo(db, sesion.usuario_id, cartera.id, periodo),
  ])

  const idsConSaldo = new Set(archivadosConSaldo.map((sobre) => sobre.id))
  const sobresArchivadosPlanos = sobresArchivados.filter(
    (sobre) => !idsConSaldo.has(sobre.id) || sobre.negativo,
  )
  const sobresArchivadosConSaldoVivos = archivadosConSaldo.filter((sobre) => !sobre.negativo)

  /*
   * Las asignaciones de cada sobre, para poder corregirlas.
   *
   * Una asignacion corregida es lo que hace que el disponible tenga de donde salir: sin la fila
   * a la vista, el unico modo de cambiar un importe asignado seria compensarlo con otra
   * asignacion, y el disponible quedaria bien por la suma mientras el historial dijera otra cosa.
   *
   * Van por sobre y no en una consulta para toda la cartera porque cada fila necesita la suya,
   * y `listarAsignaciones` ya exige `usuario_id` y `cartera_id` antes de devolver una: el cruce
   * de aislamiento esta en el repositorio, no en esta pagina.
   */
  const asignacionesPorSobre: Record<number, AsignacionVista[]> = {}
  await Promise.all(
    datos.grupos.flatMap((grupo) => grupo.sobres).map(async (sobre) => {
      const filas = await listarAsignaciones(db, sesion.usuario_id, cartera.id, sobre.id)
      asignacionesPorSobre[sobre.id] = filas.map((a) => ({
        id: a.id,
        periodo: a.periodo,
        monto: a.monto,
        motivo: a.motivo,
      }))
    }),
  )

  /*
   * Los movimientos de **esta** cartera, y los eliminados para poder restaurarlos.
   *
   * Sin los eliminados, R6 seria la mitad de lo que dice: la fila se conserva pero no hay de
   * donde volver a tomarla. Sin filtros a proposito —un filtro que oculta el unico movimiento
   * que se puede deshacer es peor que no tener filtro— y recortado por cartera igual que el
   * resto.
   */
  const movimientosDeEstaCartera = await listarMovimientos(
    db,
    sesion.usuario_id,
    filtroDeRepos(filtroUrl.datos),
  )
  const movimientos = movimientosDeEstaCartera
    .filter((movimiento) => movimiento.cartera_id === cartera.id)
    .map(aEnVista)

  const eliminadosEn = new Map<number, string | null>()
  const movimientosEliminados = (
    await listarMovimientosEliminados(db, sesion.usuario_id)
  )
    .filter((movimiento) => movimiento.cartera_id === cartera.id)
    .map((movimiento) => {
      eliminadosEn.set(
        movimiento.id,
        movimiento.eliminado_en ? movimiento.eliminado_en.toISOString() : null,
      )
      return aEnVista(movimiento)
    })

  const operaciones: PropsPanelOperaciones = {
    cartera_id: cartera.id,
    dinero_suelto: datos.dinero_suelto.monto,
    moneda: cartera.moneda,
    periodo,

    cuentas: datos.cuentas.activas,
    cuentasArchivadas: datos.cuentas.archivadas.map((cuenta) => ({
      id: cuenta.id,
      nombre: cuenta.nombre,
      saldo: cuenta.saldo,
    })),

    grupos: datos.grupos,
    gruposArchivados: gruposArchivados.map((grupo) => ({ id: grupo.id, nombre: grupo.nombre })),
    sobresArchivados: sobresArchivadosPlanos.map((sobre) => ({
      id: sobre.id,
      nombre: sobre.nombre,
      grupo_id: sobre.grupo_id,
      disponible: sobre.disponible,
      es_negativo: sobre.negativo,
      archivado: true,
    })),
    sobresArchivadosConSaldo: sobresArchivadosConSaldoVivos.map((sobre) => ({
      id: sobre.id,
      nombre: sobre.nombre,
      grupo_id: sobre.grupo_id,
      disponible: sobre.disponible,
      es_negativo: sobre.negativo,
      archivado: true,
    })),

    asignacionesPorSobre,
    movimientos,
    movimientosEliminados,
    eliminados_en: eliminadosEn,

    filtro: {
      texto: filtroUrl.datos.texto,
      cuenta_id: filtroUrl.datos.cuenta_id,
      sobre_id: filtroUrl.datos.sobre_id,
      tipo: filtroUrl.datos.tipo ?? '',
      desde: filtroUrl.datos.desde,
      hasta: filtroUrl.datos.hasta,
    },
    hayFiltro: hayFiltroEn(filtroUrl.datos, filtroUrl.valido),
    filtroInvalido: !filtroUrl.valido,
  }

  return (
    <PanelResumen
      datos={datos}
      carterasDisponibles={activas.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda }))}
    >
      <PanelOperaciones {...operaciones} />
    </PanelResumen>
  )
}