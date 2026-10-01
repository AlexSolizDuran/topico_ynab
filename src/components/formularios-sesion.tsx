'use client'

/**
 * Formularios de sesion.
 *
 * Es la unica pieza que necesita 'use client', y solo por `useActionState`: el
 * estado del formulario y el resultado de la accion viven en el cliente. La
 * logica de autenticacion no esta aqui —esta en `sesion/servicio.ts`—, asi que
 * un boton deshabilitado no es una decision de seguridad.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  accionActualizarPerfil,
  accionCambiarContrasena,
  accionIniciarSesion,
  accionRegistrar,
} from '../sesion/acciones'
import { MINIMO_CONTRASENA } from '../sesion/validacion'
import { Aviso, Boton, Campo } from './sesion'

/** Estado inicial: sin errores y sin aviso. */
const INICIAL = { ok: false, error: undefined, campos: undefined, aviso: undefined } as const

function AccionPendiente({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Boton pendiente={pending}>{children}</Boton>
}

export function FormularioEntrar() {
  const [estado, accion] = useActionState(accionIniciarSesion, INICIAL)

  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}

      <Campo
        nombre="nombre_usuario"
        etiqueta="Usuario"
        autoComplete="username"
        error={estado.campos?.nombre_usuario}
        autoFocus
      />
      <Campo
        nombre="contrasena"
        etiqueta="Contrasena"
        tipo="password"
        autoComplete="current-password"
        error={estado.campos?.contrasena}
      />

      <AccionPendiente>Entrar</AccionPendiente>
    </form>
  )
}

export function FormularioRegistro() {
  const [estado, accion] = useActionState(accionRegistrar, INICIAL)

  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}

      <Campo nombre="nombre" etiqueta="Nombre" autoComplete="given-name" error={estado.campos?.nombre} autoFocus />
      <Campo
        nombre="apellido"
        etiqueta="Apellido"
        autoComplete="family-name"
        error={estado.campos?.apellido}
      />
      <Campo
        nombre="nombre_usuario"
        etiqueta="Usuario"
        autoComplete="username"
        ayuda="3 a 50 caracteres: letras, numeros, punto, guion y guion bajo."
        error={estado.campos?.nombre_usuario}
      />
      <Campo
        nombre="correo"
        etiqueta="Correo"
        tipo="email"
        autoComplete="email"
        error={estado.campos?.correo}
      />
      <Campo
        nombre="contrasena"
        etiqueta="Contrasena"
        tipo="password"
        autoComplete="new-password"
        minLength={MINIMO_CONTRASENA}
        ayuda={`Al menos ${MINIMO_CONTRASENA} caracteres.`}
        error={estado.campos?.contrasena}
      />

      <AccionPendiente>Crear cuenta</AccionPendiente>
    </form>
  )
}

export function FormularioCambiarContrasena() {
  const [estado, accion] = useActionState(accionCambiarContrasena, INICIAL)

  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      <Campo
        nombre="contrasena_actual"
        etiqueta="Contrasena actual"
        tipo="password"
        autoComplete="current-password"
        error={estado.campos?.contrasena_actual}
        autoFocus
      />
      <Campo
        nombre="contrasena_nueva"
        etiqueta="Contrasena nueva"
        tipo="password"
        autoComplete="new-password"
        minLength={MINIMO_CONTRASENA}
        ayuda={`Al menos ${MINIMO_CONTRASENA} caracteres, y distinta de la actual.`}
        error={estado.campos?.contrasena_nueva}
      />
      <Campo
        nombre="confirmacion"
        etiqueta="Repetir contrasena nueva"
        tipo="password"
        autoComplete="new-password"
        error={estado.campos?.confirmacion}
      />

      <AccionPendiente>Cambiar contrasena</AccionPendiente>
    </form>
  )
}

/**
 * Datos de perfil: nombre, apellido y correo.
 *
 * `nombre_usuario` y `zona_horaria` se muestran pero NO se mandan como campos
 * editables: el primero es el identificador de acceso, y la segunda decide donde
 * cae el corte de mes de cada sobre. Van en `hidden` para que el formulario se
 * entendan solo, y el servicio los ignora igual.
 */
export function FormularioDatosPerfil({
  nombre,
  apellido,
  correo,
  nombre_usuario,
  zona_horaria,
}: {
  nombre: string
  apellido: string
  correo: string
  nombre_usuario: string
  zona_horaria: string
}) {
  const [estado, accion] = useActionState(accionActualizarPerfil, INICIAL)

  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {estado.aviso ? <Aviso tono="exito">{estado.aviso}</Aviso> : null}

      <Campo
        nombre="nombre"
        etiqueta="Nombre"
        autoComplete="given-name"
        defaultValue={nombre}
        error={estado.campos?.nombre}
      />
      <Campo
        nombre="apellido"
        etiqueta="Apellido"
        autoComplete="family-name"
        defaultValue={apellido}
        error={estado.campos?.apellido}
      />
      <Campo
        nombre="correo"
        etiqueta="Correo"
        tipo="email"
        autoComplete="email"
        defaultValue={correo}
        error={estado.campos?.correo}
      />

      {/* No editables: se muestran para que el usuario sepa cual es, y no se pueden tocar. */}
      <input type="hidden" name="nombre_usuario" value={nombre_usuario} readOnly />
      <input type="hidden" name="zona_horaria" value={zona_horaria} readOnly />

      <AccionPendiente>Guardar cambios</AccionPendiente>
    </form>
  )
}
