'use client'

/**
 * Componentes de sobres.
 *
 * El disponible llega del servidor **ya formateado**, y se manda el string exacto por
 * aparte solo donde hace falta editarlo: un input con un separador de miles no es un
 * importe que Postgres pueda castear, y escribir el importe de nuevo desde el valor
 * formateado seria perder precision en la pantalla, que es donde el usuario mira.
 *
 * Un `periodo` hidden viaja en cada formulario. No es adorno: archivar y eliminar
 * preguntan si el disponible es cero, y el disponible depende del periodo. Si el
 * formulario no lo mandara, la operacion se evaluaria contra el periodo que por
 * defectoYZ tiene el servidor, que no es necesariamente el que el usuario esta viendo.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  accionArchivarSobre,
  accionAsignarASobre,
  accionCorregirAsignacion,
  accionCrearSobre,
  accionEliminarSobre,
  accionMoverEntreSobres,
  accionMoverSobreDeGrupo,
  accionRenombrarSobre,
  accionReordenarSobre,
  accionRestaurarSobre,
  accionTaparDesborde,
  type ResultadoDeSobre,
} from '../sobres/acciones'
import { formatear } from '../dinero'
import { Aviso, Boton, Campo } from './sesion'

/**
 * Una asignacion tal como la ve la persona: periodo, importe y por que esta ahi.
 *
 * El importe se pasa como `Dinero` y se formatea con `formatear`, que no convierte. El
 * campo de correccion manda el mismo string por aparte, sin el `.00` de relleno, porque
 * `paraCampo` es lo que un input puede castear en `numeric`.
 */
export interface AsignacionVista {
  id: number
  periodo: string
  monto: string
  motivo: 'usuario' | 'reasignacion'
}

const MOTIVO: Record<AsignacionVista['motivo'], string> = {
  usuario: 'asignada por vos',
  reasignacion: 'salio hacia otro sobre',
}

const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

/** El periodo no se edita aca: viaja oculto y la pantalla es de un solo mes. */
function PeriodoOculto({ periodo }: { periodo: string }) {
  return <input type="hidden" name="periodo" value={periodo} />
}

function Selector({
  opciones,
  nombre,
  etiqueta,
  seleccionado,
  error,
}: {
  opciones: ReadonlyArray<{ id: number; nombre: string }>
  nombre: string
  etiqueta: string
  seleccionado?: number
  error?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      <select
        name={nombre}
        defaultValue={String(seleccionado ?? opciones[0]?.id ?? '')}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      >
        {opciones.map((opcion) => (
          <option key={opcion.id} value={opcion.id}>
            {opcion.nombre}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  )
}

export function FormularioNuevoSobre({
  cartera_id,
  grupos,
}: {
  cartera_id: number
  grupos: ReadonlyArray<{ id: number; nombre: string }>
}) {
  const [estado, accion] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) =>
      accionCrearSobre(cartera_id, prev, datos),
    INICIAL,
  )

  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      <Campo
        nombre="nombre"
        etiqueta="Nombre del sobre"
        error={estado.campos?.nombre}
        ayuda="Unico dentro de esta cartera. Se puede repetir el nombre en otra cartera."
      />
      <Selector
        opciones={grupos}
        nombre="grupo_id"
        etiqueta="Grupo"
        error={estado.campos?.grupo_id}
      />

      <AccionPendiente>Crear sobre</AccionPendiente>
    </form>
  )
}

/**
 * Corregir el importe de una asignacion.
 *
 * Va en su propio componente, y no en un `map` dentro de `FilaSobre`, porque
 * `useActionState` es un hook: un hook en un bucle se llama tantas veces como elementos
 * tenga la lista, y con dos asignaciones en el mismo sobre el segundo estado seria el
 * del primero. Un componente por fila resuelve eso y deja el error pegado a la
 * asignacion que fallo, en vez de un error comun arriba de la fila del sobre.
 */
