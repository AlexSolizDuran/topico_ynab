'use client'

/**
 * Vista de movimientos: alta, edicion, lista, filtros y las acciones de cada fila.
 *
 * Es un **client component**, asi que todo lo que importa vive en el bundle del cliente y
 * tiene que seguir siendo serializable. De ahi las dos reglas que este archivo respeta:
 *
 * - No importa nada de `repos`, `db` ni `sesion/server`. Lo unico que cruza la frontera son
 *   las Server Actions, que son referencias y no codigo de servidor: Next las envuelve en un
 *   endpoint y el cliente solo las llama por HTTP. Si este archivo importara
 *   `listarMovimientos`, el build arrastraria Drizzle y `pg` al navegador.
 * - Los datos llegan del servidor ya formateados, y los importes que van a un `<input>`
 *   viajan como el string crudo de `numeric`, nunca con el separador de miles del formato
 *   local. Ver el modulo de `sobres`, que razona lo mismo.
 *
 * Los filtros viven en la URL y el formulario de filtros es un `GET` sin `action`: asi el
 * navegador arma la query y la vista queda compartible con la query que ya esta escrita.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  accionAsignarSobre,
  accionEditarMovimiento,
  accionEliminarMovimiento,
  accionRegistrarMovimiento,
  accionRestaurarMovimiento,
  type ResultadoDeMovimiento,
} from '../transacciones/acciones'
import { formatear, paraCampo } from '../dinero'
import { aCentimos, deCentimos } from '../patrimonio/calculos'
import {
  FilaEditarTraspaso,
  RecorridoDeTraspaso,
} from './traspasos'
import {
  Aviso,
  AvisoRetroactivo,
  Boton,
  Campo,
  type OpcionVista,
  Selector,
} from './sesion'
import { Confirmar, MenuDeFila } from './modal'
import detalle from './detalle.module.css'

/** Una cuenta o un sobre, tal como los elige el usuario. */
export type { OpcionVista }

/** Un movimiento con lo que la fila necesita. Viene del repositorio, ya derivado. */
export interface MovimientoEnVista {
  id: number
  cuenta_id: number
  cuenta_nombre: string
  sobre_id: number | null
  sobre_nombre: string | null
  tipo: 'gasto' | 'ingreso' | 'traspaso'
  /** El string crudo de `numeric`, sin formatear. Para editar y para comparar. */
  monto: string
  /** `AAAA-MM-DD`. */
  fecha: string
  descripcion: string
  comercio: string | null
  /** `true` si no tiene sobre y no es traspaso. Ver R2. */
  pendiente: boolean
  /** `true` si es una de las dos patas de un traspaso. */
  pata: boolean
  /**
   * La otra pata del grupo, si la hay. Viene del repositorio.
   *
   * `null` en los dos casos que la pantalla trata igual: que no sea un traspaso, o que lo sea
   * con una sola pata. El `id` es lo que el formulario de edicion necesita para dejar el
   * destino ya elegido; el `nombre` es lo que hace legible la fila sin abrirla.
   */
  contraparte_cuenta_id: number | null
  contraparte_cuenta_nombre: string | null
}

/**
 * El estado de partida de cada formulario.
 *
 * Va anotado con el tipo del resultado y no como `{ ok: false } as const`: sin la anotacion,
 * TypeScript infiere el literal y el estado del formulario queda como una union de ese
 * literal con el resultado real, y `estado.campos` deja de existir. Es el mismo motivo por el
 * que `as const` no va aca.
 */
const INICIAL: ResultadoDeMovimiento = { ok: false }

const TIPOS = [
  { valor: '', etiqueta: 'Todos los tipos' },
  { valor: 'gasto', etiqueta: 'Gastos' },
  { valor: 'ingreso', etiqueta: 'Ingresos' },
  { valor: 'traspaso', etiqueta: 'Traspasos' },
]

const ETIQUETA_TIPO: Record<MovimientoEnVista['tipo'], string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  traspaso: 'Traspaso',
}

/**
 * El boton que se deshabilita mientras su formulario corre.
 *
 * `useFormStatus` lee el `<form>` que lo contiene, asi que tiene que ser hijo del `<form>`.
 * Por eso no se puede usar en el boton de "limpiar filtros", que es un enlace.
 */
