# Tasks

4 requisitos, 15 escenarios. El orden sigue las dependencias reales: primero la escritura
del grupo y sus patas, despues las reglas que las acotan, despues la edicion, y al
final la entrada y la trazabilidad. Cada grupo deja las pruebas de lo que el grupo acaba
de escribir; el grupo 7 es el unico de integracion.

## 1. Alta del grupo y sus patas

- [x] 1.1 `src/repos/traspasos.ts` con `registrarTraspaso(db, usuario_id, ...)`, que **no recibe `cartera_id`**: cruza `cuentas -> carteras -> usuarios` en el `where` de la escritura, igual que `060` hizo con `movimientos -> cuenta_id -> cuentas -> carteras -> usuarios` (D2, D3). Verificar con una prueba de que con el id de una cuenta de otro usuario no se escribe ni el grupo ni las patas
- [x] 1.2 El alta inserta la fila de `grupos_transferencia` con `returning id` **dentro de `db.transaction`**, y con ese id inserta las patas. Verificar que un fallo de la segunda sentencia deja el grupo sin crear, leyendo `grupos_transferencia` con `count(*)` (D1)
- [x] 1.3 **Las dos patas salen de un solo `insert ... select ... from (values ...)`**, no de dos `insert` (D1). Verificar con el escenario `Traspaso entre dos cuentas`: dos filas, mismo `transferencia_id`, `-5000.00` en el origen y `5000.00` en el destino
- [x] 1.4 El signo lo decide **el lado del formulario**, no el tipo, porque las dos patas son `tipo = 'traspaso'` y `montoConSigno` las saldria positivas (D2). Verificar con `abs` en SQL y con una prueba de que el importe se guarda normalizado ante un `monto` negativo en el formulario
- [x] 1.5 Extraer el `insert` crudo a un helper interno compartido con `registrarMovimiento`, para no duplicar el `where exists` de pertenencia, el `periodoSql` ni `comercioNormalizado`, y **dejar el guard `TraspasoNoRegistrable` en el alta simple** (D2). Verificar que `registrarMovimiento` con `tipo = 'traspaso'` sigue rechazando, y que las pruebas de `060-transacciones` siguen verdes
- [x] 1.6 `descripcion` y `fecha` del grupo y de las patas se escriben **desde el mismo valor en la misma sentencia**, para que no puedan divergir (D5). Verificar con una prueba que lee `grupos_transferencia` y las dos patas y compara `fecha` y `descripcion`
- [x] 1.7 Sin importe minimo, aplicando la decision de `060` D9: cualquier importe distinto de cero se acepta. Verificar que `validacion.ts` rechaza `"0"` con el mensaje de R1 y no impone otra cota

## 2. Carteras, prohibicion y cuenta archivada

- [x] 2.1 El `where exists` de la escritura exige que **las dos cuentas sean de la misma cartera** de este usuario (D3, D7). Verificar con el escenario `Traspaso entre cuentas de carteras distintas`: con dos carteras del mismo usuario, no se escribe nada
- [x] 2.2 El error de carteras distintas es **propio y distinto** del de "no existe o no es tuya", porque R1 y `transacciones` R3 los distinguen. Verificar con una prueba por cada mensaje, y con la lectura de diagnostico que elige uno u otro cuando el `insert` no deja filas (D3)
- [x] 2.3 La prohibicion es **total**: no hay excepcion para dos carteras de la misma moneda. Verificar con una prueba que dos carteras de la misma moneda tambien se rechazan, que es la decision de `PREGUNTAS.md` #1
- [x] 2.4 Un traspaso recibido en una cuenta **archivada** la reactiva, llamando a `reactivarCuenta` de `030-cuentas` **dentro de la transaccion** (D4). Verificar con el escenario `Traspaso a una cuenta archivada`, y con `information_schema` o la columna leida, que `archivada` quedo en `false`
- [x] 2.5 Una cuenta que **no** estaba archivada no se toca, porque `reactivarCuenta` es idempotente. Verificar con el mismo criterio que uso `060` en 6.5, para que las pruebas de `cuentas` sigan verdes
- [x] 2.6 **Corregir el comentario de `src/db/tablas/cuentas.ts:78-80`**, que afirma que las dos patas "pueden estar en carteras distintas -de hecho es el caso normal-" (D7). Verificar que el comentario dice que la prohibicion es total y que las pruebas de `sobres` y de `cuentas` siguen verdes

