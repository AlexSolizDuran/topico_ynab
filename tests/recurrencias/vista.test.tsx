import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { ReglaRecurrente } from '@/db/tablas/recurrencias'

vi.mock('@/recurrencias/acciones', () => ({
  accionCrearReglaRecurrente: async () => ({ ok: true }),
  accionEditarReglaRecurrente: async () => ({ ok: true }),
  accionAlternarReglaRecurrente: async () => ({ ok: true }),
  accionEliminarReglaRecurrente: async () => ({ ok: true }),
  accionMaterializarRecurrencias: async () => ({ ok: true }),
}))

const {
  FormularioNuevaRegla,
  FilaRegla,
  ListaReglasRecurrentes,
} = await import('@/components/recurrencias')

function html(elemento: ReactElement): string {
  return renderToStaticMarkup(elemento)
}

describe('080: vistas de recurrencias', () => {
  const cuentasMock = [
    { id: 1, nombre: 'Cuenta Bancaria' },
    { id: 2, nombre: 'Billetera Efectivo' },
  ]

  const sobresMock = [
    { id: 10, nombre: 'Alquiler' },
    { id: 20, nombre: 'Servicios' },
  ]

  const reglaMock: ReglaRecurrente = {
    id: 1,
    cartera_id: 100,
    cuenta_id: 1,
    sobre_id: 10,
    descripcion: 'Renta mensual piso',
    monto: '8000.00',
    tipo: 'gasto',
    frecuencia: 'mensual',
    dia: 1,
    mes: null,
    fecha_inicio: '2026-01-01',
    activa: true,
    comercio: 'Inmobiliaria',
    creado_en: new Date(),
    actualizado_en: new Date(),
    eliminado_en: null,
  }

  describe('FormularioNuevaRegla', () => {
    it('renderiza todos los campos obligatorios del formulario', () => {
      const marcado = html(
        <FormularioNuevaRegla
          cartera_id={100}
          cuentas={cuentasMock}
          sobres={sobresMock}
          token_proteccion="tok-123"
        />,
      )

      expect(marcado).toContain('Nueva regla recurrente')
      expect(marcado).toContain('Descripcion')
      expect(marcado).toContain('Importe')
      expect(marcado).toContain('Frecuencia')
      expect(marcado).toContain('Cuenta')
      expect(marcado).toContain('Sobre')
      expect(marcado).toContain('Dia')
      expect(marcado).toContain('Mes (requerido para anual)')
      expect(marcado).toContain('Fecha de inicio')
      expect(marcado).toContain('tok-123')
      expect(marcado).toContain('Cuenta Bancaria')
      expect(marcado).toContain('Alquiler')
    })
  })

  describe('FilaRegla', () => {
    it('muestra el estado activo, la frecuencia y los botones de accion', () => {
      const marcado = html(
        <FilaRegla
          regla={reglaMock}
          moneda="MXN"
          nombreCuenta="Cuenta Bancaria"
          nombreSobre="Alquiler"
          token_proteccion="tok-abc"
        />,
      )

      expect(marcado).toContain('Renta mensual piso')
      expect(marcado).toContain('Activa')
      expect(marcado).toContain('mensual')
      expect(marcado).toContain('Cuenta: Cuenta Bancaria')
      expect(marcado).toContain('Sobre: Alquiler')
      expect(marcado).toContain('Desactivar')
      expect(marcado).toContain('Eliminar')
    })

    it('muestra el estado inactivo con la opcion de activar', () => {
      const reglaInactiva = { ...reglaMock, activa: false }
      const marcado = html(
        <FilaRegla
          regla={reglaInactiva}
          moneda="MXN"
          nombreCuenta="Cuenta Bancaria"
          token_proteccion="tok-abc"
        />,
      )

      expect(marcado).toContain('Inactiva')
      expect(marcado).toContain('Activar')
    })
  })

  describe('ListaReglasRecurrentes', () => {
    it('muestra mensaje vacio cuando no hay reglas', () => {
      const cuentasMap = new Map([[1, 'Cuenta Bancaria']])
      const sobresMap = new Map([[10, 'Alquiler']])

      const marcado = html(
        <ListaReglasRecurrentes
          reglas={[]}
          moneda="MXN"
          cuentas={cuentasMap}
          sobres={sobresMap}
        />,
      )

      expect(marcado).toContain('No hay reglas recurrentes configuradas')
    })

    it('renderiza la lista de reglas cuando existen', () => {
      const cuentasMap = new Map([[1, 'Cuenta Bancaria']])
      const sobresMap = new Map([[10, 'Alquiler']])

      const marcado = html(
        <ListaReglasRecurrentes
          reglas={[reglaMock]}
          moneda="MXN"
          cuentas={cuentasMap}
          sobres={sobresMap}
          token_proteccion="tok-xyz"
        />,
      )

      expect(marcado).toContain('Renta mensual piso')
      expect(marcado).not.toContain('No hay reglas recurrentes configuradas')
    })
  })
})