function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

/*
 * El resultado de una accion, con el aviso retroactivo al lado.
 *
 * Las dos mitades van juntas: si la operacion se hizo, el `aviso` dice que paso y el aviso
 * retroactivo de R7 agrega el matiz de que tambien se movio un mes anterior. En un error solo
 * hay mensaje: `periodo_afectado` no viaja en ese caso, asi que no necesita guarda propia.
 *
 * El enlace a comparativos es la otra mitad de R3. Editar, dar de alta o borrar un movimiento
 * de un periodo ya comparado cambia sus totales, y el aviso de arriba solo mira el mes que se
 * esta viendo. Este enlace lleva al usuario a la comparacion con `recalculado=1`, que es lo
 * que hace que `/comparativos` diga que las cifras cambiaron —el aviso vive en la pagina que
 * muestra las cifras, no en la que se edito—.
 *
 * Es un enlace y no un boton: no cambia datos, es la manera de ir a mirar el efecto.
 */
function Resultado({
  estado,
  periodo,
  cartera_id,
}: {
  estado: ResultadoDeMovimiento
  periodo: string
  cartera_id: number
}) {
  if (estado.error) {
    return <Aviso tono="error">{estado.error}</Aviso>
  }
  return (
    <div className={detalle.bloque}>
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
      <AvisoRetroactivo periodoAfectado={estado.periodo_afectado} periodoActual={periodo} />
      {estado.periodo_afectado ? (
        <p className={detalle.nota}>
          <a
            href={`/comparativos?cartera=${cartera_id}&mes=${estado.periodo_afectado}&recalculado=1`}
            className={detalle.enlaceSuave}
          >
            Ver la comparación recalculada
          </a>
        </p>
      ) : null}
    </div>
  )
}

/**
 * El bloque de arriba del formulario: el resultado y, si el error es de forma, el pique para
 * mirar los campos.
 *
 * El mensaje de error **no** se desglosa aca: cada `Campo` y cada `Selector` ya muestran el
 * suyo desde `estado.campos`, que es donde va el detalle. Aca solo va el resumen y el aviso
 * de que se revisan los marcados.
 */
function Campos({
  estado,
  periodo,
  cartera_id,
}: {
  estado: ResultadoDeMovimiento
  periodo: string
  cartera_id: number
}) {
  return (
    <>
      <Resultado estado={estado} periodo={periodo} cartera_id={cartera_id} />
      {estado.campos && !estado.error ? (
        <p className={detalle.nota}>
          Revisá los campos marcados e intentá de nuevo.
        </p>
      ) : null}
    </>
  )
}

/**
 * Alta de un movimiento.
 *
 * El formulario de edicion es el mismo con los valores de otro movimiento ya escritos: no
 * hay uno aparte con su propia validacion, porque `editarMovimiento` valida contra lo que
 * **quedaria** y no contra lo que el usuario intento dejar sin tocar. Por eso el formulario
 * de edicion tambien manda todos los campos.
 *
 * `estadoInicial` no lo manda nadie en produccion: existe para que una prueba pueda renderizar
 * el aviso ya emitido y comprobar que sale en el HTML. Es la unica costura entre la vista y
 * las pruebas, y por eso esta nombrada y no escondida.
 */
