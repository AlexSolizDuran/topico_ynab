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
import { Confirmar, MenuDeFila } from './modal'
import detalle from './detalle.module.css'

const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

/**
 * Campo de tipo de cuenta.
 *
 * Va suelto dos veces en este archivo —alta y edicion— y el `select` crudo aparecia en ambos
 * con las mismas clases. Se extrae para que el tema oscuro lo pinte una sola vez.
 */
function SelectorTipo({ valor = 'corriente', nombre = 'tipo' }: { valor?: string; nombre?: string }) {
  return (
    <label className={detalle.campo}>
      <span className={detalle.etiqueta}>Tipo</span>
      <select name={nombre} defaultValue={valor} className={detalle.selector}>
        {TIPOS_DE_CUENTA.map((tipo) => (
          <option key={tipo} value={tipo}>
            {tipo}
          </option>
        ))}
      </select>
      <span className={detalle.ayuda}>
        Una cuenta de credito representa deuda, asi que su saldo puede ser negativo.
      </span>
    </label>
  )
}

export function FormularioNuevaCuenta({ cartera_id }: { cartera_id: number }) {
  const [estado, accion] = useActionState(
    (prev: ResultadoDeCuenta, datos: FormData) => accionCrearCuenta(cartera_id, prev, datos),
    INICIAL,
  )

  return (
    <form action={accion} className={detalle.formulario}>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      <Campo nombre="nombre" etiqueta="Nombre" error={estado.campos?.nombre} />

      <SelectorTipo />

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

  /*
   * La fila es de lectura: nombre, tipo y saldo. Las cuatro acciones viven en el modal del
   * "⋯", cada una con su formulario y con su error al lado, para que un rechazo aparezca
   * junto al campo marcado y no en la punta de la tarjeta.
   */
  return (
    <li className={detalle.item}>
      <div className={detalle.itemEncabezado}>
        <div>
          <p className={detalle.itemNombre}>{nombre}</p>
          <p className={detalle.itemDetalle}>
            {tipo} · saldo inicial {formatear(saldo_inicial, moneda)}
          </p>
        </div>
        <p className={`${detalle.itemValor} ${enRojo ? detalle.negativo : ''}`}>
          {formatear(saldo, moneda)}
        </p>
      </div>

      <MenuDeFila
        titulo={`Acciones de ${nombre}`}
        acciones={[
          {
            etiqueta: 'Renombrar',
            contenido: (
              <>
                {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
                {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}
                <form action={renombrar} className={detalle.formularioCercano}>
                  <div className={detalle.crece}>
                    <Campo nombre="nombre" etiqueta="Nuevo nombre" error={estado.campos?.nombre} />
                  </div>
                  <AccionPendiente>Renombrar</AccionPendiente>
                </form>
              </>
            ),
          },
          {
            etiqueta: 'Corregir saldo inicial',
            contenido: (
              <>
                {estadoSaldo.error ? <Aviso tono="error">{estadoSaldo.error}</Aviso> : null}
                {estadoSaldo.aviso ? <Aviso tono="exito">{estadoSaldo.aviso}</Aviso> : null}
                <form action={corregir} className={detalle.formularioCercano}>
                  <div className={detalle.crece}>
                    <Campo
                      nombre="saldo_inicial"
                      etiqueta="Corregir saldo inicial"
                      error={estadoSaldo.campos?.saldo_inicial}
                      ayuda="El saldo derivado se ajusta en el acto."
                    />
                  </div>
                  <AccionPendiente>Corregir</AccionPendiente>
                </form>
              </>
            ),
          },
          {
            etiqueta: 'Cambiar tipo',
            contenido: (
              <>
                {estadoTipo.error ? <Aviso tono="error">{estadoTipo.error}</Aviso> : null}
                {estadoTipo.aviso ? <Aviso tono="exito">{estadoTipo.aviso}</Aviso> : null}
                <form action={cambiarTipo} className={detalle.formularioCercano}>
                  <div className={detalle.crece}>
                    <SelectorTipo valor={tipo} />
                  </div>
                  <AccionPendiente>Cambiar tipo</AccionPendiente>
                </form>
                {tieneMovimientos ? (
                  <p className={detalle.notaAtencion}>
                    Esta cuenta tiene movimientos, asi que el tipo ya no se puede cambiar.
                  </p>
                ) : null}
              </>
            ),
          },
          {
            /*
             * Archivar exige saldo cero —`repos/cuentas.ts` tira `SaldoNoCero`—, y eso es lo
             * que el aviso dice antes de que el usuario lo descubra por el error.
             */
            etiqueta: 'Archivar cuenta',
            peligro: true,
            contenido: (
              <>
                {estadoArchivo.error ? <Aviso tono="error">{estadoArchivo.error}</Aviso> : null}
                {estadoArchivo.aviso ? (
                  <Aviso tono="exito">{estadoArchivo.aviso}</Aviso>
                ) : null}
                <Confirmar
                  titulo="Archivar esta cuenta"
                  childrenAcciones={
                    <form action={archivar}>
                      <AccionPendiente>Archivar cuenta</AccionPendiente>
                    </form>
                  }
                >
                  <p>
                    Solo se archiva con el saldo en cero. Queda en la lista de archivadas con
                    su historial, y vuelve a estar disponible con "Restaurar".
                  </p>
                </Confirmar>
              </>
            ),
          },
        ]}
      />
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
    <li className={`${detalle.item} ${detalle.itemArchivado}`}>
      <div className={detalle.itemEncabezado}>
        <div>
          <p className={detalle.itemNombre}>{nombre}</p>
          <p className={detalle.itemDetalle}>
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