function FilaAsignacion({
  cartera_id,
  sobre_id,
  asignacion,
  moneda,
}: {
  cartera_id: number
  sobre_id: number
  asignacion: AsignacionVista
  moneda: string
}) {
  const [estado, accion] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) =>
      accionCorregirAsignacion(cartera_id, sobre_id, asignacion.id, prev, datos),
    INICIAL,
  )

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-slate-500">
          {asignacion.periodo} · {MOTIVO[asignacion.motivo]}
        </p>
        <p
          className={`font-mono text-sm font-semibold tabular-nums ${
            asignacion.motivo === 'reasignacion' ? 'text-amber-800' : 'text-slate-900'
          }`}
        >
          {formatear(asignacion.monto, moneda)}
        </p>
      </div>

      {/* La contraparte de un movimiento entre sobres no se corrige desde aca: tocarla
          sola descuadraria el disponible del sobre de destino, y el repositorio la
          rechaza. Se lo dice en pantalla en vez de esconderla. */}
      {asignacion.motivo === 'reasignacion' ? (
        <p className="mt-1 text-xs text-slate-500">
          Se corrige desde el sobre al que moviste el dinero.
        </p>
      ) : (
        <form action={accion} className="mt-2 flex flex-wrap items-end gap-2">
          {estado.error ? (
            <p role="alert" className="w-full text-xs text-red-700">
              {estado.error}
            </p>
          ) : null}
          {estado.aviso ? (
            <p role="status" className="w-full text-xs text-emerald-700">
              {estado.aviso}
            </p>
          ) : null}
          <div className="min-w-40 flex-1">
            <Campo
              nombre="monto"
              etiqueta="Importe de la asignacion"
              error={estado.campos?.monto}
              ayuda="El disponible se ajusta en el acto."
            />
          </div>
          <AccionPendiente>Corregir</AccionPendiente>
        </form>
      )}
    </li>
  )
}

/**
 * Un sobre con su disponible y las cinco cosas que se le pueden hacer.
 *
 * Los formularios van en `<details>` para no mostrar quince campos por sobre: la accion
 * mas comun —asignar— queda a la vista y el resto se abre.
 */