export function FormularioNuevoMovimiento({
  cartera_id,
  cuentas,
  sobres,
  periodo,
  estadoInicial,
}: {
  cartera_id: number
  cuentas: ReadonlyArray<OpcionVista>
  sobres: ReadonlyArray<OpcionVista>
  /** El mes que se esta mirando, para el aviso retroactivo. */
  periodo: string
  estadoInicial?: ResultadoDeMovimiento
}) {
  const [estado, enviar] = useActionState(
    (prev: ResultadoDeMovimiento, datos: FormData) =>
      accionRegistrarMovimiento(cartera_id, prev, datos),
    estadoInicial ?? INICIAL,
  )

  return (
    <form action={enviar} className={detalle.formulario}>
      <Campos estado={estado} periodo={periodo} cartera_id={cartera_id} />
      <div className={detalle.grillaDos}>
        <Selector
          opciones={cuentas}
          nombre="cuenta_id"
          etiqueta="Cuenta"
          vacio="Elegi una cuenta"
          error={estado.campos?.cuenta_id}
        />
        <Selector
          opciones={sobres}
          nombre="sobre_id"
          etiqueta="Sobre"
          vacio="Sin sobre (queda pendiente)"
          error={estado.campos?.sobre_id}
        />
        <Campo
          nombre="monto"
          etiqueta="Importe"
          ayuda="Negativo para un gasto, positivo para un ingreso. El cero no se acepta."
          error={estado.campos?.monto}
        />
        <Campo
          nombre="fecha"
          etiqueta="Fecha"
          tipo="date"
          ayuda="El dia que el movimiento pertenece a ese mes, no el dia que lo anotas."
          error={estado.campos?.fecha}
        />
        <Campo nombre="descripcion" etiqueta="Descripcion" ayuda="Opcional." requerido={false} />
        <Campo
          nombre="comercio"
          etiqueta="Comercio"
          ayuda="Opcional. Es el segundo campo que busca el filtro de texto."
          requerido={false}
        />
      </div>
      <div className={detalle.alDerecha}>
        <AccionPendiente>Registrar movimiento</AccionPendiente>
      </div>
    </form>
  )
}

/**
 * Editar un movimiento, con sus valores ya escritos.
 *
 * Los campos van con `defaultValue` y no con `value`, porque son uncontrolled: el
 * `value` los volveria de solo lectura en React y el usuario no podria corregir nada.
 */
export function FilaEditarMovimiento({
  cartera_id,
  movimiento,
  cuentas,
  sobres,
  periodo,
}: {
  cartera_id: number
  movimiento: MovimientoEnVista
  cuentas: ReadonlyArray<OpcionVista>
  sobres: ReadonlyArray<OpcionVista>
  periodo: string
}) {
  const [estado, enviar] = useActionState(
    (prev: ResultadoDeMovimiento, datos: FormData) =>
      accionEditarMovimiento(cartera_id, movimiento.id, prev, datos),
    INICIAL,
  )

  return (
    <form action={enviar} className={`${detalle.formulario} ${detalle.formularioAnidado}`}>
      <Campos estado={estado} periodo={periodo} cartera_id={cartera_id} />
      <div className={detalle.grillaDos}>
        <Selector
          opciones={cuentas}
          nombre="cuenta_id"
          etiqueta="Cuenta"
          seleccionado={String(movimiento.cuenta_id)}
          error={estado.campos?.cuenta_id}
        />
        <Selector
          opciones={sobres}
          nombre="sobre_id"
          etiqueta="Sobre"
          seleccionado={movimiento.sobre_id === null ? '' : String(movimiento.sobre_id)}
          vacio="Sin sobre (queda pendiente)"
          error={estado.campos?.sobre_id}
        />
        <Campo
          nombre="monto"
          etiqueta="Importe"
          ayuda="Negativo para un gasto, positivo para un ingreso."
          error={estado.campos?.monto}
          defaultValue={paraCampo(movimiento.monto)}
        />
        <Campo
          nombre="fecha"
          etiqueta="Fecha"
          tipo="date"
          ayuda="Cambiarla mueve los derivados de los meses entre el viejo y el nuevo."
          error={estado.campos?.fecha}
          defaultValue={movimiento.fecha}
        />
        <Campo
          nombre="descripcion"
          etiqueta="Descripcion"
          requerido={false}
          defaultValue={movimiento.descripcion}
        />
        <Campo
          nombre="comercio"
          etiqueta="Comercio"
          requerido={false}
          defaultValue={movimiento.comercio ?? ''}
        />
      </div>
      <p className={detalle.nota}>
        El tipo no se edita: sale del signo del importe, y un traspaso se cambia borrando y
        registrando de nuevo.
      </p>
      <div className={detalle.alDerecha}>
        <AccionPendiente>Guardar correccion</AccionPendiente>
      </div>
    </form>
  )
}

/**
 * Una fila de la lista, con su botonera.
 *
 * Borrar, asignar y quitar sobre son formularios separados del de editar, no el mismo con
 * un campo de accion: si fueran uno, un `<button>` sin `type` seria `submit` y el click de
 * "borrar" podria terminar guardando una edicion.
 *
 * Aqui **no** hay boton de restaurar. Esta lista es la de los que cuentan, y restaurar solo
 * tiene sentido sobre una fila que ya no contaba: el boton vive en
 * `FilaMovimientoEliminada`, que es la unica que puede ofrecerlo sin contradecirse.
 */
