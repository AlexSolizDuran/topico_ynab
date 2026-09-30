# Tasks

10 requisitos, 33 escenarios. El orden sigue las dependencias reales: el esquema antes
que el repositorio, el repositorio antes que la vista, y cada grupo deja las pruebas de
lo que el grupo acaba de escribir. El grupo 11 es el unico de integracion.

## 1. Esquema y migracion

- [x] 1.1 `grupos_transferencia` en `src/db/tablas/cuentas.ts`, con `id`, `descripcion`, `fecha` y `creado_en`, y `transferencia_id` nullable en `movimientos` con FK `on delete cascade`. Verificar que `pg_tables` lista `grupos_transferencia` y que `information_schema` ve la columna nueva
- [x] 1.2 Indice **parcial** sobre `transferencia_id` para los vivos, que es el que usan la cascada y la busqueda de patas. Verificar que `pg_indexes` lo lista con su predicado `eliminado_en is null`
- [x] 1.3 `drizzle/0004_transacciones.sql` con los cuatro pasos en el orden de D5, separador `--> statement-breakpoint` entre cada uno. Verificar que `tests/arnes-pg.test.ts` sigue verde y que el prefijo mantiene la cadena `0000` a `0004`
- [x] 1.4 **Sin columna `periodo` ni `cartera_id` en `movimientos`**, porque las dos se derivan (D1, D2). Verificar con una prueba que recorta la definicion de la tabla y falla si aparece `periodo` o `cartera_id`, como hace la de `disponible` en `sobres`

## 2. Validacion de entrada

- [x] 2.1 `src/transacciones/validacion.ts` con el importe **como texto** y el mismo `superRefine` de `sobres/validacion.ts`, para que un no-numero no llegue a `BigInt` y lance `SyntaxError`. Verificar que rechaza `abc`, `1.234` y un numero de mas de 14 digitos enteros
- [x] 2.2 El importe **admite signo**, porque el repositorio es quien decide si negativo es un gasto o una correccion, y **rechaza el cero** con el mensaje de R1. Verificar que `"0"`, `"0.00"` y `"-0.00"` dan el mismo error
- [x] 2.3 `fecha` con formato `AAAA-MM-DD` y un dia de mes real: `2026-02-31` se rechaza. Verificar que el recorte de espacios y el limite de `descripcion` (255) y `comercio` (120) tambien aplican
- [x] 2.4 Esquemas de alta, edicion, filtro y asignacion de sobre, con `comercio` y `sobre_id` opcionales y `cuenta_id` obligatorio. Verificar con pruebas de `validacion.ts` para los cuatro

## 3. Repositorio: alta y lectura

- [x] 3.1 `src/repos/movimientos.ts` con `registrarMovimiento(db, usuario_id, ...)`, que **no recibe `cartera_id`**: cruza `movimientos -> cuenta_id -> cuentas -> carteras -> usuarios` en el `where` (D2). Verificar que con el id de una cuenta de otro usuario da error y no una fila
- [x] 3.2 El alta guarda el `monto` con el signo que manda el `tipo` y **exige que el sobre, si viene, sea de la misma cartera** que la cuenta. Verificar con las dos pruebas: cuenta ajena, y sobre de otra cartera
- [x] 3.3 Un alta **sin sobre** se acepta y el movimiento queda pendiente, sin asignar. Verificar que el disponible de ningun sobre cambia y que `dinero_suelto` baja por el importe
- [x] 3.4 `comercio` ausente se guarda en `null`, no en cadena vacia. Verificar que la busqueda por texto no lo encuentra como si fuera `""`
- [x] 3.5 `listarMovimientos` con filtros de texto, `cuenta_id`, `sobre_id`, `tipo` y rango de fechas, **combinados con `and`**, y devolviendo `[]` con el filtro activo cuando nada coincide. Verificar con las cinco pruebas del bloque `filtros y busqueda`
- [x] 3.6 El filtro de texto escapa `%` y `_` en SQL con `replace` encadenado y declara el `escape` (D10). Verificar que buscar `100%` no trae todos los movimientos, y que un texto con `_` no hace de comodin
- [x] 3.7 La cartera se deduce en la lectura tambien, y `listarMovimientos` sin filtros devuelve los movimientos de **todas** las carteras del usuario. Verificar con una segunda cartera del mismo usuario

