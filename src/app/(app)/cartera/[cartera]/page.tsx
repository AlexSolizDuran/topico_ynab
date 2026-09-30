import { notFound, redirect } from 'next/navigation'
import { obtenerCliente } from '@/db/cliente'
import { buscarCartera } from '@/repos/carteras'
import { listarGrupos, listarGruposArchivados, totalDeGrupo } from '@/repos/grupos'
import {
  listarSobres,
  listarSobresArchivados,
  listarSobresArchivadosConSaldo,
  listarSobresEnNegativo,
} from '@/repos/sobres'
import { listarAsignaciones } from '@/repos/asignaciones'
import { avisarDesborde, resumenDeCartera } from '@/repos/dinero-suelto'
import {
  listarCuentas,
  listarCuentasArchivadas,
  saldoDeCuenta,
  tieneMovimientos,
} from '@/repos/cuentas'
import {
  listarMovimientos,
  listarMovimientosEliminados,
  type FiltroMovimientos,
  type MovimientoVisto,
} from '@/repos/movimientos'
import { ErroresDeMovimiento, validarFiltro } from '@/transacciones/validacion'
import { sesionActual } from '@/sesion/server'
import { formatear } from '@/dinero'
import { aEntero } from '@/enteros'
import { FilaCuenta, FilaCuentaArchivada, FormularioNuevaCuenta } from '@/components/cuentas'
import { FilaGrupo, FilaGrupoArchivado, FormularioNuevoGrupo } from '@/components/grupos'
import { FilaSobre, FilaSobreArchivado, FormularioNuevoSobre } from '@/components/sobres'
import {
  FormularioNuevoMovimiento,
  ListaMovimientos,
  ListaMovimientosEliminados,
  type MovimientoEnVista,
} from '@/components/transacciones'
import { FormularioNuevoTraspaso } from '@/components/traspasos'

/**
 * El mes que se mira.
 *
 * La pantalla es de un solo periodo y no tiene selector: los meses futuros y la
 * navegacion entre periodos quedan fuera de alcance. Se calcula en el servidor, una
 * vez, y se pasa a todos los repositorios —disponibles, resumen y avisos— para que las
 * cifras de la pagina hablen todas del mismo mes. Cada repositorio recalcularlo por su
 * cuenta abriria la puerta a que el disponible de una tabla sea de junio y el dinero
 * suelto de julio.
 */
function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Los filtros del listado de movimientos, tal como vienen en la URL.
 *
 * R9 pide que el filtro viva en la URL, asi que la pagina lo lee de `searchParams` y no de
 * un estado del cliente. Un filtro mal escrito se devuelve **invalido**, y una lista vacia con
 * el aviso de "no coincide con el filtro": ignorarlo y mostrar todo seria peor, porque el
 * usuario creeria que filtro y son sus datos los que no aparecen.
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
    // El `<select>` de tipo manda `''` en su opcion vacia, y `''` **no** es un `tipo`
    // valido: `z.enum` solo acepta las tres etiquetas. Sin esta conversion, `tipo=''` —o sea,
    // toda URL sin filtro— haria fallar `validarFiltro` y la pagina caeria al caso de "filtro
    // mal escrito" siempre. Lo que significa "no filtrar por tipo" es la **ausencia** de la
    // clave, no una cadena vacia.
    tipo: primero(searchParams.tipo) || undefined,
    desde: primero(searchParams.desde),
    hasta: primero(searchParams.hasta),
  }

  try {
    return { datos: validarFiltro(crudo), valido: true }
  } catch (error) {
    // `validarFiltro` tira `ErroresDeMovimiento`; cualquier otra cosa seria un error real y
    // no un filtro raro, asi que no se la come este `catch`.
    if (error instanceof ErroresDeMovimiento) return { datos: validarFiltro({}), valido: false }
    throw error
  }
}

export const metadata = { title: 'Cartera' }

/**
 * Cuentas de UNA cartera, con el saldo de cada una.
 *
 * El `cartera_id` viene de la URL, y por eso se cruza con `usuario_id` de la sesion
 * antes de leer una sola cuenta: una cartera ajena y una que no existen dan el mismo
 * `notFound`, y la pagina no puede confirmar que el identificador existe.
 *
 * El saldo se pide con `saldoDeCuenta` por cuenta y no con una unica consulta para
 * toda la cartera. Suena ineficiente y no lo es: `listarCuentas` ya trae el saldo de
 * cada una en la misma consulta, y las llamadas extra son solo para las archivadas,
 * que no entran en la lista activa. Se evita asi un `sum` por cuenta con su propio
 * plan, que es lo que costaria un unico `select` con subconsultas correlacionadas.
 */