/*
 * Corregir, asignar o quitar el sobre, y borrar: las cuatro acciones de una fila.
 *
 * Las cuatro van en el modal del "⋯" y la fila queda en lectura: descripcion, recorrido,
 * monto y los pills. El pill de "sin asignar" sigue siendo la senal de que falta algo, y
 * por eso la accion aparece sola en el menu cuando el movimiento esta pendiente.
 */
export function FilaMovimiento({
  cartera_id,
  movimiento,
  cuentas,
  sobres,
  moneda,
  periodo,
  abierta,
}: {
  cartera_id: number
  movimiento: MovimientoEnVista
  cuentas: ReadonlyArray<OpcionVista>
  sobres: ReadonlyArray<OpcionVista>
  moneda: string
  periodo: string
  /** Si la fila arranca desplegada para editar. */
  abierta?: boolean
}) {
  const [estadoBorrar, borrar] = useActionState(
    (prev: ResultadoDeMovimiento, datos: FormData) =>
      accionEliminarMovimiento(cartera_id, movimiento.id, prev, datos),
    INICIAL,
  )
  const [estadoAsignar, asignar] = useActionState(
    (prev: ResultadoDeMovimiento, datos: FormData) =>
      accionAsignarSobre(cartera_id, movimiento.id, prev, datos),
    INICIAL,
  )

  const monto = formatear(movimiento.monto, moneda)

  return (
<li className={detalle.item}>
      <div className={detalle.itemEncabezado}>
        <div>
          <p className={detalle.itemNombre}>
            {movimiento.descripcion || ETIQUETA_TIPO[movimiento.tipo]}
            {movimiento.comercio ? (
              <span className={detalle.itemDetalle}> · {movimiento.comercio}</span>
            ) : null}
          </p>
          <p className={detalle.itemDetalle}>
            {movimiento.fecha} ·{' '}
            {/*
              Un traspaso se lee de donde a donde. Para el resto el recorrido devuelve `null` y
              queda solo el nombre de la cuenta, que es lo de siempre.
            */}
            <RecorridoDeTraspaso movimiento={movimiento} />
            {movimiento.tipo === 'traspaso' ? null : movimiento.cuenta_nombre}
            {movimiento.sobre_nombre ? ` · ${movimiento.sobre_nombre}` : ''}
          </p>
        </div>
        <p
          className={`${detalle.itemValor} ${
            movimiento.tipo === 'gasto' ? detalle.negativo : detalle.positivo
          }`}
        >
          {monto}
        </p>
      </div>

      <div className={detalle.pills}>
        <span className={detalle.pill}>{ETIQUETA_TIPO[movimiento.tipo]}</span>
        {/*
          R2: un movimiento sin sobre esta **pendiente**, no incompleto. Se marca y se ofrece
          el alta de destino en el mismo lugar: el pending no es un dato, es una accion
          pendiente de hacer.
        */}
        {movimiento.pendiente ? <span className={`${detalle.pill} ${detalle.pillAtencion}`}>sin asignar</span> : null}
        {/*
          Una pata de traspaso no se edita ni se borra sola: R6 dice que se van las dos. El
          boton dice las dos cosas para que el click no sea una sorpresa.
        */}
        {movimiento.pata ? <span className={`${detalle.pill} ${detalle.pillTraspaso}`}>pata de un traspaso</span> : null}
      </div>

      {/*
        Las dos ramas van al mismo modal con la misma etiqueta y cambian **solo** el formulario
        de adentro. Antes de `070` D5 no habia rama de pata: una pata no se corregia, porque
        `editarMovimiento` la rechazaba. Ahora se corrige en espejo, asi que el formulario es
        el de traspasos, y por eso el aviso de que se mueven las dos patas va ahi y no en un
        `onClick` de este boton.
      */}
      <MenuDeFila
        titulo={`Acciones de ${movimiento.descripcion || ETIQUETA_TIPO[movimiento.tipo]}`}
        acciones={[
          {
            etiqueta: movimiento.pata ? 'Corregir el traspaso' : 'Corregir',
            contenido: movimiento.pata ? (
              <FilaEditarTraspaso
                cartera_id={cartera_id}
                movimiento={movimiento}
                cuentas={cuentas}
                periodo={periodo}
              />
            ) : (
              <FilaEditarMovimiento
                cartera_id={cartera_id}
                movimiento={movimiento}
                cuentas={cuentas}
                sobres={sobres}
                periodo={periodo}
              />
            ),
          },
          ...(!movimiento.pata && (movimiento.pendiente || movimiento.sobre_id === null)
            ? [
                {
                  /*
                    Asignar sobre se ofrece cuando no tiene sobre y **no** es una pata.
                    `sobre_id === null` solo, sin el `!pata`, alcanzaria tambien a las patas de
                    un traspaso —que tampoco tienen sobre— y llevaria al usuario a un
                    `TraspasoNoAsignable` que el formulario no podia prever. El `!pata` va
                    primero y por eso: el repositorio rechaza asignar a una pata, sin excepcion.
                  */
                  etiqueta: 'Asignar sobre',
                  contenido: (
                    <>
                      {estadoAsignar.error ? (
                        <Aviso tono="error">{estadoAsignar.error}</Aviso>
                      ) : null}
                      {estadoAsignar.aviso ? (
                        <Aviso tono="exito">{estadoAsignar.aviso}</Aviso>
                      ) : null}
                      <form action={asignar} className={detalle.formularioEnLinea}>
                        <Selector
                          opciones={sobres}
                          nombre="sobre_id"
                          etiqueta="Asignar a"
                          vacio="Elegi un sobre"
                          error={estadoAsignar.campos?.sobre_id}
                        />
                        <AccionPendiente>Asignar sobre</AccionPendiente>
                      </form>
                    </>
                  ),
                },
              ]
            : []),
          ...(movimiento.sobre_id !== null
            ? [
                {
                  /*
                    Quitar el sobre es el mismo `accionAsignarSobre` con el campo vacio. Mandar
                    un `sobre_id` vacio es lo que el repositorio lee como "quitar", y asi no
                    hace falta una accion aparte que solo se diferencie en un parametro.
                  */
                  etiqueta: 'Quitar sobre',
                  contenido: (
                    <>
                      {estadoAsignar.error ? (
                        <Aviso tono="error">{estadoAsignar.error}</Aviso>
                      ) : null}
                      {estadoAsignar.aviso ? (
                        <Aviso tono="exito">{estadoAsignar.aviso}</Aviso>
                      ) : null}
                      <form action={asignar}>
                        <input type="hidden" name="sobre_id" value="" />
                        <AccionPendiente>Quitar sobre</AccionPendiente>
                      </form>
                    </>
                  ),
                },
              ]
            : []),
          {
            /*
              El borrado aparece **siempre**, patas incluidas: R6 dice que borrar una pata
              borra las dos, asi que la accion existe y el boton lo dice. Lo que no existe para
              una pata es la edicion, y por eso arriba la primera etiqueta cambia.

              El aviso nombra las dos consecuencias porque son distintas: una es logica y la otra
              es en cascada. Decir solo "se puede restaurar" dejaria al usuario sin notar que
              con una pata se lleva su contraparte.
            */
            etiqueta: movimiento.pata ? 'Borrar las dos patas' : 'Borrar',
            peligro: true,
            contenido: (
              <>
                {estadoBorrar.error ? <Aviso tono="error">{estadoBorrar.error}</Aviso> : null}
                {estadoBorrar.aviso ? <Aviso tono="exito">{estadoBorrar.aviso}</Aviso> : null}
                <Confirmar
                  titulo={
                    movimiento.pata ? 'Borrar las dos patas del traspaso' : 'Borrar el movimiento'
                  }
                  childrenAcciones={
                    <form action={borrar}>
                      <AccionPendiente>
                        {movimiento.pata ? 'Borrar las dos patas' : 'Borrar'}
                      </AccionPendiente>
                    </form>
                  }
                >
                  {movimiento.pata ? (
                    <p>
                      Este movimiento es una pata de un traspaso, asi que se van las dos: la de
                      origen y la de destino. El saldo de las dos cuentas se recalcula, y todo
                      queda disponible para restaurar desde los eliminados.
                    </p>
                  ) : (
                    <p>
                      El borrado es logico: no borra la fila, la deja de contar en todos los
                      calculos y recalcula el saldo de la cuenta y los disponibles de los
                      sobres. Se puede restaurar.
                    </p>
                  )}
                </Confirmar>
              </>
            ),
          },
        ]}
      />
    </li>
  )
}

