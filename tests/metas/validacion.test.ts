import { describe, expect, it } from 'vitest'
import { esquemaAltaMeta } from '../../src/metas/validacion'

describe('090: validacion de metas', () => {
  it('acepta una meta valida con fecha limite', () => {
    const res = esquemaAltaMeta.safeParse({
      sobre_id: '1',
      monto_objetivo: '20000.00',
      fecha_limite: '2026-12-01',
    })

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.sobre_id).toBe(1)
    expect(res.data.monto_objetivo).toBe('20000.00')
    expect(res.data.fecha_limite).toBe('2026-12-01')
  })

  it('acepta una meta valida sin fecha limite (null o vacia)', () => {
    const res = esquemaAltaMeta.safeParse({
      sobre_id: 2,
      monto_objetivo: '5000',
      fecha_limite: '',
    })

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.monto_objetivo).toBe('5000.00')
    expect(res.data.fecha_limite).toBeNull()
  })

  it('rechaza monto objetivo igual a cero', () => {
    const res = esquemaAltaMeta.safeParse({
      sobre_id: 1,
      monto_objetivo: '0',
    })

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error.issues[0]?.message).toMatch(/mayor que cero/i)
  })

  it('rechaza monto objetivo negativo', () => {
    const res = esquemaAltaMeta.safeParse({
      sobre_id: 1,
      monto_objetivo: '-500.00',
    })

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error.issues[0]?.message).toMatch(/positivo/i)
  })

  it('rechaza monto con mas de dos decimales', () => {
    const res = esquemaAltaMeta.safeParse({
      sobre_id: 1,
      monto_objetivo: '100.555',
    })

    expect(res.success).toBe(false)
  })

  it('rechaza fecha limite invalida en calendario', () => {
    const res = esquemaAltaMeta.safeParse({
      sobre_id: 1,
      monto_objetivo: '1000.00',
      fecha_limite: '2026-02-30',
    })

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error.issues[0]?.message).toMatch(/fecha limite/i)
  })

  it('rechaza sobre_id invalido o no entero', () => {
    const res = esquemaAltaMeta.safeParse({
      sobre_id: 'abc',
      monto_objetivo: '1000.00',
    })

    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error.issues[0]?.message).toMatch(/sobre valido/i)
  })
})