export default async function PaginaCuentas({
  params,
  searchParams,
}: {
  params: Promise<{ cartera: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sesion = await sesionActual()
  if (!sesion) redirect('/entrar')

  const { cartera: carteraDeUrl } = await params
  const cartera_id = aEntero(carteraDeUrl)
  if (cartera_id === null) notFound()

  const db = obtenerCliente()
  const cartera = await buscarCartera(db, sesion.usuario_id, cartera_id)
  if (!cartera) notFound()

  const periodo = periodoActual()
  const filtroUrl = filtroDeUrl(await searchParams)

  const [
    gruposActivos,
    gruposArchivados,
    activas,
    archivadas,
    sobres,
    sobresArchivados,
    enNegativo,
    archivadosConSaldo,
    resumen,
  ] = await Promise.all([
    listarGrupos(db, sesion.usuario_id, cartera_id),
    listarGruposArchivados(db, sesion.usuario_id, cartera_id),
    listarCuentas(db, sesion.usuario_id, cartera_id),
    listarCuentasArchivadas(db, sesion.usuario_id, cartera_id),
    listarSobres(db, sesion.usuario_id, cartera_id, periodo),
    listarSobresArchivados(db, sesion.usuario_id, cartera_id, periodo),
    listarSobresEnNegativo(db, sesion.usuario_id, cartera_id, periodo),
    listarSobresArchivadosConSaldo(db, sesion.usuario_id, cartera_id, periodo),
    resumenDeCartera(db, sesion.usuario_id, cartera_id, periodo),
  ])

  /**
   * El aviso de desborde de cada sobre en negativo, para poder decir si el dinero
   * suelto alcanza.
   *
   * Va por sobre y son pocos: solo se consulta para los que estan en negativo, y el
   * disponible de cada uno ya venia en el listado. Lo que sale de esta consulta es el
   * dinero suelto de la cartera y si alcanza para tapar, que es lo que R6 pide avisar.
   */
  const avisos = new Map<number, Awaited<ReturnType<typeof avisarDesborde>>>(
    (
      await Promise.all(
        enNegativo.map(async (sobre) => ({
          id: sobre.id,
          aviso: await avisarDesborde(
            db,
            sesion.usuario_id,
            cartera_id,
            periodo,
            sobre.id,
          ),
        })),
      )
    ).map((entrada) => [entrada.id, entrada.aviso] as const),
  )

  const saldosDeArchivadas = await Promise.all(
    archivadas.map(async (cuenta) => ({
      id: cuenta.id,
      saldo: await saldoDeCuenta(db, sesion.usuario_id, cartera_id, cuenta.id),
    })),
  )

  const conMovimientos = await Promise.all(
    activas.map(async (cuenta) => ({
      id: cuenta.id,
      hay: await tieneMovimientos(db, sesion.usuario_id, cartera_id, cuenta.id),
    })),
  )

  const conMovimiento = new Map(conMovimientos.map((c) => [c.id, c.hay]))
  const saldoArchivada = new Map(saldosDeArchivadas.map((c) => [c.id, c.saldo]))

  /**
   * Las asignaciones de cada sobre, para poder corregirlas.
   *
   * Una asignacion corregida es lo que hace que el disponible tenga de donde salir: sin
   * la fila a la vista, el unico modo de cambiar un importe asignado seria compensarlo
   * con otra asignacion, y el disponible quedaria bien por la suma mientras el
   * historial dijera otra cosa.
   *
   * Van por sobre y no en una consulta para toda la cartera porque cada fila necesita la
   * suya, y `listarAsignaciones` ya exige `usuario_id` y `cartera_id` antes de devolver
   * una: el cruce de aislamiento esta en el repositorio, no en esta pagina. Solo se
   * piden para los sobres desplegados; los archivados no admiten correccion.
   */
  const asignacionesPorSobre = new Map(
    (
      await Promise.all(
        sobres.map(async (sobre) => [
          sobre.id,
          await listarAsignaciones(db, sesion.usuario_id, cartera_id, sobre.id),
        ] as const),
      )
    ).map((entrada) => [entrada[0], entrada[1]]),
  )

  /**
   * Que archivado va en que lista.
   *
   * Los archivados se parten en dos: los que no tienen nada pendiente y los que
   * acumularon una devolucion. Los que quedaron en negativo no se repiten en la lista
   * de "archivados con dinero" porque ya estan en el panel de rojo, que es donde el
   * usuario tiene que mirar primero.
   */
  const archivadosConSaldoIds = new Set(archivadosConSaldo.map((sobre) => sobre.id))
  const archivadosPlanos = sobresArchivados.filter(
    (sobre) => !archivadosConSaldoIds.has(sobre.id) || sobre.negativo,
  )

  const sobresPorGrupo = new Map<number, typeof sobres>()
  for (const sobre of sobres) {
    const delGrupo = sobresPorGrupo.get(sobre.grupo_id) ?? []
    delGrupo.push(sobre)
    sobresPorGrupo.set(sobre.grupo_id, delGrupo)
  }

  /**
   * El total de cada grupo.
   *
   * Va en la base, una consulta por grupo, y no sumando en JavaScript: el total es la
   * suma de los disponibles, y esa suma es la regla del dinero. Con dos grupos la
   * diferencia no se nota, pero con cuarenta seria cuarenta viagens y una suma fuera del
   * motor que ya sabe sumar.
   */
  const totales = new Map(
    await Promise.all(
      gruposActivos.map(async (grupo) => [
        grupo.id,
        await totalDeGrupo(db, sesion.usuario_id, cartera_id, grupo.id, periodo),
      ] as const),
    ),
  )


  /**
   * Los movimientos de **esta** cartera, filtrados por la URL.
   *
   * `listarMovimientos` no acepta `cartera_id`: R10 prohibe aceptar una cartera declarada, y
   * el repositorio deduce la cartera de la cuenta de cada fila y filtra por
   * `carteras.usuario_id`. Devuelve, entonces, los movimientos de **todas** las carteras del
   * usuario, que es lo que R9 pide en plural.
   *
   * Esta pagina es de una sola cartera, asi que el recorte se hace aca sobre `cartera_id`, que
   * la fila ya trae derivado (D2). Es un filtro sobre un entero, no sobre dinero: no toca la
   * regla del dinero y no necesita ir en SQL. Lo que **no** se hace es pasarle un
   * `cartera_id` al repositorio para que recorte el, porque ese identificador viene de la URL
   * y el repositorio no tiene forma de saber que es de verdad.
   */
  const movimientosDeEstaCartera = await listarMovimientos(
    db,
    sesion.usuario_id,
    filtroDeRepos(filtroUrl.datos),
  )

  /**
   * La fila del repositorio, reducida a lo que la vista necesita.
   *
   * Va en una funcion porque la lista y la lista de eliminados tienen que dibujar **la misma
   * fila**: si cada una mapeara a su manera, un movimiento borrado y ese mismo restaurado se
   * verian distinto, y el usuario no reconoceria que es el mismo.
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

  const movimientos: MovimientoEnVista[] = movimientosDeEstaCartera
    .filter((movimiento) => movimiento.cartera_id === cartera_id)
    .map(aEnVista)

  /**
   * Los eliminados de esta cartera, para poder restaurar.
   *
   * Sin esto, R6 seria solo la mitad de lo que dice: la fila se conserva, pero no hay de
   * donde volver a tomarla. Sin filtros a proposito —un filtro que oculta el unico movimiento
   * que se puede deshacer es peor que no tener filtro— y recortado por cartera igual que el
   * resto, por la misma razon.
   *
   * El `eliminado_en` viene como `Date` desde el driver, asi que el mapa lo pasa a string una
   * vez: el componente muestra la fecha del borrado y formatearla ahi cada fila seria
   * repetir el mismo trabajo.
   */
  const eliminadosEn = new Map<number, string | null>()
  const eliminados: MovimientoEnVista[] = (
    await listarMovimientosEliminados(db, sesion.usuario_id)
  )
    .filter((movimiento) => movimiento.cartera_id === cartera_id)
    .map((movimiento) => {
      eliminadosEn.set(
        movimiento.id,
        movimiento.eliminado_en ? movimiento.eliminado_en.toISOString() : null,
      )
      return aEnVista(movimiento)
    })

  /**
   * El filtro de la URL, como lo espera el repositorio.
   *
   * Los ids llegan como texto y `''` cuando no hay filtro, y `''` no es un `null`: se pasan
   * por `aEntero`, que devuelve `null` para lo que no es un entero, y el repositorio trata
   * `null` como "sin filtro". Es el mismo camino que usa esta pagina para la cartera de la URL.
   */
  function filtroDeRepos(datos: ReturnType<typeof validarFiltro>): FiltroMovimientos {
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
   * Si hay algo que limpiar del lado de la URL.
   *
   * Un filtro **mal escrito** tambien cuenta: la URL tiene un parametro que el usuario puso y
   * que no se puede aplicar, y el link de limpiar es la unica salida de ahi. Por eso el
   * `!filtroUrl.valido` va adelante y no se confunde con "no hay filtro".
   */
  const hayFiltro =
    !filtroUrl.valido ||
    Boolean(
      filtroUrl.datos.texto ||
        filtroUrl.datos.cuenta_id ||
        filtroUrl.datos.sobre_id ||
        filtroUrl.datos.tipo ||
        filtroUrl.datos.desde ||
        filtroUrl.datos.hasta,
    )

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-xs text-slate-500">
        <a href="/carteras" className="hover:underline">
          Carteras
        </a>
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{cartera.nombre}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Cuentas en {cartera.moneda}. El saldo de cada una se deriva de su saldo inicial y sus
        movimientos.
      </p>

      {/**
        El resumen de la cartera en el mes.

        R9 pide que la suma de los disponibles mas el dinero suelto iguale el patrimonio, y
        que si no cuadra sea un error. Mostrar las tres cifras juntas es la forma de que el
        usuario vea la invariante sin tener que summarla: si un dia no cierra, se nota en
        la pantalla y no en un ticket.
      */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs tracking-wide text-slate-500 uppercase">Patrimonio</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatear(resumen.patrimonio, cartera.moneda)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs tracking-wide text-slate-500 uppercase">Repartido en sobres</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatear(resumen.asignado, cartera.moneda)}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            resumen.hay_dinero_suelto
              ? 'border-slate-200 bg-white'
              : 'border-amber-300 bg-amber-50'
          }`}
        >
          <p className="text-xs tracking-wide text-slate-500 uppercase">Dinero suelto</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatear(resumen.dinero_suelto, cartera.moneda)}
          </p>
        </div>
      </section>

      {/**
        El panel de desbordes.

        R6 pide que se muestren destacados y que se avise si el dinero suelto los cubre, y
        R11 que un sobre archivado en negativo tambien aparezca aca. Por eso la lista sale
        de `listarSobresEnNegativo`, que no pregunta por `archivado`: un sobre en las dos
        condiciones tiene que verse una sola vez y en rojo.
      */}
      {enNegativo.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5">
          <h2 className="text-sm font-semibold tracking-wide text-red-900 uppercase">
            Sobres en negativo
          </h2>
          <p className="mt-1 text-sm text-red-800">
            No se tapan solos. Si el dinero suelto alcanza, podes cubrirlo desde el mismo
            sobre.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {enNegativo.map((sobre) => {
              const aviso = avisos.get(sobre.id)
              return (
                <li key={sobre.id} className="rounded-xl border border-red-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">
                      {sobre.nombre}
                      {sobre.archivado ? (
                        <span className="ml-2 text-xs text-slate-500">(archivado)</span>
                      ) : null}
                    </p>
                    <p className="font-mono text-sm font-semibold text-red-700 tabular-nums">
                      {formatear(sobre.disponible, cartera.moneda)}
                    </p>
                  </div>
                  {aviso?.cubre ? (
                    <p className="mt-1 text-xs text-emerald-800">
                      El dinero suelto alcanza para tapar este desborde.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-red-800">
                      El dinero suelto no cubre este desborde.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <h2 className="mt-10 text-sm font-semibold tracking-wide text-slate-500 uppercase">
        Grupos y sobres
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Los grupos ordenan los sobres. No tienen presupuesto propio: su total es la suma de
        los disponibles de los sobres que contienen.
      </p>
      <ul className="mt-4 flex flex-col gap-8">
        {gruposActivos.map((grupo) => {
          const delGrupo = sobresPorGrupo.get(grupo.id) ?? []
          const total = totales.get(grupo.id) ?? '0.00'
          return (
            <li key={grupo.id}>
              <FilaGrupo
                cartera_id={cartera.id}
                grupo_id={grupo.id}
                nombre={grupo.nombre}
                orden={grupo.orden}
              />
              {/**
                El total vive en un `<p>` hermano y no en la lista desplegada: R35 pide
                que al plegar un grupo se oculten sus sobres pero que el total siga a la
                vista. Por eso el `<details>` lleva `open` inicial y el total queda fuera:
                plegado se ven la cifra y el resumen, no los sobres.
              */}
              <p className="mt-2 ml-4 text-sm text-slate-500">
                Total del grupo:{' '}
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatear(total, cartera.moneda)}
                </span>{' '}
                en {delGrupo.length}{' '}
                {delGrupo.length === 1 ? 'sobre' : 'sobres'}
              </p>
              <details className="mt-2" open>
                <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-900">
                  Ver sobres
                </summary>
                <ul className="mt-3 ml-4 flex flex-col gap-3 border-l border-slate-200 pl-4">
                {delGrupo.map((sobre) => (
                  <FilaSobre
                    key={sobre.id}
                    cartera_id={cartera.id}
                    sobre_id={sobre.id}
                    nombre={sobre.nombre}
                    disponible={sobre.disponible}
                    negativo={sobre.negativo}
                    eliminable={sobre.eliminable}
                    periodo={periodo}
                    moneda={cartera.moneda}
                    grupo_id={sobre.grupo_id}
                    grupos={gruposActivos.map((g) => ({ id: g.id, nombre: g.nombre }))}
                    otrosSobres={sobres
                      .filter((otro) => otro.id !== sobre.id)
                      .map((otro) => ({ id: otro.id, nombre: otro.nombre }))}
                    dinero_suelto={avisos.get(sobre.id)?.cubre ? resumen.dinero_suelto : ''}
                    asignaciones={asignacionesPorSobre.get(sobre.id) ?? []}
                  />
                ))}
                {delGrupo.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    Este grupo todavia no tiene sobres.
                  </li>
                ) : null}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
      {gruposActivos.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          Todavia no hay grupos en esta cartera.
        </p>
      ) : null}
      {gruposArchivados.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {gruposArchivados.map((grupo) => (
            <FilaGrupoArchivado
              key={grupo.id}
              cartera_id={cartera.id}
              grupo_id={grupo.id}
              nombre={grupo.nombre}
            />
          ))}
        </ul>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nuevo grupo</h2>
        <FormularioNuevoGrupo cartera_id={cartera.id} />
      </section>

      <h2 className="mt-10 text-sm font-semibold tracking-wide text-slate-500 uppercase">
        Cuentas
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {activas.map((cuenta) => (
          <FilaCuenta
            key={cuenta.id}
            cartera_id={cartera.id}
            cuenta_id={cuenta.id}
            nombre={cuenta.nombre}
            tipo={cuenta.tipo}
            saldo={cuenta.saldo}
            saldo_inicial={cuenta.saldo_inicial}
            moneda={cartera.moneda}
            tieneMovimientos={conMovimiento.get(cuenta.id) ?? false}
          />
        ))}
      </ul>

      {activas.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          Todavia no hay cuentas en esta cartera.
        </p>
      ) : null}

      {archivadas.length > 0 ? (
        <>
          <h2 className="mt-10 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Archivadas
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {archivadas.map((cuenta) => (
              <FilaCuentaArchivada
                key={cuenta.id}
                cartera_id={cartera.id}
                cuenta_id={cuenta.id}
                nombre={cuenta.nombre}
                saldo={saldoArchivada.get(cuenta.id) ?? '0.00'}
                moneda={cartera.moneda}
              />
            ))}
          </ul>
        </>
      ) : null}

      {archivadosPlanos.length > 0 ? (
        <>
          <h2 className="mt-10 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Sobres archivados
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Un sobre archivado conserva su historial y sigue admitiendo devoluciones, pero no
            recibe asignaciones.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {archivadosPlanos
              .filter((sobre) => !sobre.negativo)
              .map((sobre) => (
                <FilaSobreArchivado
                  key={sobre.id}
                  cartera_id={cartera.id}
                  sobre_id={sobre.id}
                  nombre={sobre.nombre}
                  disponible={sobre.disponible}
                  enNegativo={sobre.negativo}
                  moneda={cartera.moneda}
                  periodo={periodo}
                />
              ))}
          </ul>
        </>
      ) : null}

      {archivadosConSaldo.length > 0 ? (
        <>
          <h2 className="mt-8 text-sm font-semibold tracking-wide text-amber-700 uppercase">
            Archivados con dinero
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Recibieron devoluciones y siguen archivados: el disponible quedo sin destino. Los
            que estan en negativo ya salen arriba, en rojo.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {archivadosConSaldo.map((sobre) => (
              <FilaSobreArchivado
                key={sobre.id}
                cartera_id={cartera.id}
                sobre_id={sobre.id}
                nombre={sobre.nombre}
                disponible={sobre.disponible}
                enNegativo={sobre.negativo}
                moneda={cartera.moneda}
                periodo={periodo}
              />
            ))}
          </ul>
        </>
      ) : null}

      {gruposActivos.length > 0 ? (
        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Nuevo sobre</h2>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            El sobre nace con disponible cero: no tiene asignaciones ni movimientos todavia.
          </p>
          <FormularioNuevoSobre
            cartera_id={cartera.id}
            grupos={gruposActivos.map((grupo) => ({ id: grupo.id, nombre: grupo.nombre }))}
          />
        </section>
      ) : null}

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nueva cuenta</h2>
        <p className="mt-1 mb-5 text-sm text-slate-500">
          El saldo inicial es lo que hay hoy. El saldo real se calcula solo con los movimientos.
        </p>
        <FormularioNuevaCuenta cartera_id={cartera.id} />
      </section>

      <h2 className="mt-10 text-sm font-semibold tracking-wide text-slate-500 uppercase">
        Movimientos
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        El saldo de cada cuenta sale de su saldo inicial mas estos movimientos. Un movimiento sin
        sobre queda pendiente: su dinero esta en la cuenta y todavia no tiene destino.
      </p>
      {activas.length > 0 ? (
        <>
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Nuevo movimiento</h3>
            <p className="mt-1 mb-5 text-sm text-slate-500">
              Una devolucion es un ingreso con sobre: el sobre recupera lo gastado.
            </p>
            <FormularioNuevoMovimiento
              cartera_id={cartera.id}
              cuentas={activas.map((cuenta) => ({ id: cuenta.id, nombre: cuenta.nombre }))}
              sobres={sobres.map((sobre) => ({ id: sobre.id, nombre: sobre.nombre }))}
              periodo={periodo}
            />
          </section>

          {/*
            Los traspasos van en su propia seccion y no como un tipo mas del formulario de
            arriba, por dos razones que son de R2. Una: un traspaso no puede llevar sobre, y el
            formulario de movimiento no tiene forma de no ofrecerlo. Dos: el alta de traspaso
            pide **dos** cuentas, y ese par no cabe en el select de cuenta unica.

            Solo sale con dos o mas cuentas activas: con una sola no hay traspaso posible, y
            R1 prohibe el alta vacia. No es un caso raro, es el estado de una cartera recien
            creada.
          */}
          {activas.length > 1 ? (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Nuevo traspaso</h3>
              <p className="mt-1 mb-5 text-sm text-slate-500">
                Mueve dinero entre dos cuentas de esta cartera sin tocar ningun sobre. No puede
                cruzar carteras: cada una tiene su moneda y no hay conversion.
              </p>
              <FormularioNuevoTraspaso
                cartera_id={cartera.id}
                cuentas={activas.map((cuenta) => ({ id: cuenta.id, nombre: cuenta.nombre }))}
                periodo={periodo}
              />
            </section>
          ) : null}
        </>
      ) : null}

      <div className="mt-8">
        <ListaMovimientos
          cartera_id={cartera.id}
          movimientos={movimientos}
          cuentas={activas.map((cuenta) => ({ id: cuenta.id, nombre: cuenta.nombre }))}
          sobres={sobres.map((sobre) => ({ id: sobre.id, nombre: sobre.nombre }))}
          moneda={cartera.moneda}
          periodo={periodo}
          filtro={{
            texto: filtroUrl.datos.texto,
            cuenta_id: filtroUrl.datos.cuenta_id,
            sobre_id: filtroUrl.datos.sobre_id,
            tipo: filtroUrl.datos.tipo ?? '',
            desde: filtroUrl.datos.desde,
            hasta: filtroUrl.datos.hasta,
          }}
          hayFiltro={hayFiltro}
          filtroInvalido={!filtroUrl.valido}
        />

        <ListaMovimientosEliminados
          cartera_id={cartera_id}
          movimientos={eliminados}
          moneda={cartera.moneda}
          eliminados_en={eliminadosEn}
        />
      </div>
    </main>
  )
}