/**
 * Una fila de la lista de **eliminados**, con lo unico que se puede hacer: restaurarla.
 *
 * No hay edicion, ni asignar, ni quitar sobre, ni borrar. No es que falten: no existen. El
 * repositorio rechaza las tres sobre una fila eliminada, y ofrecer un boton que solo puede
 * terminar en un error esotope la pantalla. Lo que R6 pide es que el registro se conserve y
 * que se pueda restablecer, y nada mas.
 *
 * El boton dice "Restaurar las dos patas" cuando la fila es de un traspaso, porque restaurar
 * cualquiera de las dos restaura las dos: es el mismo aviso que el de borrar, al reves.
 */
export function FilaMovimientoEliminada({
  cartera_id,
  movimiento,
  moneda,
  eliminada_en,
}: {
  cartera_id: number
  movimiento: MovimientoEnVista
  moneda: string
  /** `AAAA-MM-DD HH:MM:SS`, el `eliminado_en` derivado. */
  eliminada_en: string | null
}) {
  const [estado, restaurar] = useActionState(
    (prev: ResultadoDeMovimiento, datos: FormData) =>
      accionRestaurarMovimiento(cartera_id, movimiento.id, prev, datos),
    INICIAL,
  )

  return (
    <li className={`${detalle.item} ${detalle.itemArchivado}`}>
      <div className={detalle.itemEncabezado}>
        <div>
          <p className={`${detalle.itemNombre} ${detalle.tachado}`}>
            {movimiento.descripcion || ETIQUETA_TIPO[movimiento.tipo]}
            {movimiento.comercio ? (
              <span className={detalle.itemDetalle}> · {movimiento.comercio}</span>
            ) : null}
          </p>
          <p className={`${detalle.itemDetalle} ${detalle.apagado}`}>
            {movimiento.fecha} · {movimiento.cuenta_nombre}
            {eliminada_en ? ` · eliminado el ${eliminada_en.slice(0, 10)}` : ''}
          </p>
        </div>
        <p className={`${detalle.itemValor} ${detalle.valorMedio} ${detalle.apagado}`}>
          {formatear(movimiento.monto, moneda)}
        </p>
      </div>

      <div className={detalle.acciones}>
        <form action={restaurar}>
          <AccionPendiente>
            {movimiento.pata ? 'Restaurar las dos patas' : 'Restaurar'}
          </AccionPendiente>
        </form>
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
      </div>
    </li>
  )
}

