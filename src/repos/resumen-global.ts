import { sql } from 'drizzle-orm'
import type { Base } from '../db/tipos'
import type { Dinero } from '../dinero'
import { aCentimos, deCentimos } from '../patrimonio/calculos'
import { filas } from './filas'
import { disponibleDeSobre, saldoDeCuenta } from './fragmentos'

/**
 * Resumen global del usuario, SIEMPRE agrupado por moneda.
 *
 * El sistema no tiene tipo de cambio: `carteras` R2 y `panel` R11 prohiben combinar
 * importes de monedas distintas. Un "capital total" que sumara MXN y USD seria un numero
 * inventado, asi que este repositorio nunca devuelve esa suma: devuelve un grupo por
 * moneda, y cada grupo suma solo carteras de la misma moneda.
 *
 * Incluye carteras archivadas a proposito. Archivar exige saldo cero, pero conserva el
 * historial, y "todo lo que gaste" tiene que incluir los meses de una cartera que hoy
 * esta archivada. El capital de una archivada es cero por definicion, asi que no infla
 * ninguna cifra; el desglose por cartera la marca con `archivada`.
 *
 * Toda la aritmetica de importes va en enteros de centimos (`bigint`), nunca en `number`:
 * es exacta y respeta la regla del dinero. Las sumas crudas van en SQL.
 */

export interface PuntoFlujo {
  /** `YYYY-MM` en la serie mensual, `YYYY` en la anual, `YYYY-MM-DD` en la diaria. */
  clave: string
  ingresado: Dinero
  gastado: Dinero
  /** `ingresado - gastado`. */
  neto: Dinero
}

export interface CarteraResumen {
  id: number
  nombre: string
  moneda: string
  archivada: boolean
  patrimonio: Dinero
  en_sobres: Dinero
  dinero_suelto: Dinero
}

export interface ComercioResumen {
  comercio: string
  gastado: Dinero
  operaciones: number
}

export interface GrupoMoneda {
  moneda: string
  capital: {
    patrimonio: Dinero
    en_sobres: Dinero
    dinero_suelto: Dinero
  }
  flujo: {
    ingresado: Dinero
    gastado: Dinero
    neto: Dinero
  }
  carteras: CarteraResumen[]
  /** Ultimos `meses` meses terminando en `periodo`, con ceros en los meses sin movimiento. */
  mensual: PuntoFlujo[]
  /** Anios con actividad, del mas viejo al mas nuevo. */
  anual: PuntoFlujo[]
  /** Todos los dias del periodo, con ceros en los dias sin movimiento. */
  diario: PuntoFlujo[]
  /** Gastos del periodo con `comercio`, de mayor a menor. */
  top_comercios: ComercioResumen[]
}

export interface DatosResumenGlobal {
  periodo: string
  meses: number
  /** Un grupo por moneda, en orden alfabetico. Nunca se suman entre si. */
  grupos: GrupoMoneda[]
}

interface FilaFlujo {
  moneda: string
  clave: string
  ingresado: Dinero
  gastado: Dinero
}

/** Los ultimos `cantidad` meses terminando en `periodo`, del mas viejo al mas nuevo. */
function mesesHasta(periodo: string, cantidad: number): string[] {
  const [a, m] = periodo.split('-').map(Number)
  if (!a || !m) return []

  const meses: string[] = []
  let anio = a
  let mes = m
  for (let i = 0; i < cantidad; i++) {
    meses.unshift(`${anio}-${String(mes).padStart(2, '0')}`)
    mes -= 1
    if (mes === 0) {
      mes = 12
      anio -= 1
    }
  }
  return meses
}

/** Todos los dias del periodo `YYYY-MM`, como `YYYY-MM-DD`. */
function diasDeMes(periodo: string): string[] {
  const [a, m] = periodo.split('-').map(Number)
  if (!a || !m) return []

  // Dia 0 del mes siguiente es el ultimo dia de este mes.
  const total = new Date(a, m, 0).getDate()
  const dias: string[] = []
  for (let dia = 1; dia <= total; dia++) {
    dias.push(`${periodo}-${String(dia).padStart(2, '0')}`)
  }
  return dias
}

/** `ingresado - gastado`, en centimos exactos. */
function netoDe(ingresado: Dinero, gastado: Dinero): Dinero {
  return deCentimos(aCentimos(ingresado) - aCentimos(gastado))
}

/**
 * Capital, flujo y series de tiempo del usuario, agrupados por moneda.
 *
 * `periodo` (`YYYY-MM`) decide el corte del capital, el flujo del mes, la ventana de los
 * ultimos 12 meses, el dia a dia y los comercios. Las seis consultas van en paralelo y se
 * ensamblan despues, para que el panel no haga una consulta por cartera.
 */
