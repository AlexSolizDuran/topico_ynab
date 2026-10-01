'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  accionAlternarReglaRecurrente,
  accionCrearReglaRecurrente,
  accionEliminarReglaRecurrente,
  type ResultadoRecurrencia,
} from '../recurrencias/acciones'
import type { ReglaRecurrente } from '../db/tablas/recurrencias'
import { formatear } from '../dinero'
import { Aviso, Boton, Campo, type OpcionVista, Selector } from './sesion'
import detalle from './detalle.module.css'

const INICIAL: ResultadoRecurrencia = { ok: false }

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Boton pendiente={pending}>
      {pending ? 'Guardando...' : children}
    </Boton>
  )
}

export function FormularioNuevaRegla({
  cartera_id,
  cuentas,
  sobres,
  token_proteccion,
  estadoInicial = INICIAL,
}: {
  cartera_id: number
  cuentas: ReadonlyArray<OpcionVista>
  sobres: ReadonlyArray<OpcionVista>
  token_proteccion?: string
  estadoInicial?: ResultadoRecurrencia
}) {
  const [estado, formAction] = useActionState(accionCrearReglaRecurrente, estadoInicial)
  const [frecuencia, setFrecuencia] = useState<'diaria' | 'semanal' | 'mensual' | 'anual'>('mensual')

  return (
    <form action={formAction} className={detalle.formulario}>
      <h3 className={detalle.itemNombre}>Nueva regla recurrente</h3>

      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado.aviso && <Aviso tono="exito">{estado.aviso}</Aviso>}

      <input type="hidden" name="cartera_id" value={cartera_id} />
      {token_proteccion && <input type="hidden" name="token_proteccion" value={token_proteccion} />}

      <div className={detalle.grillaDos}>
        <Campo
          nombre="descripcion"
          etiqueta="Descripcion"
          error={estado.campos?.descripcion}
          requerido
        />

        <Campo
          nombre="monto"
          etiqueta="Importe"
          error={estado.campos?.monto}
          requerido
        />
      </div>

      <div className={detalle.grillaDos}>
        <label className="${detalle.campo}">
          <span className={detalle.etiqueta}>Tipo</span>
          <select
            name="tipo"
            defaultValue="gasto"
            className={detalle.selector}
          >
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
          {estado.campos?.tipo ? <span className={detalle.errorLinea}>{estado.campos.tipo}</span> : null}
        </label>

        <label className="${detalle.campo}">
          <span className={detalle.etiqueta}>Frecuencia</span>
          <select
            name="frecuencia"
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value as 'diaria' | 'semanal' | 'mensual' | 'anual')}
            className={detalle.selector}
          >
            <option value="diaria">Diaria</option>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
          {estado.campos?.frecuencia ? <span className={detalle.errorLinea}>{estado.campos.frecuencia}</span> : null}
        </label>
      </div>

      <div className={detalle.grillaDos}>
        <Selector
          nombre="cuenta_id"
          etiqueta="Cuenta"
          opciones={cuentas}
          vacio="Selecciona una cuenta"
          error={estado.campos?.cuenta_id}
          requerido
        />

        <Selector
          nombre="sobre_id"
          etiqueta="Sobre"
          opciones={sobres}
          vacio="Sin sobre (pendiente de asignar)"
          error={estado.campos?.sobre_id}
          requerido={false}
        />
      </div>

      <div className={detalle.grillaTres}>
        <Campo
          nombre="dia"
          etiqueta="Dia"
          tipo="number"
          error={estado.campos?.dia}
          requerido
        />

        <label className="${detalle.campo}">
          <span className={detalle.etiqueta}>Mes (requerido para anual)</span>
          <select
            name="mes"
            defaultValue=""
            className={detalle.selector}
          >
            <option value="">Selecciona mes...</option>
            <option value="1">Enero</option>
            <option value="2">Febrero</option>
            <option value="3">Marzo</option>
            <option value="4">Abril</option>
            <option value="5">Mayo</option>
            <option value="6">Junio</option>
            <option value="7">Julio</option>
            <option value="8">Agosto</option>
            <option value="9">Septiembre</option>
            <option value="10">Octubre</option>
            <option value="11">Noviembre</option>
            <option value="12">Diciembre</option>
          </select>
          {estado.campos?.mes ? <span className={detalle.errorLinea}>{estado.campos.mes}</span> : null}
        </label>

        <Campo
          nombre="fecha_inicio"
          etiqueta="Fecha de inicio"
          tipo="date"
          error={estado.campos?.fecha_inicio}
          requerido
        />
      </div>

      <Campo
        nombre="comercio"
        etiqueta="Comercio (opcional)"
        error={estado.campos?.comercio}
      />

      <div className={detalle.alDerecha}>
        <AccionPendiente>Guardar regla</AccionPendiente>
      </div>
    </form>
  )
}

