import { describe, expect, it } from 'vitest'
import {
  aCentimos,
  calcularPeriodosRestantes,
  calcularProgresoMeta,
  deCentimos,
} from '../../src/repos/metas'

describe('090: calculos de progreso y ritmo de metas', () => {
  it('convierte importes y centimos con precision exacta (BigInt)', () => {
    expect(aCentimos('20000.00')).toBe(2000000n)
    expect(aCentimos('0.50')).toBe(50n)
    expect(aCentimos('-10.25')).toBe(-1025n)
    expect(deCentimos(2000000n)).toBe('20000.00')
    expect(deCentimos(50n)).toBe('0.50')
    expect(deCentimos(-1025n)).toBe('-10.25')
  })

  it('calcula periodos restantes entre meses inclusivos', () => {
    // 2026-09 a 2026-12: septiembre, octubre, noviembre, diciembre = 4 periodos
    expect(calcularPeriodosRestantes('2026-09', '2026-12-01')).toBe(4)
    expect(calcularPeriodosRestantes('2026-09', '2026-09-15')).toBe(1)
    expect(calcularPeriodosRestantes('2026-09', '2026-08-31')).toBe(0)
  })

  it('R2: calcula avance de una meta (12,400 de 20,000 -> 62% y 7,600 restante)', () => {
    const res = calcularProgresoMeta({
      monto_objetivo: '20000.00',
      disponible: '12400.00',
      fecha_limite: '2026-12-01',
      periodoActual: '2026-09',
    })

    expect(res.monto_objetivo).toBe('20000.00')
    expect(res.disponible).toBe('12400.00')
    expect(res.restante).toBe('7600.00')
    expect(res.porcentaje).toBe(62)
  })

  it('R2: calcula ritmo necesario por periodo (faltan 7,600 y quedan 4 periodos -> 1,900)', () => {
    const res = calcularProgresoMeta({
      monto_objetivo: '20000.00',
      disponible: '12400.00',
      fecha_limite: '2026-12-01',
      periodoActual: '2026-09',
      asignadoEnPeriodo: '1900.00',
    })

    expect(res.periodos_restantes).toBe(4)
    expect(res.ritmo_periodo).toBe('1900.00')
    expect(res.estado_visual).toBe('en_camino')
  })

  it('R2: meta sin fecha limite muestra avance y restante sin ritmo por periodo', () => {
    const res = calcularProgresoMeta({
      monto_objetivo: '10000.00',
      disponible: '3000.00',
      fecha_limite: null,
      periodoActual: '2026-09',
    })

    expect(res.ritmo_periodo).toBeNull()
    expect(res.periodos_restantes).toBeNull()
    expect(res.restante).toBe('7000.00')
    expect(res.porcentaje).toBe(30)
    expect(res.estado_visual).toBe('en_camino')
  })

  it('R3: meta que se retrasa (requiere 2,000 por periodo y lleva 500 asignados)', () => {
    // Objetivo 8,000, disponible 0, faltan 4 periodos => ritmo = 2,000
    const res = calcularProgresoMeta({
      monto_objetivo: '8000.00',
      disponible: '500.00',
      fecha_limite: '2026-12-01',
      periodoActual: '2026-09',
      asignadoEnPeriodo: '500.00',
    })

    // Ritmo: 8000 - 500 = 7500 / 4 = 1875
    // Si ritmo_periodo es 2000 con 500 asignados:
    const resExacto = calcularProgresoMeta({
      monto_objetivo: '8000.00',
      disponible: '0.00',
      fecha_limite: '2026-12-01',
      periodoActual: '2026-09',
      asignadoEnPeriodo: '500.00',
    })

    expect(resExacto.ritmo_periodo).toBe('2000.00')
    expect(resExacto.estado_visual).toBe('retrasada')
    expect(resExacto.falta_para_ritmo).toBe('1500.00')
  })

  it('R3: meta que se recupera al asignar el ritmo necesario', () => {
    const resRecuperada = calcularProgresoMeta({
      monto_objetivo: '8000.00',
      disponible: '2000.00',
      fecha_limite: '2026-12-01',
      periodoActual: '2026-09',
      asignadoEnPeriodo: '2000.00',
    })

    expect(resRecuperada.estado_visual).toBe('en_camino')
  })

  it('R3: fecha limite superada sin alcanzar objetivo queda retrasada', () => {
    const resVencida = calcularProgresoMeta({
      monto_objetivo: '5000.00',
      disponible: '3000.00',
      fecha_limite: '2026-08-31',
      periodoActual: '2026-09',
      fechaHoy: '2026-09-15',
    })

    expect(resVencida.vencida).toBe(true)
    expect(resVencida.estado_visual).toBe('retrasada')
  })

  it('R3: meta cumplida antes de tiempo cuando disponible >= monto_objetivo', () => {
    const resCumplida = calcularProgresoMeta({
      monto_objetivo: '10000.00',
      disponible: '10500.00',
      fecha_limite: '2026-12-01',
      periodoActual: '2026-09',
    })

    expect(resCumplida.estado_visual).toBe('cumplida')
    expect(resCumplida.restante).toBe('0.00')
    expect(resCumplida.porcentaje).toBe(105)
  })
})