## 4. Asignar y quitar sobre

- [x] 4.1 `asignarSobre` es un `update` de `sobre_id` y **no toca `monto` ni `cuenta_id`** (D4). Verificar que el saldo de la cuenta queda identico antes y despues, que es el escenario `El saldo de la cuenta no cambia`
- [x] 4.2 El disponible del sobre elegido baja por el importe y `dinero_suelto` sube por lo mismo. Verificar con la prueba del escenario `Asignar sobre a un movimiento pendiente`
- [x] 4.3 Rechaza un sobre de **otra cartera** con un error propio, distinto del de "no existe". Verificar con el escenario `Asignar un sobre de otra cartera`
- [x] 4.4 `quitarSobre` es el mismo `update` con `null`, y el importe vuelve al dinero suelto. Verificar con el escenario `Quitar el sobre de un movimiento`
- [x] 4.5 Asignar un sobre a un movimiento de tipo `traspaso` se rechaza: un traspaso no se asigna. Verificar con una prueba propia del repositorio

## 5. Editar

- [x] 5.1 `editarMovimiento` acepta `cuenta_id`, `sobre_id`, `monto`, `fecha`, `descripcion` y `comercio`. Verificar que corregir un gasto de 450 a 380 mueve el saldo de la cuenta y el disponible del sobre sin ningun paso extra
- [x] 5.2 Cambiar la cuenta por otra **de la misma cartera** recalcula los dos saldos y **no altera el disponible del sobre**. Verificar con el escenario `Corregir la cuenta de un movimiento`
- [x] 5.3 Rechaza una cuenta o un sobre de otra cartera, con el mismo error de pertenencia que el alta. Verificar con una prueba por cada lado
- [x] 5.4 Mover la `fecha` a un mes anterior recalcula el disponible de **ambos** periodos. Verificar con el escenario `Corregir la fecha al periodo anterior`, leyendo los dos meses
- [x] 5.5 **Rechaza editar un movimiento con `transferencia_id`**, porque romperia el emparejamiento de las dos patas (D6). Verificar con una prueba que el error lo dice y que el grupo queda intacto
- [x] 5.6 Editar un movimiento ya eliminado se rechaza, y restaurar despues lo deja editable. Verificar el orden de las dos operaciones

## 6. Borrar, restaurar y cascada

- [x] 6.1 `eliminarMovimiento` es **logico**: escribe `eliminado_en` y la fila sigue en la tabla. Verificar con `count(*)` sobre `movimientos` antes y despues, y con el escenario `Borrado logico de un gasto` sobre saldo y disponible
- [x] 6.2 `restaurarMovimiento` limpia `eliminado_en` y el movimiento vuelve a todas las sumas. Verificar con el escenario `Restaurar un movimiento eliminado`
- [x] 6.3 **La cascada es un solo `update`** sobre las filas que comparten `transferencia_id`, no un bucle (D7). Verificar con `pg_stat`-free: contando las filas del grupo antes y despues, todas con `eliminado_en`, y que las de otros grupos no se tocan
- [x] 6.4 Un movimiento sin `transferencia_id` se borra solo a si mismo, y no deja nada mas marcado. Verificar con el mismo criterio del 6.3
- [x] 6.5 Borrar un movimiento de una cuenta **no** reactiva ni desactiva la cuenta. Verificar que la cuenta sigue como estaba, para que la prueba de `cuentas` siga verde

## 7. Devoluciones

- [x] 7.1 Una devolucion es un `ingreso` de importe positivo **con `sobre_id`**, y sube el disponible de ese sobre. Verificar con el escenario `Devolucion de una compra`
- [x] 7.2 Una devolucion a un sobre **archivado** se acumula y el sobre vuelve a aparecer. Verificar con `listarSobresArchivadosConSaldo` y con el escenario `Devolucion a un sobre archivado`
- [x] 7.3 **`dinero_suelto` queda identico** antes y despues, y el par compra + devolucion suma cero contra el estado previo a la compra (D3). Verificar con el escenario `Una devolucion no crea dinero`, afirmando las dos cosas y **sin** afirmar que `patrimonio` sea identico
- [x] 7.4 Una devolucion sin `sobre_id` es un ingreso normal y **no** es una devolucion. Verificar que el disponible de ningun sobre se mueve

