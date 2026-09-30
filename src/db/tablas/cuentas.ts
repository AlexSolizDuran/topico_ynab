import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { carteras } from './carteras'
import { reglasRecurrentes } from './recurrencias'
import { sobres } from './sobres'

/** corriente, ahorro, efectivo, credito. El tipo decide si es dinero o deuda. */
export const tipoDeCuenta = pgEnum('tipo_cuenta', [
  'corriente',
  'ahorro',
  'efectivo',
  'credito',
] as const)

/**
 * `cuentas` — los lugares fisicos donde el usuario tiene dinero o debe dinero.
 *
 * El saldo **no es una columna**. Se deriva: `saldo = saldo_inicial + sum(movimientos
 * .monto)`. La razon esta en el requerimiento y es la correcta: un saldo
 * almacenado se desincroniza en cuanto se borra un movimiento, y repararlo exige un
 * trigger o un proceso. Derivado, siempre cuadra.
 *
 * El nombre de una cuenta es unico DENTRO de la cartera, no del usuario: la misma
 * palabra puede existir en dos carteras distintas.
 */
export const cuentas = pgTable(
  'cuentas',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cartera_id: integer('cartera_id')
      .notNull()
      .references(() => carteras.id, { onDelete: 'cascade' }),

    nombre: varchar('nombre', { length: 60 }).notNull(),

    tipo: tipoDeCuenta('tipo').notNull().default('corriente'),

    /**
     * Lo unico que el usuario declara de su saldo. `numeric(16,2)` de Postgres, que
     * Drizzle devuelve como **string**: nunca `number`, nunca `parseFloat`.
     */
    saldo_inicial: numeric('saldo_inicial', { precision: 16, scale: 2 }).notNull().default('0.00'),

    archivada: boolean('archivada').notNull().default(false),
    orden: integer('orden').notNull().default(0),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    eliminado_en: timestamp('eliminado_en', { withTimezone: true }),
  },
  (tabla) => [
    index('cuentas_cartera_id').on(tabla.cartera_id),
    uniqueIndex('cuentas_cartera_nombre')
      .on(tabla.cartera_id, tabla.nombre)
      .where(sql`${tabla.eliminado_en} is null`),
  ],
)

export const tipoDeMovimiento = pgEnum('tipo_movimiento', ['gasto', 'ingreso', 'traspaso'])
export const origenDeMovimiento = pgEnum('origen_movimiento', ['manual', 'recurrente'])

/**
 * `grupos_transferencia` — el par de patas de un traspaso entre cuentas.
 *
 * Una fila es **una** transferencia, no un movimiento: las dos patas salen por
 * `transferencia_id` y comparten esta fila como su unico identificador de grupo.
 * Por eso el borrado en cascada de `R6` se puede resolver con una sola instruccion
 * sobre las filas que comparten el valor.
 *
 * **No tiene `cartera_id`, y no porque las patas puedan estar en carteras distintas.** Al
 * principio se decia exactamente eso, y era falso: `traspasos` R1 prohibe el traspaso entre
 * carteras y `PREGUNTAS.md` #1 lo confirmó como prohibicion total, sin la excepcion de la
 * misma moneda. Las dos patas son **siempre** de la misma cartera, asi que una columna
 * seria una duplicacion de `cuentas.cartera_id` de cada pata.
 *
 * La columna se dejo ausente igual, y por un motivo que sigue valiendo: las sumas del
 * proyecto **agrupan por cartera**, y una columna en el grupo que no participa de ninguna
 * suma es una segunda fuente de verdad para el mismo dato. Si alguna vez hiciera falta
 * para indexar, se agrega con una migracion nueva: las aplicadas son inmutables. Ver D7.
 *
 * La creo `060-transacciones` junto a la columna `transferencia_id`, porque agregar una
 * columna a una tabla ya desplegada es una migracion mas y este repo trata las migraciones
 * aplicadas como inmutables. El **consumidor** —el alta del par— es `070-traspasos`.
 */