## 3. El traspaso no toca sobres ni dinero suelto

- [x] 3.1 Un traspaso no cambia el disponible de **ningun** sobre, y no por una resta sino porque `disponibleDeSobre` ya excluye `m.tipo <> 'traspaso'` (D8). Verificar con el escenario `Un traspaso no toca los sobres`, leyendo el disponible de todos los sobres antes y despues
- [x] 3.2 Un traspaso **no acepta sobre** en ninguna pata: se rechaza con el mensaje de que un traspaso no se asigna. Verificar con el escenario `No se puede asignar un sobre a un traspaso`, y con `asignarSobre` de `060` que sigue rechazando
- [x] 3.3 `dinero_suelto` y `patrimonio` quedan **identicos** con un traspaso de dos patas (D8). Verificar con los escenarios `El dinero suelto no cambia` y `El patrimonio no cambia`, con `resumenDeCartera` y con `comprobarInvariante`
- [x] 3.4 Una **pata sola si mueve** `dinero_suelto` y `patrimonio` por el importe, que es lo que R3 acotado exige (D8). Verificar con el escenario `Una pata sola si mueve el dinero suelto`, y **sin** afirmar que la invariante se rompa: `comprobarInvariante` tiene que seguir pasando (D8)
- [x] 3.5 Pagar la deuda de una tarjeta es un traspaso mas y **no mueve el dinero suelto**, que es la correccion de R4. Verificar con el escenario `Pago de tarjeta sin sobre`: la deuda queda saldada y `dinero_suelto` es identico antes y despues
- [x] 3.6 El pago parcial de tarjeta deja la deuda en 300. Verificar con el escenario `Pago parcial de tarjeta`, leyendo `saldoDeCuenta` de la cuenta de credito
- [x] 3.7 Un gasto con tarjeta sigue siendo un gasto contra un sobre, y el importe queda disponible para tapar el desborde. Verificar con el escenario `Usuario que paga con tarjeta`, sin cambiar nada del alta de `060`

## 4. Avisos

- [x] 4.1 Registrar un traspaso de una sola pata **avisa de que no tiene contraparte y de que mueve el dinero suelto y el patrimonio por el importe completo**, que es lo que R1 exige tras la correccion (D6). Verificar con el escenario `Traspaso con una sola pata`, y que el mensaje menciona el importe
- [x] 4.2 El aviso de pata unica sale de la **forma** del grupo, sin calcular el dinero suelto (D6). Verificar que el mensaje aparece con una pata y **no** aparece con dos
- [x] 4.3 Un traspaso que reduce la deuda de una cuenta de credito **informa cuanto se saldo**, comparando `saldoDeCuenta` de la cuenta de destino antes y despues del `insert`, dentro de la transaccion (D6). Verificar con una prueba que el mensaje nombra la magnitud, y que no aparece cuando la deuda no baja
- [x] 4.4 Editar una pata de un traspaso de una sola pata **mantiene el aviso**, porque R1 lo exige en cada operacion que la deja sola (D5). Verificar con una prueba de la edicion

## 5. Edicion en espejo

