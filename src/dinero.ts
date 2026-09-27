/**
 * La regla del dinero del proyecto.
 *
 * Los importes son `numeric(16,2)` de Postgres y SIEMPRE se manejan como
 * `string`. Nunca `number`, nunca `parseFloat`, nunca `Number`.
 *
 * El motivo esta medido: `Number('1234567890123456.78')` produce
 * `'1234567890123456.75'`. Un float de 64 bits tiene 15-17 digitos
 * significativos y un `numeric(16,2)` ocupa hasta 16, asi que en magnitudes
 * grandes un float pierde centavos y no lanza ningun error.
 *
 * Una trampa adicional: `Intl.NumberFormat.format()` convierte su argumento a
 * numero internamente, asi que pasarle el string directo deformaria la
 * cifra mostrada. Por eso `formatear` compone el resultado a partir de los
 * digitos exactos del string y solo toma de `Intl` la forma local (simbolo,
 * separadores y orden), nunca el valor.
 */

/** Un importe exacto. En la base es `numeric(16,2)`; en memoria, `string`. */
export type Dinero = string

const LOCALIDAD = 'es-MX'

interface Descomposicion {
  negativo: boolean
  entero: string
  decimales: string
}

/**
 * Divide el importe en signo, digitos enteros y digitos decimales, sin
 * tocar ningun numero. Solo manipulate texto.
 */
function descomponer(importe: Dinero): Descomposicion {
  const limpio = importe.trim()
  const negativo = limpio.startsWith('-')
  const sinSigno = negativo ? limpio.slice(1) : limpio
  const [enteroCrudo = '0', decimalesCrudos = ''] = sinSigno.split('.')

  // `numeric(16,2)` siempre devuelve dos decimales, pero un input escrito a
  // mano puede venir con uno o ninguno. Se completa a dos sin redondear.
  const decimales = (decimalesCrudos + '00').slice(0, 2)

  return {
    negativo,
    entero: enteroCrudo.replace(/^0+(?=\d)/, '') || '0',
    decimales,
  }
}

/** Inserta el separador de miles cada tres digitos, de derecha a izquierda. */
function agrupar(digitos: string, separador: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, () => separador)
}

/**
 * Compone el importe exacto con la forma de la localidad y la moneda.
 *
 * El valor nunca pasa por un `number`. De `Intl` solo se toman el simbolo, los
 * separadores y el ORDEN de las partes, que son datos de formato y no del
 * importe. Los digitos salen del string tal cual.
 */
export function formatear(importe: Dinero, moneda: string): string {
  const fmt = new Intl.NumberFormat(LOCALIDAD, {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  // Muestra negativa en un rango seguro: sirve para leer la FORMA local
  // (orden de las partes, simbolo, separadores), nunca el importe.
  const partes = fmt.formatToParts(-1234.56)

  const simbolo = partes.find((p) => p.type === 'currency')?.value ?? ''
  const separadorGrupos = partes.find((p) => p.type === 'group')?.value ?? ','
  const separadorDecimal = partes.find((p) => p.type === 'decimal')?.value ?? '.'

  const { negativo, entero, decimales } = descomponer(importe)
  const enteroAgrupado = agrupar(entero, separadorGrupos)

  let salida = ''
  let digitosPuestos = false

  for (const parte of partes) {
    switch (parte.type) {
      case 'minusSign':
        salida += negativo ? '-' : ''
        break
      case 'currency':
        salida += simbolo
        break
      case 'integer':
      case 'group':
        // La muestra trae varios `integer` separados por `group`. Los digitos
        // exactos, ya agrupados, se ponen una sola vez en la primera.
        if (!digitosPuestos) {
          salida += enteroAgrupado
          digitosPuestos = true
        }
        break
      case 'decimal':
        salida += separadorDecimal
        break
      case 'fraction':
        salida += decimales
        break
      case 'literal':
        salida += parte.value
        break
    }
  }

  return salida
}

/**
 * Importe para un campo de texto: sin simbolo, sin separador de miles y con el
 * separador decimal de la localidad. El valor sigue siendo el string exacto.
 */
export function paraCampo(importe: Dinero): string {
  const { negativo, entero, decimales } = descomponer(importe)
  const separadorDecimal = new Intl.NumberFormat(LOCALIDAD)
    .formatToParts(1.1)
    .find((p) => p.type === 'decimal')?.value
  return `${negativo ? '-' : ''}${entero}${separadorDecimal ?? '.'}${decimales}`
}

/** Un importe es negativo cuando su primer caracter es el signo menos. */
export function esNegativo(importe: Dinero): boolean {
  return importe.trim().startsWith('-')
}

/** Un importe es cero cuando no tiene signo y todos sus digitos son cero. */
export function esCero(importe: Dinero): boolean {
  const { entero, decimales } = descomponer(importe)
  return entero === '0' && decimales === '00'
}

/** Prefijo de suma o resta, para alinear columnas junto a un importe. */
export function signoDe(importe: Dinero): '' | '+' | '-' {
  if (esNegativo(importe)) return '-'
  return esCero(importe) ? '' : '+'
}