export async function consultarResumenGlobal(
  db: Base,
  usuario_id: number,
  periodo: string,
  meses: number = 12,
): Promise<DatosResumenGlobal> {
  const ventanaMeses = mesesHasta(periodo, meses)
  const listaMeses = sql.join(
    ventanaMeses.map((mes) => sql`${mes}`),
    sql`, `,
  )

  const [
    filasCapital,
    filasFlujo,
    filasMensual,
    filasAnual,
    filasDiario,
    filasComercios,
  ] = await Promise.all([
    filas<{
      id: number
      nombre: string
      moneda: string
      archivada: boolean
      patrimonio: Dinero
      en_sobres: Dinero
    }>(
      db,
      sql`
        select
          k.id,
          k.nombre,
          k.moneda,
          k.archivada,
          coalesce((
            select sum(${saldoDeCuenta('c', periodo)})
            from cuentas c
            where c.cartera_id = k.id and c.eliminado_en is null
          ), 0)::numeric(16,2) as patrimonio,
          coalesce((
            select sum(${disponibleDeSobre('s', periodo)})
            from sobres s
            where s.cartera_id = k.id and s.eliminado_en is null
          ), 0)::numeric(16,2) as en_sobres
        from carteras k
        where k.usuario_id = ${usuario_id} and k.eliminado_en is null
        order by k.orden asc, k.id asc
      `,
    ),
    filas<{ moneda: string; ingresado: Dinero; gastado: Dinero }>(
      db,
      sql`
        select
          k.moneda,
          coalesce(sum(case when m.tipo = 'ingreso' then m.monto else 0 end), 0)::numeric(16,2) as ingresado,
          coalesce(sum(case when m.tipo = 'gasto' then -m.monto else 0 end), 0)::numeric(16,2) as gastado
        from movimientos m
        join cuentas c on c.id = m.cuenta_id
        join carteras k on k.id = c.cartera_id
        where k.usuario_id = ${usuario_id}
          and k.eliminado_en is null
          and c.eliminado_en is null
          and m.eliminado_en is null
          and m.tipo <> 'traspaso'
          and to_char(m.fecha, 'YYYY-MM') = ${periodo}
        group by k.moneda
      `,
    ),
    filas<FilaFlujo>(
      db,
      sql`
        select
          k.moneda,
          to_char(m.fecha, 'YYYY-MM') as clave,
          coalesce(sum(case when m.tipo = 'ingreso' then m.monto else 0 end), 0)::numeric(16,2) as ingresado,
          coalesce(sum(case when m.tipo = 'gasto' then -m.monto else 0 end), 0)::numeric(16,2) as gastado
        from movimientos m
        join cuentas c on c.id = m.cuenta_id
        join carteras k on k.id = c.cartera_id
        where k.usuario_id = ${usuario_id}
          and k.eliminado_en is null
          and c.eliminado_en is null
          and m.eliminado_en is null
          and m.tipo <> 'traspaso'
          and to_char(m.fecha, 'YYYY-MM') in (${listaMeses})
        group by k.moneda, to_char(m.fecha, 'YYYY-MM')
      `,
    ),
    filas<FilaFlujo>(
      db,
      sql`
        select
          k.moneda,
          to_char(m.fecha, 'YYYY') as clave,
          coalesce(sum(case when m.tipo = 'ingreso' then m.monto else 0 end), 0)::numeric(16,2) as ingresado,
          coalesce(sum(case when m.tipo = 'gasto' then -m.monto else 0 end), 0)::numeric(16,2) as gastado
        from movimientos m
        join cuentas c on c.id = m.cuenta_id
        join carteras k on k.id = c.cartera_id
        where k.usuario_id = ${usuario_id}
          and k.eliminado_en is null
          and c.eliminado_en is null
          and m.eliminado_en is null
          and m.tipo <> 'traspaso'
        group by k.moneda, to_char(m.fecha, 'YYYY')
      `,
    ),
    filas<FilaFlujo>(
      db,
      sql`
        select
          k.moneda,
          to_char(m.fecha, 'YYYY-MM-DD') as clave,
          coalesce(sum(case when m.tipo = 'ingreso' then m.monto else 0 end), 0)::numeric(16,2) as ingresado,
          coalesce(sum(case when m.tipo = 'gasto' then -m.monto else 0 end), 0)::numeric(16,2) as gastado
        from movimientos m
        join cuentas c on c.id = m.cuenta_id
        join carteras k on k.id = c.cartera_id
        where k.usuario_id = ${usuario_id}
          and k.eliminado_en is null
          and c.eliminado_en is null
          and m.eliminado_en is null
          and m.tipo <> 'traspaso'
          and to_char(m.fecha, 'YYYY-MM') = ${periodo}
        group by k.moneda, m.fecha
      `,
    ),
    filas<{ moneda: string; comercio: string; gastado: Dinero; operaciones: number }>(
      db,
      sql`
        select
          k.moneda,
          m.comercio,
          coalesce(sum(-m.monto), 0)::numeric(16,2) as gastado,
          count(*)::int as operaciones
        from movimientos m
        join cuentas c on c.id = m.cuenta_id
        join carteras k on k.id = c.cartera_id
        where k.usuario_id = ${usuario_id}
          and k.eliminado_en is null
          and c.eliminado_en is null
          and m.eliminado_en is null
          and m.tipo = 'gasto'
          and m.comercio is not null
          and btrim(m.comercio) <> ''
          and to_char(m.fecha, 'YYYY-MM') = ${periodo}
        group by k.moneda, m.comercio
        order by gastado desc
      `,
    ),
  ])

  const grupos = new Map<string, GrupoMoneda>()

  function grupoDe(moneda: string): GrupoMoneda {
    let grupo = grupos.get(moneda)
    if (!grupo) {
      grupo = {
        moneda,
        capital: { patrimonio: '0.00', en_sobres: '0.00', dinero_suelto: '0.00' },
        flujo: { ingresado: '0.00', gastado: '0.00', neto: '0.00' },
        carteras: [],
        mensual: [],
        anual: [],
        diario: [],
        top_comercios: [],
      }
      grupos.set(moneda, grupo)
    }
    return grupo
  }

  const capitalPorMoneda = new Map<string, { patrimonio: bigint; en_sobres: bigint }>()

  for (const fila of filasCapital) {
    const grupo = grupoDe(fila.moneda)
    const dineroSuelto = deCentimos(aCentimos(fila.patrimonio) - aCentimos(fila.en_sobres))

    grupo.carteras.push({
      id: fila.id,
      nombre: fila.nombre,
      moneda: fila.moneda,
      archivada: fila.archivada,
      patrimonio: fila.patrimonio,
      en_sobres: fila.en_sobres,
      dinero_suelto: dineroSuelto,
    })

    const acumulado = capitalPorMoneda.get(fila.moneda) ?? { patrimonio: 0n, en_sobres: 0n }
    acumulado.patrimonio += aCentimos(fila.patrimonio)
    acumulado.en_sobres += aCentimos(fila.en_sobres)
    capitalPorMoneda.set(fila.moneda, acumulado)
  }

  for (const [moneda, acumulado] of capitalPorMoneda) {
    const grupo = grupoDe(moneda)
    grupo.capital = {
      patrimonio: deCentimos(acumulado.patrimonio),
      en_sobres: deCentimos(acumulado.en_sobres),
      dinero_suelto: deCentimos(acumulado.patrimonio - acumulado.en_sobres),
    }
  }

  for (const fila of filasFlujo) {
    const grupo = grupoDe(fila.moneda)
    grupo.flujo = {
      ingresado: fila.ingresado,
      gastado: fila.gastado,
      neto: netoDe(fila.ingresado, fila.gastado),
    }
  }

  function seriesPorMoneda(
    filasSerie: FilaFlujo[],
    claves: string[],
  ): Map<string, Map<string, PuntoFlujo>> {
    const porMoneda = new Map<string, Map<string, PuntoFlujo>>()

    const anotar = (moneda: string, clave: string, ingresado: Dinero, gastado: Dinero) => {
      let porClave = porMoneda.get(moneda)
      if (!porClave) {
        porClave = new Map()
        porMoneda.set(moneda, porClave)
      }
      porClave.set(clave, { clave, ingresado, gastado, neto: netoDe(ingresado, gastado) })
    }

    for (const fila of filasSerie) {
      anotar(fila.moneda, fila.clave, fila.ingresado, fila.gastado)
    }

    // Rellena los huecos con ceros para que la serie tenga un punto por barra.
    for (const moneda of grupos.keys()) {
      for (const clave of claves) {
        if (!porMoneda.get(moneda)?.has(clave)) {
          anotar(moneda, clave, '0.00', '0.00')
        }
      }
    }

    return porMoneda
  }

  const clavesMensual = ventanaMeses
  const serieMensual = seriesPorMoneda(filasMensual, clavesMensual)
  for (const grupo of grupos.values()) {
    const porClave = serieMensual.get(grupo.moneda)
    grupo.mensual = clavesMensual.map(
      (clave) => porClave?.get(clave) ?? { clave, ingresado: '0.00', gastado: '0.00', neto: '0.00' },
    )
  }

  const clavesAnual = Array.from(new Set(filasAnual.map((fila) => fila.clave))).sort()
  const serieAnual = seriesPorMoneda(filasAnual, clavesAnual)
  for (const grupo of grupos.values()) {
    const porClave = serieAnual.get(grupo.moneda)
    grupo.anual = clavesAnual
      .filter((clave) => porClave?.has(clave))
      .map((clave) => porClave!.get(clave)!)
  }

  const clavesDiario = diasDeMes(periodo)
  const serieDiario = seriesPorMoneda(filasDiario, clavesDiario)
  for (const grupo of grupos.values()) {
    const porClave = serieDiario.get(grupo.moneda)
    grupo.diario = clavesDiario.map(
      (clave) => porClave?.get(clave) ?? { clave, ingresado: '0.00', gastado: '0.00', neto: '0.00' },
    )
  }

  for (const fila of filasComercios) {
    grupoDe(fila.moneda).top_comercios.push({
      comercio: fila.comercio,
      gastado: fila.gastado,
      operaciones: fila.operaciones,
    })
  }

  return {
    periodo,
    meses,
    grupos: Array.from(grupos.values()).sort((a, b) => a.moneda.localeCompare(b.moneda)),
  }
}
