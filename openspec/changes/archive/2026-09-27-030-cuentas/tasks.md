# Tasks

## 1. Tablas

- [x] 1.1 Crear `cuentas` en `src/db/tablas/cuentas.ts` con `cartera_id`, `nombre`, `tipo` como enum de cuatro valores, `saldo_inicial numeric(16,2)`, `archivada`, `orden` y `eliminado_en`, mas el indice unico parcial por `(cartera_id, nombre)`. Verificar con pruebas: existe, y el nombre se repite solo dentro de la cartera
- [x] 1.2 **Sin columna `saldo`**, porque el saldo se deriva. Verificar con una prueba que recorta la definicion de la tabla y falla si aparece `saldo:`
- [x] 1.3 Crear `movimientos` con `cuenta_id`, `sobre_id` sin FK, `tipo`, `monto numeric(16,2)` con signo, `fecha`, `descripcion`, `comercio`, `origen`, `eliminado_en` y timestamps, mas el indice parcial de vivos por cuenta. Verificar con pruebas: las columnas con signo, origen y baja logica existen
- [x] 1.4 Generar la migracion y **agregar los tres `CREATE TYPE`**, que drizzle-kit no emite. Verificar que PGlite aplica la migracion entera y que `pg_tables` lista `cuentas` y `movimientos`
- [x] 1.5 Exportar `cuentas` y `movimientos` en `src/db/schema.ts` y anadir las fabricas `crearCuenta` y `crearMovimiento` a `tests/helpers/fabricas.ts`

## 2. El saldo se deriva

- [x] 2.1 Implementar `saldoDeCuenta` con `saldo_inicial + coalesce(sum(monto), 0)` en SQL, con el `left join` y su condicion de `eliminado_en` en el ON. Verificar con pruebas: 5000 inicial mas un gasto de 450 da 4550, y una cuenta sin movimientos conserva su inicial
- [x] 2.2 Que el saldo vuelva como `string` y se mantenga exacto en la magnitud maxima de `numeric(16,2)`. Verificar con una prueba que comprueba el tipo y que un `Number` del mismo valor no coincide
- [x] 2.3 Implementar `listarCuentas` con el saldo derivado por cuenta, en una sola consulta, exigiendo `usuario_id`. Verificar con pruebas: devuelve nombre, tipo y saldo, y no devuelve cuentas de otro usuario
- [x] 2.4 Implementar `saldoEsCero` con la comparacion en SQL, y no comparando strings en JavaScript. Verificar con pruebas: en cero, con saldo, y a traves de movimientos que lo dejaron en cero

## 3. Crear y editar

- [x] 3.1 Implementar `crearCuenta` validando la cartera con `operarSobreCartera`, exigiendo el nombre unico en la cartera y el `saldo_inicial` como string. Verificar con pruebas: los cuatro tipos, el nombre duplicado rechazado, el mismo nombre en otra cartera permitido, y el rechazo en cartera ajena o archivada
- [x] 3.2 Implementar `cambiarNombreCuenta` conservando saldo e historial, y `cambiarOrdenCuenta` sin tocar saldos. Verificar con pruebas: renombrar deja el saldo igual, reordenar cambia la lista y no los saldos
- [x] 3.3 Implementar `cambiarTipoCuenta`, permitido solo sin movimientos. Verificar con pruebas: se cambia en una cuenta vacia, y se rechaza con explicacion en una cuenta con movimientos
- [x] 3.4 Implementar `corregirSaldoInicial`, que no recalcula nada porque no hay nada que recalcular. Verificar con pruebas: el saldo nuevo refleja el valor corregido con los movimientos existentes

## 4. Deuda, archivado y aislamiento

- [x] 4.1 Verificar el comportamiento de credito: gasto sin pagar deja el saldo en menos 600, un reembolso de 800 lo deja en 200, y una corriente negativa se muestra igual. Verificar con pruebas
- [x] 4.2 Implementar `archivarCuenta` exigiendo saldo cero, y `restaurarCuenta`. Verificar con pruebas: archiva en cero, rechaza con saldo, y restaura con su historial
- [x] 4.3 Implementar `reactivarCuenta`, que saca sola la cuenta de la lista activa cuando entra un movimiento. Verificar con pruebas: un traspaso a una cuenta archivada la reactiva y su saldo cambia
- [x] 4.4 Exigir `usuario_id` y `cartera_id` en toda lectura y escritura, incluido el saldo. Verificar con pruebas: la lista sale de la sesion, una cuenta ajena da el mismo error que una inexistente, y el saldo de una ajena no se puede leer

## 5. Vista

- [x] 5.1 Crear `src/cuentas/validacion.ts` con el esquema de alta, el de renombre y el de saldo inicial, validando el importe en centimos con `BigInt` y nunca como numero. Verificar con pruebas: rechazo de importe mal formado y de importe fuera de `numeric(16,2)`
- [x] 5.2 Crear `src/cuentas/acciones.ts` con las Server Actions de alta, renombre, orden, tipo, correccion de saldo, archivado y restaurado, con `'use server'`. Verificar que el build no arrastra el servidor al cliente
- [x] 5.3 Crear `src/app/(app)/cartera/[cartera]/page.tsx` y `src/components/cuentas.tsx`. Verificar que compila y que una cartera ajena da `notFound`
- [x] 5.4 Enlazar la lista de carteras con la pagina de cuentas. Verificar que el build lista `/cartera/[cartera]`

## 6. Verificación

- [x] 6.1 Anadir el mapa de trazabilidad de `cuentas` con sus 19 escenarios, partir cada referencia en la primera aparicion de `:` para que los nombres con dos puntos no la rompan. Verificar que el conteo coincide con el spec
- [x] 6.2 Anadir la prueba que vigila que la tabla no tiene columna de saldo. Verificar que falla si se agrega
- [x] 6.3 Verificar que `openspec validate --specs --strict` sigue pasando con 12 capacidades, que `npm run typecheck` no reporta errores, que `npm test` pasa y que `npm run build` completa
