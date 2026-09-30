import { describe, expect, it } from 'vitest'
import {
  esquemaAltaRegla,
  esquemaEdicionRegla,
} from '../../src/recurrencias/validacion'

describe('080: validacion de reglas recurrentes', () => {
  const baseValida = {
    cartera_id: '1',
    cuenta_id: '2',
    sobre_id: '3',
    descripcion: 'Alquiler',
    monto: '12000.00',
    tipo: 'gasto' as const,
    frecuencia: 'mensual' as const,
    dia: '1',
    mes: null,
    fecha_inicio: '2026-01-01',
    comercio: 'Inmobiliaria',
  }

  it('acepta una regla mensual valida', () => {
    const res = esquemaAltaRegla.safeParse(baseValida)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.monto).toBe('12000.00')
      expect(res.data.dia).toBe(1)
      expect(res.data.mes).toBeNull()
    }
  })

  it('acepta una regla sin sobre (sobre_id null o vacio)', () => {
    const res1 = esquemaAltaRegla.safeParse({ ...baseValida, sobre_id: null })
    expect(res1.success).toBe(true)
    if (res1.success) expect(res1.data.sobre_id).toBeNull()

    const res2 = esquemaAltaRegla.safeParse({ ...baseValida, sobre_id: '' })
    expect(res2.success).toBe(true)
    if (res2.success) expect(res2.data.sobre_id).toBeNull()
  })

  it('rechaza una regla anual sin mes', () => {
    const res = esquemaAltaRegla.safeParse({
      ...baseValida,
      frecuencia: 'anual',
      mes: null,
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0]?.message).toContain('mes')
    }
  })

  it('acepta una regla anual con mes valido', () => {
    const res = esquemaAltaRegla.safeParse({
      ...baseValida,
      frecuencia: 'anual',
      mes: '6',
    })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.mes).toBe(6)
  })

  it('rechaza un dia invalido (0 o mayor a 31)', () => {
    const res0 = esquemaAltaRegla.safeParse({ ...baseValida, dia: '0' })
    expect(res0.success).toBe(false)

    const res32 = esquemaAltaRegla.safeParse({ ...baseValida, dia: '32' })
    expect(res32.success).toBe(false)
  })

  it('rechaza un mes invalido (menor a 1 o mayor a 12)', () => {
    const res0 = esquemaAltaRegla.safeParse({ ...baseValida, frecuencia: 'anual', mes: '0' })
    expect(res0.success).toBe(false)

    const res13 = esquemaAltaRegla.safeParse({ ...baseValida, frecuencia: 'anual', mes: '13' })
    expect(res13.success).toBe(false)
  })

  it('rechaza un importe en cero o negativo', () => {
    const resCero = esquemaAltaRegla.safeParse({ ...baseValida, monto: '0' })
    expect(resCero.success).toBe(false)

    const resNeg = esquemaAltaRegla.safeParse({ ...baseValida, monto: '-500' })
    expect(resNeg.success).toBe(false)
  })

  it('rechaza un importe no numerico o con mas de 2 decimales', () => {
    const resLetras = esquemaAltaRegla.safeParse({ ...baseValida, monto: 'abc' })
    expect(resLetras.success).toBe(false)

    const resDec = esquemaAltaRegla.safeParse({ ...baseValida, monto: '10.555' })
    expect(resDec.success).toBe(false)
  })

  it('rechaza una fecha con dia inexistente en calendario', () => {
    const res = esquemaAltaRegla.safeParse({ ...baseValida, fecha_inicio: '2026-02-31' })
    expect(res.success).toBe(false)
  })

  it('valida el esquema de edicion', () => {
    const res = esquemaEdicionRegla.safeParse({
      id: '10',
      cuenta_id: '2',
      sobre_id: null,
      descripcion: 'Sueldo',
      monto: '50000.00',
      tipo: 'ingreso',
      frecuencia: 'mensual',
      dia: '15',
      mes: null,
      fecha_inicio: '2026-01-01',
      activa: true,
      comercio: null,
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.id).toBe(10)
      expect(res.data.tipo).toBe('ingreso')
    }
  })
})