export const gruposTransferencia = pgTable('grupos_transferencia', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  descripcion: varchar('descripcion', { length: 255 }).notNull(),
  fecha: date('fecha', { mode: 'string' }).notNull(),
  creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * `movimientos` — el libro de donde sale el saldo de una cuenta y el gastado de un
 * sobre.
 *
 * La crea `030-cuentas` y no `060-transacciones`, por el mismo motivo por el que
 * `010-auth` creo `carteras`: **el requerimiento de saldo de `cuentas` R2 no se
 * cumple sin ella**. Un saldo derivado necesita la tabla de la que se deriva, y
 * esperar a `060` dejaria cuatro de los seis escenarios de `cuentas` sin
 * comportamiento real. `060-transacciones` agrega el comportamiento —crear, editar,
 * eliminar, clasificar— sobre esta tabla ya existente, mas la columna
 * `transferencia_id` y su indice parcial, que si eran de `060`. Ver D5.
 *
 * **No tiene `periodo` ni `cartera_id`, y no se le agregan.** El periodo sale de
 * `date_trunc('month', fecha)` y la cartera de la cuenta. Ver D1 y D2.
 *
 * `sobre_id` es nullable a proposito: un traspaso entre cuentas no toca ningun
 * sobre, y una cuenta no necesita uno. `monto` lleva el signo, de modo que la suma
 * no distingue gastos de ingresos: el signo ya lo dice.
 *
 * `eliminado_en` en vez de una bandera: borrar un movimiento es una baja logica, y
 * el saldo se deriva de los que siguen vivos, de modo que borrarlo lo recalcula sin
 * intervencion manual.
 */
export const movimientos = pgTable(
  'movimientos',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cuenta_id: integer('cuenta_id')
      .notNull()
      .references(() => cuentas.id, { onDelete: 'cascade' }),

    /**
     * Ausente en un traspaso entre cuentas, y en un gasto sin sobre asignado.
     *
     * La FK se agrego en `050-sobres`, con una migracion nueva: cuando `030` creo la
     * tabla, `sobres` todavia no existia, y una migracion inmutable no se edita.
     */
    sobre_id: integer('sobre_id').references(() => sobres.id, { onDelete: 'set null' }),

    /**
     * El grupo al que pertenece la pata, en un traspaso entre cuentas.
     *
     * `null` en todo movimiento que no es traspaso, y con el id del grupo en **las dos**
     * patas de un traspaso: es esa columna compartida la que permite la cascada. Ver D5 y
     * D7.
     *
     * El emparejamiento de los signos opuestos es responsabilidad de `070-traspasos`, que
     * es quien crea el grupo. Aca la columna solo tiene que poder leerse y agruparse.
     *
     * La FK va con `on delete cascade` para que borrar el grupo en la base borre sus
     * patas. El borrado de una pata en la aplicacion es otra cosa —una baja logica en
     * cascada sobre el grupo, no un borrado de fila— y lo resuelve
     * `eliminarMovimiento` con un unico `update`. Ver D7.
     */
    transferencia_id: integer('transferencia_id').references(() => gruposTransferencia.id, {
      onDelete: 'cascade',
    }),

    tipo: tipoDeMovimiento('tipo').notNull(),

    /** Con signo: negativo gasto, positivo ingreso. `numeric(16,2)`, manejado como string. */
    monto: numeric('monto', { precision: 16, scale: 2 }).notNull(),

    fecha: date('fecha', { mode: 'string' }).notNull(),
    descripcion: varchar('descripcion', { length: 255 }).notNull(),
    comercio: varchar('comercio', { length: 120 }),

    origen: origenDeMovimiento('origen').notNull().default('manual'),

    /** Regla recurrente que origino este movimiento, si aplica. */
    regla_id: integer('regla_id').references(() => reglasRecurrentes.id, {
      onDelete: 'set null',
    }),

    eliminado_en: timestamp('eliminado_en', { withTimezone: true }),
    creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizado_en: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('movimientos_cuenta_id').on(tabla.cuenta_id),
    // El saldo se deriva sumando movimientos por cuenta: sin este indice, cada
    // lectura de saldo seria un recorrido secuencial de la tabla entera.
    index('movimientos_cuenta_vivo').on(tabla.cuenta_id).where(sql`${tabla.eliminado_en} is null`),
    // Con la FK ya puesta, el indice parcial sobre vivos es el que usa la consulta del
    // disponible: suma los movimientos de un sobre hasta el periodo.
    index('movimientos_sobre_id').on(tabla.sobre_id).where(sql`${tabla.eliminado_en} is null`),
    // El indice que usan la cascada de R6 y la busqueda de patas del grupo. Es
    // **parcial** a proposito: las dos consultas preguntan por las patas vivas, y las
    // eliminadas no tienen por que pagar el indice —que se agranda con cada baja logica
    // de una pata si el indice fuera completo.
    index('movimientos_transferencia_id')
      .on(tabla.transferencia_id)
      .where(sql`${tabla.eliminado_en} is null`),
    index('movimientos_regla_id')
      .on(tabla.regla_id)
      .where(sql`${tabla.eliminado_en} is null`),
  ],
)

export type Cuenta = typeof cuentas.$inferSelect
export type NuevaCuenta = typeof cuentas.$inferInsert
export type Movimiento = typeof movimientos.$inferSelect
export type NuevoMovimiento = typeof movimientos.$inferInsert
export type GrupoTransferencia = typeof gruposTransferencia.$inferSelect
export type NuevoGrupoTransferencia = typeof gruposTransferencia.$inferInsert
