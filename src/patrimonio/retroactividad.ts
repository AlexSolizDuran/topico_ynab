/**
 * Detección de retroactividad y periodos cerrados para la capacidad de patrimonio.
 *
 * Cumple con R3:
 * - Cuando el usuario corrija, registre o elimine movimientos con fechas de periodos
 *   anteriores, el sistema informa al usuario que la historia cambió.
 */

export function obtenerPeriodoActual(fechaRef: Date = new Date()): string {
  const anio = fechaRef.getFullYear()
  const mes = String(fechaRef.getMonth() + 1).padStart(2, '0')
  return `${anio}-${mes}`
}

/**
 * Normaliza una fecha ('YYYY-MM-DD') o periodo ('YYYY-MM') al formato de periodo 'YYYY-MM'.
 */
export function normalizarPeriodo(fechaOPeriodo: string): string {
  return fechaOPeriodo.trim().slice(0, 7)
}

/**
 * Determina si una fecha o periodo corresponde a un periodo ya cerrado
 * (estrictamente anterior al periodo de referencia actual).
 */
export function esPeriodoCerrado(
  fechaOPeriodo: string,
  periodoReferencia: string = obtenerPeriodoActual(),
): boolean {
  const periodo = normalizarPeriodo(fechaOPeriodo)
  return periodo < periodoReferencia
}

export const MENSAJE_HISTORIA_MODIFICADA = 'La historia del patrimonio cambió.'

/**
 * Evalúa si una operación en una fecha dada altera periodos cerrados y retorna
 * el aviso correspondiente si aplica.
 */
export function detectarAfectacionHistorica(
  fechaOPeriodo: string,
  periodoReferencia?: string,
): { historiaModificada: boolean; aviso?: string } {
  if (esPeriodoCerrado(fechaOPeriodo, periodoReferencia)) {
    return {
      historiaModificada: true,
      aviso: MENSAJE_HISTORIA_MODIFICADA,
    }
  }
  return {
    historiaModificada: false,
  }
}