- [x] 5.1 `editarMovimiento` **deja de rechazar** la pata: cuando `transferencia_id` no es `null`, un **unico `update`** con `case when id = <pata editada>` reescribe el grupo entero, sin bucle (D5). Verificar con una prueba que las dos filas quedan con importes de signo opuesto y la misma `fecha`
- [x] 5.2 `monto`, `fecha`, `descripcion` y `comercio` **se reflejan** en la pata opuesta, con el signo dado la vuelta. Verificar con una prueba por campo, y que la fecha de las dos patas cae en el mismo periodo
- [x] 5.3 `cuenta_id` **no se refleja**: cada pata conserva su cuenta, y mover la de origen sigue siendo un traspaso valido (D5). Verificar con una prueba de que la pata opuesta no cambio de cuenta, y que el saldo de las dos cuentas nuevas cuadra
- [x] 5.4 Cambiar la cuenta de una pata a una de **otra cartera** se rechaza con el mismo error de pertenencia del alta (D5). Verificar con una prueba del lado de la cuenta y, si aplica, del lado del sobre
- [x] 5.5 `grupos_transferencia.descripcion` y `fecha` se actualizan **en la misma transaccion** que las patas, para que no divergan (D5). Verificar con una prueba que compara el grupo contra las patas tras editar
- [x] 5.6 Editar una pata **no puede asignarle un sobre**, porque un traspaso no tiene. Verificar con una prueba que el `sobre_id` se rechaza en una pata
- [x] 5.7 La cascada de `060` sigue valiendo: borrar una pata borra el grupo, y `restaurarMovimiento` conserva la regla de no dejar un par a medias. Verificar con las pruebas de cascada de `060-transacciones` sin regresiones, y con una de `traspasos` que recorra el ciclo alta, edicion, borrado y restauracion

## 6. Entrada, vista y trazabilidad

- [x] 6.1 `src/traspasos/validacion.ts` con el importe **como texto** y el mismo `superRefine` de `transacciones/validacion.ts`, para que un no-numero no llegue a `BigInt`. Verificar que rechaza `abc`, `1.234` y un numero de mas de 14 digitos enteros
- [x] 6.2 El formulario de traspaso exige **cuenta de origen y de destino distintas**, con mensaje propio, porque un traspaso a si mismo no empareja nada. Verificar con una prueba de validacion
- [x] 6.3 `src/traspasos/acciones.ts` con las Server Actions de alta y edicion, **todas con sesion y token de proteccion**, y el `usuario_id` tomado del servidor. Verificar con las pruebas de que una accion sin sesion no hace nada y que el token se exige
- [x] 6.4 Cada error de dominio llega a la pantalla con su mensaje, incluidos los nuevos de carteras distintas, cuenta archivada y pata unica. Verificar con una prueba por error
- [x] 6.5 `src/components/traspasos.tsx` con el formulario de alta y edicion, y la distincion de los traspasos en el historial. Verificar con el escenario `Traspaso distinguible en el historial` y con el escenario `Contabilidad del gasto original`, y que el build no arrastra el servidor al cliente
- [x] 6.6 La UI **avisa antes de guardar** que editar una pata reescribe la opuesta, porque el efecto sorprende (D5). Verificar con una prueba que el aviso esta en el HTML renderizado
- [x] 6.7 El alta simple de `transacciones` **deja de ofrecer el tipo `traspaso`**, que ya no puede aceptarlo, y la seccion entra en `cartera/[cartera]/page.tsx`. Verificar que la cartera ajena sigue dando `notFound` y que el filtro de movimientos sobrevive a un recarga
- [x] 6.8 `tests/traspasos/escenarios.test.ts` con los **15** escenarios de `openspec/specs/traspasos/spec.md` en una lista y en un mapa, con una prueba que compare ambos contra el spec. Verificar que la cuenta da 15 y que un escenario sin covering hace fallar la prueba
- [x] 6.9 Cada referencia del mapa con **ruta completa** `tests/traspasos/archivo.ts:prueba`, partido en la **primera** aparicion de `:`, como en `060` 10.3, y el escaneo de nombres ampliado a `tests/traspasos` en el mapa de `grupos`. Verificar con la prueba de "cada referencia apunta a una prueba que existe"

## 7. Verificacion

- [x] 7.1 `npx tsc --noEmit` sin errores
- [x] 7.2 `npx vitest run` verde, con las suites de `cuentas`, `sobres`, `grupos` y `transacciones` sin regresiones
- [x] 7.3 `npm run build` completa
- [x] 7.4 `openspec validate --specs --strict` pasa con las 12 capacidades, y `openspec validate 070-traspasos --strict` da `valid`. Con `skip_specs: true` no hay deltas que revisar
