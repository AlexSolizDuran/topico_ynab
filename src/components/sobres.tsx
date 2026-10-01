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
import { Confirmar, MenuDeFila } from './modal'
import detalle from './detalle.module.css'

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
    <label className={detalle.campo}>
      <span className={detalle.etiqueta}>{etiqueta}</span>
      <select
        name={nombre}
        defaultValue={String(seleccionado ?? opciones[0]?.id ?? '')}
        className={detalle.selector}
      >
        {opciones.map((opcion) => (
          <option key={opcion.id} value={opcion.id}>
            {opcion.nombre}
          </option>
        ))}
      </select>
      {error ? <span className={detalle.errorLinea}>{error}</span> : null}
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
    <form action={accion} className={detalle.formulario}>
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
<li className={detalle.subItem}>
      <div className={detalle.itemEncabezado}>
        <p className={detalle.nota}>
          {asignacion.periodo} · {MOTIVO[asignacion.motivo]}
        </p>
        <p
          className={`${detalle.itemValor} ${detalle.valorMedio} ${
            asignacion.motivo === 'reasignacion' ? detalle.atencion : ''
          }`}
        >
          {formatear(asignacion.monto, moneda)}
        </p>
      </div>

      {/* La contraparte de un movimiento entre sobres no se corrige desde aca: tocarla
          sola descuadraria el disponible del sobre de destino, y el repositorio la
          rechaza. Se lo dice en pantalla en vez de esconderla. */}
      {asignacion.motivo === 'reasignacion' ? (
        <p className={detalle.nota}>
          Se corrige desde el sobre al que moviste el dinero.
        </p>
      ) : (
        <form action={accion} className={detalle.formularioEnLinea}>
          {estado.error ? (
            <p role="alert" className={detalle.errorLinea}>
              {estado.error}
            </p>
          ) : null}
          {estado.aviso ? (
            <p role="status" className={detalle.exitoLinea}>
              {estado.aviso}
            </p>
          ) : null}
          <div className={detalle.campoCrece}>
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

/*
 * Un sobre con su disponible y las ocho cosas que se le pueden hacer.
 *
 * La fila es de lectura: nombre, disponible y, si esta en negativo, el aviso de que el
 * tapado es manual. Las ocho acciones —asignar, tapar, mover, renombrar, reordenar, cambiar
 * de grupo, archivar y borrar— viven en el modal del "⋯".
 *
 * Asignar deja de estar a la vista, y eso es una decision: era la accion de todos los dias
 * y ganaba espacio a costa de empujar hacia abajo el nombre y el disponible de cada sobre.
 * Con ocho formularios embebidos, una cartera de veinte sobres es veinte veces quince
 * campos, y la fila deja de leerse como lo que es. Sigue siendo la primera opcion del menu.
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
    <li className={`${detalle.item} ${negativo ? detalle.itemNegativo : ''}`}>
      <div className={detalle.itemEncabezado}>
        <h4 className={detalle.itemNombre}>{nombre}</h4>
        <p className={`${detalle.itemValor} ${negativo ? detalle.negativo : ''}`}>
          {formatear(disponible, moneda)}
        </p>
      </div>

      {negativo ? (
        <p className={detalle.avisoNegativo}>
          Esta en negativo. Se puede tapar con el dinero suelto
          {dinero_suelto ? ` (${formatear(dinero_suelto, moneda)})` : ''}: el sistema no lo
          hace solo.
        </p>
      ) : null}

      <MenuDeFila
        titulo={`Acciones de ${nombre}`}
        acciones={[
          {
            etiqueta: 'Asignar',
            contenido: (
              <>
                {asignar.error ? <Aviso tono="error">{asignar.error}</Aviso> : null}
                {asignar.aviso ? <Aviso tono="exito">{asignar.aviso}</Aviso> : null}
                <form action={accionAsignar} className={detalle.formularioEnLinea}>
                  <PeriodoOculto periodo={periodo} />
                  <div className={detalle.campoCrece}>
                    <Campo
                      nombre="monto"
                      etiqueta="Asignar"
                      error={asignar.campos?.monto}
                      ayuda="Solo importes positivos."
                    />
                  </div>
                  <AccionPendiente>Asignar</AccionPendiente>
                </form>
              </>
            ),
          },
          ...(negativo
            ? [
                {
                  etiqueta: 'Tapar el desborde',
                  contenido: (
                    <>
                      {tapar.error ? <Aviso tono="error">{tapar.error}</Aviso> : null}
                      {tapar.aviso ? <Aviso tono="exito">{tapar.aviso}</Aviso> : null}
                      <form action={accionTapar} className={detalle.formularioEnLinea}>
                        <PeriodoOculto periodo={periodo} />
                        <div className={detalle.campoCrece}>
                          <Campo
                            nombre="monto"
                            etiqueta="Tapar el desborde"
                            error={tapar.campos?.monto}
                            ayuda="No puede pasar de lo que el sobre debe."
                          />
                        </div>
                        <AccionPendiente>Tapar</AccionPendiente>
                      </form>
                    </>
                  ),
                },
              ]
            : []),
          ...(otrosSobres.length > 0
            ? [
                {
                  etiqueta: 'Mover a otro sobre',
                  contenido: (
                    <>
                      {mover.error ? <Aviso tono="error">{mover.error}</Aviso> : null}
                      {mover.aviso ? <Aviso tono="exito">{mover.aviso}</Aviso> : null}
                      <form action={accionMover} className={detalle.formularioEnLinea}>
                        <PeriodoOculto periodo={periodo} />
                        <div className={detalle.campoCrece}>
                          <Campo
                            nombre="monto"
                            etiqueta="Mover desde aca"
                            error={mover.campos?.monto}
                          />
                        </div>
                        <Selector
                          opciones={otrosSobres}
                          nombre="destino_id"
                          etiqueta="Hacia el sobre"
                          error={mover.campos?.destino_id}
                        />
                        <AccionPendiente>Mover</AccionPendiente>
                      </form>
                    </>
                  ),
                },
              ]
            : []),
          {
            etiqueta: 'Asignaciones de este sobre',
            contenido: asignaciones.length === 0 ? (
              <p className={detalle.nota}>
                Este sobre todavia no tiene asignaciones. Su disponible esta en cero.
              </p>
            ) : (
              <ul className={detalle.lista}>
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
            ),
          },
          {
            etiqueta: 'Renombrar',
            contenido: (
              <>
                {renombrar.error ? <Aviso tono="error">{renombrar.error}</Aviso> : null}
                {renombrar.aviso ? <Aviso tono="exito">{renombrar.aviso}</Aviso> : null}
                <form action={accionRenombrar} className={detalle.formularioEnLinea}>
                  <div className={detalle.campoCrece}>
                    <Campo nombre="nombre" etiqueta="Renombrar" error={renombrar.campos?.nombre} />
                  </div>
                  <AccionPendiente>Renombrar</AccionPendiente>
                </form>
              </>
            ),
          },
          {
            etiqueta: 'Cambiar de grupo o de orden',
            contenido: (
              <>
                {reordenar.error ? <Aviso tono="error">{reordenar.error}</Aviso> : null}
                <form action={accionReordenar} className={detalle.formularioEnLinea}>
                  <div className={detalle.campoCrece}>
                    <Campo nombre="orden" etiqueta="Orden" error={reordenar.campos?.orden} />
                  </div>
                  <AccionPendiente>Reordenar</AccionPendiente>
                </form>

                {cambiarGrupo.error ? <Aviso tono="error">{cambiarGrupo.error}</Aviso> : null}
                {cambiarGrupo.aviso ? (
                  <Aviso tono="exito">{cambiarGrupo.aviso}</Aviso>
                ) : null}
                <form action={accionGrupo} className={detalle.formularioEnLinea}>
                  <Selector
                    opciones={grupos}
                    nombre="grupo_id"
                    etiqueta="Grupo"
                    seleccionado={grupo_id}
                    error={cambiarGrupo.campos?.grupo_id}
                  />
                  <AccionPendiente>Cambiar de grupo</AccionPendiente>
                </form>
              </>
            ),
          },
          {
            /*
             * Archivar exige disponible cero —`repos/sobres.ts` tira `SobreConSaldo`—, y eso
             * es lo que el aviso dice antes de que el usuario lo descubra por el error. Un
             * sobre archivado conserva el historial y sigue admitiendo devoluciones.
             */
            etiqueta: 'Archivar',
            peligro: true,
            contenido: (
              <>
                {archivar.error ? <Aviso tono="error">{archivar.error}</Aviso> : null}
                {archivar.aviso ? <Aviso tono="exito">{archivar.aviso}</Aviso> : null}
                <Confirmar
                  titulo="Archivar este sobre"
                  childrenAcciones={
                    <form action={accionArchivar}>
                      <PeriodoOculto periodo={periodo} />
                      <AccionPendiente>Archivar</AccionPendiente>
                    </form>
                  }
                >
                  <p>
                    Solo se archiva con el disponible en cero. Queda con su historial, deja de
                    recibir asignaciones y sigue admitiendo devoluciones.
                  </p>
                </Confirmar>
              </>
            ),
          },
          {
            etiqueta: 'Borrar',
            peligro: true,
            contenido: (
              <>
                {eliminar.error ? <Aviso tono="error">{eliminar.error}</Aviso> : null}
                {eliminar.aviso ? <Aviso tono="exito">{eliminar.aviso}</Aviso> : null}
                <Confirmar
                  titulo="Borrar este sobre"
                  childrenAcciones={
                    <form action={accionEliminar}>
                      <PeriodoOculto periodo={periodo} />
                      <AccionPendiente>Borrar</AccionPendiente>
                    </form>
                  }
                >
                  {eliminable ? (
                    <p>
                      No tiene movimientos ni saldo, asi que se puede borrar. El sobre deja de
                      existir; sus asignaciones se van con el.
                    </p>
                  ) : (
                    <p>
                      Este sobre no se puede borrar: tiene movimientos o saldo, y borrario
                      romperia su historial. Archivalo en su lugar y conserva todo.
                    </p>
                  )}
                  {eliminar.ofrece === 'archivar' ? (
                    <p className={detalle.nota}>
                      Archivalo en su lugar: conserva el historial y sigue admitiendo devoluciones.
                    </p>
                  ) : null}
                </Confirmar>
              </>
            ),
          },
        ]}
      />
    </li>
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
    <li className={`${detalle.item} ${detalle.filaCompacta} ${enNegativo ? detalle.itemNegativo : ''}`}>
      <div>
        <p className={detalle.itemNombre}>{nombre}</p>
        <p className={`${detalle.itemDetalle} ${detalle.valorChico}`}>
          {formatear(disponible, moneda)}
        </p>
      </div>
      <form action={accionRestaurar} className={detalle.alineadoDerecha}>
        <PeriodoOculto periodo={periodo} />
        {restaurar.error ? (
          <p role="alert" className={detalle.errorLinea}>
            {restaurar.error}
          </p>
        ) : null}
        {restaurar.aviso ? (
          <p role="status" className={detalle.exitoLinea}>
            {restaurar.aviso}
          </p>
        ) : null}
        <Boton>Restaurar</Boton>
      </form>
    </li>
  )
}