/**
 * Los movimientos eliminados, debajo de la lista que si cuenta.
 *
 * Solo se dibuja si hay alguno. Una lista vacia de eliminados es ruido: informa de que no
 * hay errores, y el usuario que no borro nada no necesita saberlo cada vez que abre la
 * cartera.
 */
export function ListaMovimientosEliminados({
  cartera_id,
  movimientos,
  moneda,
  eliminados_en,
}: {
  cartera_id: number
  movimientos: ReadonlyArray<MovimientoEnVista>
  moneda: string
  /** `id` a `eliminado_en`, porque la fila no lo trae derivado como string. */
  eliminados_en: ReadonlyMap<number, string | null>
}) {
  if (movimientos.length === 0) return null

  return (
    <section className={detalle.bloque}>
      <h3 className={detalle.seccionTituloPequeño}>Eliminados</h3>
      <p className={detalle.nota}>
        No cuentan en ningun calculo, pero se conservan: R6 es un borrado logico y por eso se
        pueden restaurar.
      </p>
      <ul className={detalle.lista}>
        {movimientos.map((movimiento) => (
          <FilaMovimientoEliminada
            key={movimiento.id}
            cartera_id={cartera_id}
            movimiento={movimiento}
            moneda={moneda}
            eliminada_en={eliminados_en.get(movimiento.id) ?? null}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * La lista, con los filtros arriba.
 *
 * El formulario de filtros es un `GET` sin `action` y sin Server Action: R9 pide que el
 * filtro viva en la URL, y un `GET` puro lo garantiza —el navegador pone los campos en el
 * query— sin necesidad de JavaScript ni de un endpoint. Si fuera un formulario con
 * Server Action, el estado del filtro quedaria en el servidor y la URL no seria compartible.
 */
export function ListaMovimientos({
  cartera_id,
  movimientos,
  cuentas,
  sobres,
  moneda,
  periodo,
  filtro,
  hayFiltro,
  filtroInvalido = false,
}: {
  cartera_id: number
  movimientos: ReadonlyArray<MovimientoEnVista>
  cuentas: ReadonlyArray<OpcionVista>
  sobres: ReadonlyArray<OpcionVista>
  moneda: string
  periodo: string
  /** El filtro que esta en la URL, para que los selectores abran donde dejaste. */
  filtro: {
    texto: string
    cuenta_id: string
    sobre_id: string
    tipo: string
    desde: string
    hasta: string
  }
  hayFiltro: boolean
  /**
   * La URL trae un filtro que no se pudo aplicar.
   *
   * La lista se muestra vacia a proposito, aunque la consulta haya devuelto todo. Mostrar
   * todo cuando el filtro no se aplico es lo que hace que el usuario piense que filtro y son
   * sus datos los que no aparecen: el error de un filtro mal puesto es no ver nada.
   */
  filtroInvalido?: boolean
}) {
  return (
    <div className={detalle.bloque}>
      <form method="get" className={detalle.filtros}>
        <Campo
          nombre="texto"
          etiqueta="Buscar"
          ayuda="Busca en la descripcion y en el comercio."
          requerido={false}
          defaultValue={filtro.texto}
        />
        <Selector
          opciones={cuentas}
          nombre="cuenta_id"
          etiqueta="Cuenta"
          vacio="Todas"
          seleccionado={filtro.cuenta_id}
        />
        <Selector
          opciones={sobres}
          nombre="sobre_id"
          etiqueta="Sobre"
          vacio="Todos"
          seleccionado={filtro.sobre_id}
        />
        <label className={detalle.campo}>
          <span className={detalle.etiqueta}>Tipo</span>
          <select
            name="tipo"
            defaultValue={filtro.tipo}
            className={detalle.selector}
          >
            {TIPOS.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <Campo nombre="desde" etiqueta="Desde" tipo="date" requerido={false} defaultValue={filtro.desde} />
        <Campo nombre="hasta" etiqueta="Hasta" tipo="date" requerido={false} defaultValue={filtro.hasta} />
        <div className={detalle.formularioCercano}>
          <Boton>Filtrar</Boton>
          {/*
            Limpiar es un enlace al panel sin query, no un boton: limpiar un filtro no es una
            operacion sobre datos, es volver a la vista sin parametros. El ancla deja al usuario
            en el panel de movimientos en vez de reprocesar la pagina entera desde arriba.
          */}
          {hayFiltro ? (
            <a
              href={`/panel?cartera=${cartera_id}#movimientos`}
              className={detalle.enlaceSuave}
            >
              Limpiar
            </a>
          ) : null}
        </div>
      </form>

      {filtroInvalido || movimientos.length === 0 ? (
        <p className={detalle.vacio}>
          {hayFiltro
            ? 'Ningún movimiento coincide con el filtro. Podés limpiarlo para ver todos.'
            : 'Todavía no hay movimientos en esta cartera.'}
        </p>
      ) : (
        <MovimientosPorDia
          cartera_id={cartera_id}
          movimientos={movimientos}
          cuentas={cuentas}
          sobres={sobres}
          moneda={moneda}
          periodo={periodo}
        />
      )}
    </div>
  )
}

/**
 * Los movimientos agrupados por dia, con el total de cada dia.
 *
 * Sin agrupar, una cartera con dos meses de historia es una sola lista de ochenta filas y la
 * pregunta de siempre —"cuanto gaste el martes"— obliga a recorrerla entera. Con el dia como
 * cabecera y su total al lado, la lista se lee por bloques y el total del dia esta a la vista
 * sin sumar nada a mano.
 *
 * El total se arma en centimos con `aCentimos`, no con `Number`: sumar importes como flotantes
 * es justo lo que la regla del dinero prohibe. Los movimientos llegan ordenados por fecha
 * descendente desde el repositorio, asi que los dias ya vienen en orden y solo hace falta
 * cortar cuando la fecha cambia.
 *
 * La cabecera **no** es un filtro: no se puede plegar y no es pulsable. Un dia que se pliega
 * esconde justo el dato que el agrupado acaba de hacer visible.
 */
function MovimientosPorDia({
  cartera_id,
  movimientos,
  cuentas,
  sobres,
  moneda,
  periodo,
}: {
  cartera_id: number
  movimientos: ReadonlyArray<MovimientoEnVista>
  cuentas: ReadonlyArray<OpcionVista>
  sobres: ReadonlyArray<OpcionVista>
  moneda: string
  periodo: string
}) {
  const dias: { fecha: string; delDia: MovimientoEnVista[] }[] = []

  for (const movimiento of movimientos) {
    const ultimo = dias[dias.length - 1]
    if (ultimo && ultimo.fecha === movimiento.fecha) {
      ultimo.delDia.push(movimiento)
    } else {
      dias.push({ fecha: movimiento.fecha, delDia: [movimiento] })
    }
  }

  return (
    <div className={detalle.bloqueDias}>
      {dias.map((dia) => (
        <section key={dia.fecha} className={detalle.dia}>
          {/*
            El total del dia excluye los traspasos, igual que el total gastado del panel:
            un traspaso mueve dinero de una cuenta a otra y no es gasto ni ingreso. Los
            traspasos quedan en la lista, contados en el numero, pero no suman.
          */}
          <header className={detalle.diaCabecera}>
            <h4 className={detalle.diaFecha}>{etiquetaDeDia(dia.fecha)}</h4>
            <span className={detalle.diaConteo}>
              {dia.delDia.length}{' '}
              {dia.delDia.length === 1 ? 'movimiento' : 'movimientos'}
            </span>
            <span className={detalle.diaTotal}>{totalDelDia(dia.delDia, moneda)}</span>
          </header>

          <ul className={detalle.lista}>
            {dia.delDia.map((movimiento) => (
              <FilaMovimiento
                key={movimiento.id}
                cartera_id={cartera_id}
                movimiento={movimiento}
                cuentas={cuentas}
                sobres={sobres}
                moneda={moneda}
                periodo={periodo}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * El total de un dia, ya formateado.
 *
 * Suma solo los importes con signo —un gasto es negativo y lo baja— y salta los traspasos.
 * Devuelve cadena vacia cuando el dia no tiene nada que sumar, para que la cabecera no
 * muestre un `$0.00` al lado de una celda vacia.
 */
function totalDelDia(
  movimientos: ReadonlyArray<MovimientoEnVista>,
  moneda: string,
): string {
  let centimos = 0n
  for (const movimiento of movimientos) {
    if (movimiento.tipo === 'traspaso') continue
    centimos += aCentimos(movimiento.monto)
  }
  return centimos === 0n ? '' : formatear(deCentimos(centimos), moneda)
}

/**
 * La fecha del dia, como la lee una persona.
 *
 * "2026-03-31" es un dato, no un encabezado. El formato largo con el dia de la semana
 * responde de un vistazo "este mes" o "el mes pasado", que es como el usuario piensa cuando
 * mira una lista de gastos. La conversion es textual y no usa `Date`: parsear el string a
 * `Date` y formatearlo devuelve el dia incorrecto en las zonas al oeste de UTC, porque el
 * string se interpreta a medianoche UTC y el formateo local lo corre un dia para atras.
 */
function etiquetaDeDia(fecha: string): string {
  const diasDeSemana = [
    'domingo',
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
  ]
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]

  const [anio = '', mes = '', dia = ''] = fecha.split('-')
  if (!anio || !mes || !dia) return fecha

  // `new Date(anio, mes - 1, dia)` con el **anio como numero**: sin el `Number`, el
  // constructor toma el string como un caso no ISO y devuelve una fecha invalida.
  const fechaLocal = new Date(Number(anio), Number(mes) - 1, Number(dia))
  const diaDeSemana = diasDeSemana[fechaLocal.getDay()] ?? ''
  const nombreDeMes = meses[Number(mes) - 1] ?? mes

  return `${diaDeSemana} ${Number(dia)} de ${nombreDeMes} de ${anio}`
}
