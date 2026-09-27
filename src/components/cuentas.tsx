'use client'

/**
 * Componentes de cuentas.
 *
 * El saldo se formatea en el servidor y se pasa ya formateado cuando viene de una
 * pagina, pero el campo de ajuste necesita el string exacto: `formatear` nunca
 * convierte a numero, y `paraCampo` devuelve el importe sin simbolo ni separador de
 * miles, que es lo que el input espera.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  accionArchivarCuenta,
  accionCambiarTipoCuenta,
  accionCorregirSaldoInicial,
  accionCrearCuenta,
  accionRenombrarCuenta,
  accionRestaurarCuenta,
  type ResultadoDeCuenta,
} from '../cuentas/acciones'
import { TIPOS_DE_CUENTA } from '../cuentas/validacion'
import { formatear } from '../dinero'
import { Aviso, Boton, Campo } from './sesion'

const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

export function FormularioNuevaCuenta({ cartera_id }: { cartera_id: number }) {
  const [estado, accion] = useActionState(
    (prev: ResultadoDeCuenta, datos: FormData) => accionCrearCuenta(cartera_id, prev, datos),
    INICIAL,
  )

  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      <Campo nombre="nombre" etiqueta="Nombre" error={estado.campos?.nombre} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Tipo</span>
        <select
          name="tipo"
          defaultValue="corriente"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {TIPOS_DE_CUENTA.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          Una cuenta de credito representa deuda, asi que su saldo puede ser negativo.
        </span>
      </label>

      <Campo
        nombre="saldo_inicial"
        etiqueta="Saldo inicial"
        error={estado.campos?.saldo_inicial}
        ayuda="Lo que hay en la cuenta hoy. Despues el saldo se deriva solo."
      />

      <AccionPendiente>Crear cuenta</AccionPendiente>
    </form>
  )
}

/**
 * Una cuenta con su saldo.
 *
 * El saldo se muestra tal como lo devuelve Postgres, formateado con `formatear` y
 * nunca convertido a numero. Un saldo de credito en negativo se ve igual que uno de
 * corriente en negativo: el requerimiento pide exactamente eso.
 */
export function FilaCuenta({
  cartera_id,
  cuenta_id,
  nombre,
  tipo,
  saldo,
  saldo_inicial,
  moneda,
  tieneMovimientos,
}: {
  cartera_id: number
  cuenta_id: number
  nombre: string
  tipo: string
  saldo: string
  saldo_inicial: string
  moneda: string
  tieneMovimientos: boolean
}) {
  const [estado, renombrar] = useActionState(
    (prev: ResultadoDeCuenta, datos: FormData) =>
      accionRenombrarCuenta(cartera_id, cuenta_id, prev, datos),
    INICIAL,
  )
  const [estadoSaldo, corregir] = useActionState(
    (prev: ResultadoDeCuenta, datos: FormData) =>
      accionCorregirSaldoInicial(cartera_id, cuenta_id, prev, datos),
    INICIAL,
  )
  const [estadoTipo, cambiarTipo] = useActionState(
    (prev: ResultadoDeCuenta, datos: FormData) =>
      accionCambiarTipoCuenta(cartera_id, cuenta_id, prev, datos),
    INICIAL,
  )
  const [estadoArchivo, archivar] = useActionState(
    (prev: ResultadoDeCuenta, datos: FormData) =>
      accionArchivarCuenta(cartera_id, cuenta_id, prev, datos),
    INICIAL,
  )

  const enRojo = saldo.trim().startsWith('-')

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{nombre}</p>
          <p className="text-xs text-slate-500">
            {tipo} · saldo inicial {formatear(saldo_inicial, moneda)}
          </p>
        </div>
        <p
          className={`text-lg font-semibold tabular-nums ${enRojo ? 'text-red-600' : 'text-slate-900'}`}
        >
          {formatear(saldo, moneda)}
        </p>
      </div>

      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estadoSaldo.error ? <Aviso tono="error">{estadoSaldo.error}</Aviso> : null}
      {estadoTipo.error ? <Aviso tono="error">{estadoTipo.error}</Aviso> : null}
      {estadoArchivo.error ? <Aviso tono="error">{estadoArchivo.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
      {estadoSaldo.aviso ? <Aviso tono="exito">{estadoSaldo.aviso}</Aviso> : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500">Editar cuenta</summary>

        <form action={renombrar} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Campo nombre="nombre" etiqueta="Nuevo nombre" error={estado.campos?.nombre} />
          </div>
          <AccionPendiente>Renombrar</AccionPendiente>
        </form>

        <form action={corregir} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Campo
              nombre="saldo_inicial"
              etiqueta="Corregir saldo inicial"
              error={estadoSaldo.campos?.saldo_inicial}
              ayuda="El saldo derivado se ajusta en el acto."
            />
          </div>
          <AccionPendiente>Corregir</AccionPendiente>
        </form>

        <form action={cambiarTipo} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Tipo</span>
              <select
                name="tipo"
                defaultValue={tipo}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {TIPOS_DE_CUENTA.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {opcion}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AccionPendiente>Cambiar tipo</AccionPendiente>
        </form>
        {tieneMovimientos ? (
          <p className="mt-1 text-xs text-amber-700">
            Esta cuenta tiene movimientos, asi que el tipo ya no se puede cambiar.
          </p>
        ) : null}

        <form action={archivar} className="mt-3">
          <AccionPendiente>Archivar cuenta</AccionPendiente>
        </form>
      </details>
    </li>
  )
}

export function FilaCuentaArchivada({
  cartera_id,
  cuenta_id,
  nombre,
  saldo,
  moneda,
}: {
  cartera_id: number
  cuenta_id: number
  nombre: string
  saldo: string
  moneda: string
}) {
  const [estado, restaurar] = useActionState(
    (prev: ResultadoDeCuenta, datos: FormData) =>
      accionRestaurarCuenta(cartera_id, cuenta_id, prev, datos),
    INICIAL,
  )

  return (
    <li className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-700">{nombre}</p>
          <p className="text-xs text-slate-500">
            Archivada · saldo {formatear(saldo, moneda)}
          </p>
        </div>
        <form action={restaurar}>
          <AccionPendiente>Restaurar</AccionPendiente>
        </form>
      </div>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
    </li>
  )
}
