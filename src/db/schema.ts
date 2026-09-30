/**
 * Schema de Drizzle: punto unico de ampliacion.
 *
 * Cada change agrega aqui las tablas que le tocan. El orden de los changes es el
 * orden de las migraciones, y una migracion que ya corrio no se edita: se agrega
 * una nueva.
 *
 * Identificadores en espanol, sin acentos, para calzar con `modelo.puml`.
 */
import { carteras } from './tablas/carteras'
import { cuentas, gruposTransferencia, movimientos } from './tablas/cuentas'
import { grupos } from './tablas/grupos'
import { reglasRecurrentes } from './tablas/recurrencias'
import { metas, estadoMeta } from './tablas/metas'
import { sesiones } from './tablas/sesiones'
import { asignaciones, sobres } from './tablas/sobres'
import { usuarios } from './tablas/usuarios'

export const schema = {
  // 010-auth
  usuarios,
  estadoMeta,
  sesiones,
  carteras,
  // 030-cuentas
  cuentas,
  movimientos,
  // 040-grupos
  grupos,
  // 050-sobres
  sobres,
  asignaciones,
  // 060-transacciones
  gruposTransferencia,
  // 080-recurrencias
  reglasRecurrentes,
  // 090-metas
  metas,
}

export {
  asignaciones,
  carteras,
  cuentas,
  grupos,
  gruposTransferencia,
  metas,
  movimientos,
  reglasRecurrentes,
  sobres,
  sesiones,
  usuarios,
}

// Los tipos viajan por aqui, y no por cada archivo de tabla, para que los
// repositorios tengan un solo lugar del que importar.
export type { Cartera, NuevaCartera } from './tablas/carteras'
export type {
  Cuenta,
  GrupoTransferencia,
  Movimiento,
  NuevaCuenta,
  NuevoGrupoTransferencia,
  NuevoMovimiento,
} from './tablas/cuentas'
export type { Grupo, NuevoGrupo } from './tablas/grupos'
export type {
  EstadoMeta,
  Meta,
  NuevaMeta,
} from './tablas/metas'
export type {
  NuevaReglaRecurrente,
  ReglaRecurrente,
} from './tablas/recurrencias'
export type {
  Asignacion,
  NuevaAsignacion,
  NuevoSobre,
  Sobre,
} from './tablas/sobres'
export type { NuevaSesion, Sesion } from './tablas/sesiones'
export type { NuevaUsuario, Usuario } from './tablas/usuarios'