export function FilaSobre({
  cartera_id,
  sobre_id,
  nombre,
  disponible,
  negativo,
  eliminable,
  periodo,
  moneda,
  grupos,
  grupo_id,
  otrosSobres,
  dinero_suelto,
  asignaciones,
}: {
  cartera_id: number
  sobre_id: number
  nombre: string
  disponible: string
  negativo: boolean
  eliminable: boolean
  periodo: string
  moneda: string
  grupos: ReadonlyArray<{ id: number; nombre: string }>
  grupo_id: number
  otrosSobres: ReadonlyArray<{ id: number; nombre: string }>
  dinero_suelto: string
  asignaciones: ReadonlyArray<AsignacionVista>
}) {
  const [asignar, accionAsignar] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) =>
      accionAsignarASobre(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )
  const [tapar, accionTapar] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) => accionTaparDesborde(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )
  const [mover, accionMover] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) =>
      accionMoverEntreSobres(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )
  const [renombrar, accionRenombrar] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) =>
      accionRenombrarSobre(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )
  const [reordenar, accionReordenar] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) =>
      accionReordenarSobre(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )
  const [cambiarGrupo, accionGrupo] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) =>
      accionMoverSobreDeGrupo(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )
  const [archivar, accionArchivar] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) => accionArchivarSobre(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )
  const [eliminar, accionEliminar] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) => accionEliminarSobre(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )

  return (
    <li
      className={`rounded-2xl border p-4 shadow-sm ${
        negativo ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-semibold text-slate-900">{nombre}</h4>
        <p
          className={`font-mono text-lg font-semibold tabular-nums ${
            negativo ? 'text-red-700' : 'text-slate-900'
          }`}
        >
          {formatear(disponible, moneda)}
        </p>
      </div>

      {negativo ? (
        <p className="mt-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-800">
          Esta en negativo. Se puede tapar con el dinero suelto
          {dinero_suelto ? ` (${formatear(dinero_suelto, moneda)})` : ''}: el sistema no lo
          hace solo.
        </p>
      ) : null}

      {/* Asignar: la operacion de todos los dias, a la vista. */}
      <form action={accionAsignar} className="mt-3 flex flex-wrap items-end gap-2">
        <PeriodoOculto periodo={periodo} />
        {asignar.error ? (
          <p role="alert" className="w-full text-sm text-red-700">
            {asignar.error}
          </p>
        ) : null}
        {asignar.aviso ? (
          <p role="status" className="w-full text-sm text-emerald-700">
            {asignar.aviso}
          </p>
        ) : null}
        <div className="min-w-40 flex-1">
          <Campo
            nombre="monto"
            etiqueta="Asignar"
            error={asignar.campos?.monto}
            ayuda="Solo importes positivos."
          />
        </div>
        <AccionPendiente>Asignar</AccionPendiente>
      </form>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-900">
          Otras acciones
        </summary>

        <div className="mt-3 flex flex-col gap-4">
          {negativo ? (
            <form action={accionTapar} className="flex flex-wrap items-end gap-2">
              <PeriodoOculto periodo={periodo} />
              {tapar.error ? (
                <p role="alert" className="w-full text-sm text-red-700">
                  {tapar.error}
                </p>
              ) : null}
              {tapar.aviso ? (
                <p role="status" className="w-full text-sm text-emerald-700">
                  {tapar.aviso}
                </p>
              ) : null}
              <div className="min-w-40 flex-1">
                <Campo
                  nombre="monto"
                  etiqueta="Tapar el desborde"
                  error={tapar.campos?.monto}
                  ayuda="No puede pasar de lo que el sobre debe."
                />
              </div>
              <AccionPendiente>Tapar</AccionPendiente>
            </form>
          ) : null}

          {otrosSobres.length > 0 ? (
            <form action={accionMover} className="flex flex-wrap items-end gap-2">
              <PeriodoOculto periodo={periodo} />
              {mover.error ? (
                <p role="alert" className="w-full text-sm text-red-700">
                  {mover.error}
                </p>
              ) : null}
              {mover.aviso ? (
                <p role="status" className="w-full text-sm text-emerald-700">
                  {mover.aviso}
                </p>
              ) : null}
              <div className="min-w-40 flex-1">
                <Campo nombre="monto" etiqueta="Mover desde aca" error={mover.campos?.monto} />
              </div>
              <Selector
                opciones={otrosSobres}
                nombre="destino_id"
                etiqueta="Hacia el sobre"
                error={mover.campos?.destino_id}
              />
              <AccionPendiente>Mover</AccionPendiente>
            </form>
          ) : null}

          <div className="flex flex-col gap-2">
            <h5 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Asignaciones de este sobre
            </h5>
            {asignaciones.length === 0 ? (
              <p className="text-xs text-slate-500">
                Este sobre todavia no tiene asignaciones. Su disponible esta en cero.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {asignaciones.map((asignacion) => (
                  <FilaAsignacion
                    key={asignacion.id}
                    cartera_id={cartera_id}
                    sobre_id={sobre_id}
                    asignacion={asignacion}
                    moneda={moneda}
                  />
                ))}
              </ul>
            )}
          </div>

          <form action={accionRenombrar} className="flex flex-wrap items-end gap-2">
            {renombrar.error ? (
              <p role="alert" className="w-full text-sm text-red-700">
                {renombrar.error}
              </p>
            ) : null}
            {renombrar.aviso ? (
              <p role="status" className="w-full text-sm text-emerald-700">
                {renombrar.aviso}
              </p>
            ) : null}
            <div className="min-w-40 flex-1">
              <Campo nombre="nombre" etiqueta="Renombrar" error={renombrar.campos?.nombre} />
            </div>
            <AccionPendiente>Renombrar</AccionPendiente>
          </form>

          <form action={accionReordenar} className="flex flex-wrap items-end gap-2">
            {reordenar.error ? (
              <p role="alert" className="w-full text-sm text-red-700">
                {reordenar.error}
              </p>
            ) : null}
            <div className="min-w-40 flex-1">
              <Campo nombre="orden" etiqueta="Orden" error={reordenar.campos?.orden} />
            </div>
            <AccionPendiente>Reordenar</AccionPendiente>
          </form>

          <form action={accionGrupo} className="flex flex-wrap items-end gap-2">
            {cambiarGrupo.error ? (
              <p role="alert" className="w-full text-sm text-red-700">
                {cambiarGrupo.error}
              </p>
            ) : null}
            <Selector
              opciones={grupos}
              nombre="grupo_id"
              etiqueta="Grupo"
              seleccionado={grupo_id}
              error={cambiarGrupo.campos?.grupo_id}
            />
            <AccionPendiente>Cambiar de grupo</AccionPendiente>
          </form>

          <div className="flex flex-wrap gap-2">
            <form action={accionArchivar}>
              <PeriodoOculto periodo={periodo} />
              {archivar.error ? (
                <p role="alert" className="text-sm text-red-700">
                  {archivar.error}
                </p>
              ) : null}
              {archivar.aviso ? (
                <p role="status" className="text-sm text-emerald-700">
                  {archivar.aviso}
                </p>
              ) : null}
              <BotonSinMargen>Archivar</BotonSinMargen>
            </form>

            <form action={accionEliminar}>
              <PeriodoOculto periodo={periodo} />
              {eliminar.error ? (
                <p role="alert" className="text-sm text-red-700">
                  {eliminar.error}
                </p>
              ) : null}
              {eliminar.aviso ? (
                <p role="status" className="text-sm text-emerald-700">
                  {eliminar.aviso}
                </p>
              ) : null}
              <BotonSinMargen>Borrar</BotonSinMargen>
              {eliminar.ofrece === 'archivar' ? (
                <p className="mt-1 text-xs text-slate-600">
                  Archivalo en su lugar: conserva el historial y sigue admitiendo devoluciones.
                </p>
              ) : null}
            </form>
          </div>

          {!eliminable ? (
            <p className="text-xs text-slate-500">
              Este sobre no se puede borrar: tiene movimientos o saldo. Archivarlo conserva todo.
            </p>
          ) : null}
        </div>
      </details>
    </li>
  )
}

/** Como `Boton`, pero sin el margen de arriba: aca los botones van en linea. */
function BotonSinMargen({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Un momento...' : children}
    </button>
  )
}

export function FilaSobreArchivado({
  cartera_id,
  sobre_id,
  nombre,
  disponible,
  enNegativo,
  moneda,
  periodo,
}: {
  cartera_id: number
  sobre_id: number
  nombre: string
  disponible: string
  enNegativo: boolean
  moneda: string
  periodo: string
}) {
  const [restaurar, accionRestaurar] = useActionState(
    (prev: ResultadoDeSobre, datos: FormData) => accionRestaurarSobre(cartera_id, sobre_id, prev, datos),
    INICIAL,
  )

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
        enNegativo ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div>
        <p className="text-sm font-medium text-slate-900">{nombre}</p>
        <p className="font-mono text-sm text-slate-600 tabular-nums">
          {formatear(disponible, moneda)}
        </p>
      </div>
      <form action={accionRestaurar} className="flex flex-col items-end">
        <PeriodoOculto periodo={periodo} />
        {restaurar.error ? (
          <p role="alert" className="text-xs text-red-700">
            {restaurar.error}
          </p>
        ) : null}
        {restaurar.aviso ? (
          <p role="status" className="text-xs text-emerald-700">
            {restaurar.aviso}
          </p>
        ) : null}
        <BotonSinMargen>Restaurar</BotonSinMargen>
      </form>
    </li>
  )
}