export function FilaRegla({
  regla,
  moneda,
  token_proteccion,
  nombreCuenta,
  nombreSobre,
}: {
  regla: ReglaRecurrente
  moneda: string
  token_proteccion?: string
  nombreCuenta?: string
  nombreSobre?: string
}) {
  const [, accionAlternar] = useActionState(accionAlternarReglaRecurrente, INICIAL)
  const [, accionEliminar] = useActionState(accionEliminarReglaRecurrente, INICIAL)

  const montoFormateado = formatear(regla.monto, moneda)

  return (
    <li className={detalle.itemRegla}>
      <div>
        <div className={detalle.filaNombre}>
          <span className={detalle.itemNombre}>{regla.descripcion}</span>
          {/* Activa o inactiva lo dice el texto; el color solo distingue de un vistazo. */}
          <span className={`${detalle.pill} ${regla.activa ? detalle.pillActiva : ''}`}>
            {regla.activa ? 'Activa' : 'Inactiva'}
          </span>
          <span className={detalle.chip}>{regla.frecuencia}</span>
        </div>
        <div className={detalle.itemDetalle}>
          <span>Cuenta: {nombreCuenta ?? regla.cuenta_id}</span>
          {nombreSobre ? <span> • Sobre: {nombreSobre}</span> : <span> • Sin sobre</span>}
          <span> • Inicia: {regla.fecha_inicio}</span>
        </div>
      </div>

      <div className={detalle.reglaAcciones}>
        <span
          className={`${detalle.reglaMonto} ${
            regla.tipo === 'gasto' ? detalle.negativo : detalle.positivo
          }`}
        >
          {regla.tipo === 'gasto' ? `-${montoFormateado}` : `+${montoFormateado}`}
        </span>

        <form action={accionAlternar}>
          <input type="hidden" name="id" value={regla.id} />
          <input type="hidden" name="cartera_id" value={regla.cartera_id} />
          <input type="hidden" name="activa" value={regla.activa ? 'false' : 'true'} />
          {token_proteccion && <input type="hidden" name="token_proteccion" value={token_proteccion} />}
          <button
            type="submit"
            className={detalle.enlaceAccion}
          >
            {regla.activa ? 'Desactivar' : 'Activar'}
          </button>
        </form>

        <form action={accionEliminar}>
          <input type="hidden" name="id" value={regla.id} />
          <input type="hidden" name="cartera_id" value={regla.cartera_id} />
          {token_proteccion && <input type="hidden" name="token_proteccion" value={token_proteccion} />}
          <button
            type="submit"
            className={`${detalle.enlaceAccion} ${detalle.enlacePeligro}`}
          >
            Eliminar
          </button>
        </form>
      </div>
    </li>
  )
}

export function ListaReglasRecurrentes({
  reglas,
  moneda,
  cuentas,
  sobres,
  token_proteccion,
}: {
  reglas: ReglaRecurrente[]
  moneda: string
  cuentas: Map<number, string>
  sobres: Map<number, string>
  token_proteccion?: string
}) {
  if (reglas.length === 0) {
    return (
      <div className={detalle.vacioCentrado}>
        No hay reglas recurrentes configuradas en esta cartera.
      </div>
    )
  }

  return (
    <ul className={detalle.lista}>
      {reglas.map((regla) => (
        <FilaRegla
          key={regla.id}
          regla={regla}
          moneda={moneda}
          token_proteccion={token_proteccion}
          nombreCuenta={cuentas.get(regla.cuenta_id)}
          nombreSobre={regla.sobre_id ? sobres.get(regla.sobre_id) : undefined}
        />
      ))}
    </ul>
  )
}
