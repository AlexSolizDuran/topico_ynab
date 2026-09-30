import type { Dinero } from '../dinero'

/**
 * Convierte un importe Dinero ('123.45', '-50.00') a céntimos enteros (BigInt).
 * Sin float, sin pérdida de centavos.
 */
export function aCentimos(valor: Dinero): bigint {
  const limpio = valor.trim()
  const negativo = limpio.startsWith('-')
  const sinSigno = negativo ? limpio.slice(1) : limpio
  const [entero = '0', decimales = ''] = sinSigno.split('.') as [string, string?]
  const cent = BigInt(entero || '0') * 100n + BigInt((decimales ?? '').padEnd(2, '0').slice(0, 2))
  return negativo ? -cent : cent
}

/**
 * Convierte céntimos enteros (BigInt) a Dinero exacto con dos decimales.
 */
export function deCentimos(centimos: bigint): Dinero {
  const negativo = centimos < 0n
  const abs = negativo ? -centimos : centimos
  const entero = abs / 100n
  const resto = abs % 100n
  const dec = resto.toString().padStart(2, '0')
  return `${negativo ? '-' : ''}${entero}.${dec}`
}

export interface VariacionPatrimonio {
  /** Diferencia con signo en formato Dinero (ej. '2000.00' o '-500.00'), o null si no hay periodo previo. */
  diferencia_absoluta: Dinero | null
  /** Variación en porcentaje numérico (ej. 7.14 o -5.25), o null si no hay previo o la base es 0. */
  variacion_porcentual: number | null
  /** Representación en texto para interfaz (ej. '+7.14%', '-5.25%', '0.00%'), o null si no hay previo. */
  porcentaje_texto: string | null
}

/**
 * Calcula la variación absoluta y porcentual del patrimonio entre dos periodos consecutivos.
 *
 * Cumple con R2:
 * - Si no hay periodo anterior (primer periodo de la serie): sin comparación previa (valores null).
 * - Si el periodo anterior existe: calcula diferencia absoluta y variación porcentual con redondeo a 2 decimales.
 */
export function calcularVariacion(
  patrimonioActual: Dinero,
  patrimonioAnterior: Dinero | null,
): VariacionPatrimonio {
  if (patrimonioAnterior === null) {
    return {
      diferencia_absoluta: null,
      variacion_porcentual: null,
      porcentaje_texto: null,
    }
  }

  const act = aCentimos(patrimonioActual)
  const ant = aCentimos(patrimonioAnterior)
  const diff = act - ant
  const difAbsoluta = deCentimos(diff)

  if (ant === 0n) {
    if (act === 0n) {
      return {
        diferencia_absoluta: '0.00',
        variacion_porcentual: 0,
        porcentaje_texto: '0.00%',
      }
    }
    // De 0 a un valor no nulo: la variación porcentual estándar no está definida matemáticamente
    return {
      diferencia_absoluta: difAbsoluta,
      variacion_porcentual: null,
      porcentaje_texto: null,
    }
  }

  const base = ant < 0n ? -ant : ant
  // Multiplicamos por 10000n para obtener centésimas de porcentaje (dos decimales)
  // Sumamos la mitad de la base con el signo correspondiente para redondeo al más cercano
  const ajusteRedondeo = diff >= 0n ? base / 2n : -base / 2n
  const centesimasPorcentaje = (diff * 10000n + ajusteRedondeo) / base
  const porcentajeNum = Number(centesimasPorcentaje) / 100

  const signo = porcentajeNum > 0 ? '+' : ''
  const porcentajeTexto = `${signo}${porcentajeNum.toFixed(2)}%`

  return {
    diferencia_absoluta: difAbsoluta,
    variacion_porcentual: porcentajeNum,
    porcentaje_texto: porcentajeTexto,
  }
}