## 8. Periodo, fecha y aviso retroactivo

- [x] 8.1 El periodo sale de `date_trunc('month', fecha)` y no de una columna. Verificar que registrar el 20 de junio con fecha del 28 de mayo deja el movimiento en mayo, que es el escenario `Movimiento registrado tarde`
- [x] 8.2 `fecha` guarda el **dia local**: el 31 de marzo a las 23:30 se guarda como `2026-03-31` y pertenece a marzo (D8). Verificar con el escenario `Movimiento de fin de mes`, sin `SET TIME ZONE` en la consulta
- [x] 8.3 Un alta con fecha de mayo estando en junio **no se bloquea** y el disponible de mayo cambia. Verificar con el escenario `Alta retroactiva`, leyendo el disponible de mayo y el de junio
- [x] 8.4 La edicion de un movimiento de mayo mueve los derivados de mayo **y de los posteriores**. Verificar con el escenario `Edicion retroactiva`
- [x] 8.5 El aviso retroactivo se emite en la vista cuando el periodo de la fecha es anterior al actual, y nombra el periodo afectado. Verificar con una prueba que el mensaje aparece en el HTML renderizado

## 9. Entrada y vista

- [x] 9.1 `src/transacciones/acciones.ts` con las Server Actions de alta, edicion, borrado, restauracion, asignar y quitar sobre, **todas con sesion y token de proteccion**, y el `usuario_id` tomado del servidor. Verificar con las pruebas de `acciones.ts` de que una accion sin sesion no hace nada y que el token se exige
- [x] 9.2 Cada error de dominio llega a la pantalla con su mensaje, incluidos los nuevos de cartera ajena, sobre de otra cartera y pata de traspaso. Verificar con una prueba por error
- [x] 9.3 `src/components/transacciones.tsx` con el formulario de alta y edicion, la lista con los filtros, y los botones de borrar, restaurar, asignar y quitar sobre. Verificar que el build no arrastra el servidor al cliente
- [x] 9.4 Los movimientos **pendientes se marcan como "sin asignar"** y ofrecen la accion de asignarles uno. Verificar con el escenario `Movimiento pendiente en la lista`
- [x] 9.5 La seccion de movimientos entra en `cartera/[cartera]/page.tsx`, y los filtros viven en la URL para que la vista sea compartible. Verificar con `tests/transacciones/pagina.test.ts` que la cartera ajena sigue dando `notFound` y que el filtro sobrevive a un recarga
- [x] 9.6 **Corregir el comentario de `src/repos/fragmentos.ts:41-43`**, que describe un traspaso entre carteras que `traspasos` R1 rechaza. Verificar que el comentario dice que se rechaza y que las pruebas de `sobres` y de `cuentas` siguen verdes

## 10. Trazabilidad

- [x] 10.1 `tests/transacciones/escenarios.test.ts` con los **33** escenarios de `openspec/specs/transacciones/spec.md` en una lista y en un mapa, con una prueba que compare ambos contra el spec. Verificar que la cuenta da 33 y que un escenario sin covering hace fallar la prueba
- [x] 10.2 Cada referencia del mapa con **ruta completa** `tests/transacciones/archivo.ts:prueba`, y el escaneo de nombres Ampliado a `tests/transacciones` en el mapa de `grupos`. Verificar que la prueba de "cada referencia apunta a una prueba que existe" resuelve bien
- [x] 10.3 Partir las referencias en la **primera** aparicion de `:`, porque un nombre de prueba puede contener dos puntos. Verificar con un nombre de prueba que los tenga

## 11. Verificacion

- [x] 11.1 `npx tsc --noEmit` sin errores
- [x] 11.2 `npx vitest run` verde, con las suites de `cuentas`, `sobres` y `grupos` sin regresiones
- [x] 11.3 `npm run build` completa
- [x] 11.4 `openspec validate --specs --strict` pasa con las 12 capacidades, y `openspec validate 060-transacciones --strict` da `valid`. Con `skip_specs: true` no hay deltas que revisar
