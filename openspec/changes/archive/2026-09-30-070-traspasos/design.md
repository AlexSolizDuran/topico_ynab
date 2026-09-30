# Design

## Context

`060-transacciones` dejo el esquema de traspasos instalado y sin consumidor:
`grupos_transferencia` existe, `movimientos.transferencia_id` existe con su indice
parcial, y `eliminarMovimiento` ya resuelve la cascada con un solo `update` sobre las
filas que comparten el grupo. Lo que no existe es la escritura: `registrarMovimiento`
lanza `TraspasoNoRegistrable` cuando recibe `tipo = 'traspaso'`, y `editarMovimiento`
lanza `PataDeTraspaso` ante cualquier pata.

Ver `proposal.md` para la motivacion y para las cuatro correcciones de spec que se
aplicaron antes de este change. Este documento cubre el como.

Tres restricciones del repo pesan mas que cualquier decision de aca:

- **El dinero no pasa por JavaScript.** `numeric(16,2)` vuelve como `string` y toda suma
  vive en SQL. La suma de los saldos de las dos patas tiene que dar cero **en la base**.
- **El aislamiento es por capa de aplicacion, no RLS.** Un `where` olvidado es una fuga
  entre usuarios, y aca hay dos filas que escribir en vez de una.
- **Nada recalcula.** El saldo y el disponible son sumas, asi que un traspaso no tiene un
  paso de "actualizar saldos": inserta filas y las sumas se ajustan solas.

Y una cuarta, propia de este change: **la prohibicion entre carteras es total**, asi que
las dos patas son siempre de la misma cartera. El comentario de
`src/db/tablas/cuentas.ts:78-80`, escrito en `060`, afirma que "las dos pueden estar en
carteras distintas -de hecho es el caso normal-". Eso era la lectura provisional de
`PREGUNTAS.md` #1 y **queda desmentido**. Ver D7.

## Goals / Non-Goals

**Goals:**

- Que registrar un traspaso escriba el grupo y sus patas **atomica**, sin ventana en la que
  exista una pata sin su par.
- Que el emparejamiento de signos opuestos lo garantice la sentencia de escritura, no una
  comparacion previa en JavaScript.
- Que la pertenencia se exija en el `where` de la escritura, como en el resto del repo.
- Que editar una pata reescriba el grupo entero en **una** instruccion, sin dejar el
  traspaso descuadrado.
- Que R2 y R3 se cumplan sin tocar la aritmetica derivada.

**Non-Goals:**

- **Un traspaso entre carteras**, ni entre carteras de la misma moneda. Ver D7.
- **Reasignar el `sobre_id` de una pata**: un traspaso no tiene sobre, ni antes ni despues.
- **Editar el par de cuentas**: cada pata conserva su cuenta y se puede corregir la suya,
  pero el grupo no cambia de par de cuentas. Ver D5.
- **Importes minimos**, aplicando la decision de `060` D9.
- **Paginacion del historial** y agrupado de traspasos en la UI mas alla de distinguirlos.

## Decisions

### D1. Un grupo y sus patas se escriben en una transaccion, con una sola sentencia de inserccion

El alta es `db.transaction`, igual que `registrarMovimiento`: dentro se inserta la fila de
`grupos_transferencia` con `returning id`, y con ese id se insertan las patas. Las dos
patas salen de **un solo `insert ... select ... from (values ...) ... where exists(...)`**,
no de dos `insert`.

**Por que una sola sentencia para las dos patas.** Es la forma de que el emparejamiento
no dependa de que el codigo siga las dos llamadas: si las dos filas salen de la misma
sentencia con la misma regla de signo, no hay forma de que una se inserte y la otra no.
Aparte, evita el caso de una pata insertada y la otra no por un error intermedio.

**Por que el grupo y las patas no pueden ser la misma sentencia.** La FK
`movimientos.transferencia_id` apunta al `id` del grupo, y ese id lo genera la base
(`generatedAlwaysAsIdentity`). Habria que resolverlo con un `cte` encadenado. Se descarta
por legible: la transaccion ya da atomicidad, y el `id` del grupo se lee una vez.

**La transaccion no es opcional para la pata unica.** Una pata sola es un estado valido
—R1 lo permite— pero no por el hecho de que la segunda sentencia falle. Si el
`insert` de las patas no deja filas, la transaccion se revierte entera.

### D2. El signo lo decide el lado del formulario, no el tipo

Las dos patas tienen `tipo = 'traspaso'`, asi que `montoConSigno` —que mapea
`gasto -> -abs` y cualquier otra cosa a `+abs`— **no sirve**: las dos saldrian positivas.
La pata de origen se inserta con `-abs(importe)` y la de destino con `+abs(importe)`, y
el `abs` se aplica en SQL como en el alta de `060`.

**Por que no un campo `es_origen` o dos tipos.** Un valor mas en `tipo_movimiento` obliga a
tocarlo en `disponibleDeSobre` y en cada `case` de tipo que exista. El lado del formulario
ya es un hecho conocido: es la cuenta de la que sale el dinero.

**Consecuencia sobre `registrarMovimiento`.** No se puede reusar tal cual, y no solo por el
signo: ademas lanza `TraspasoNoRegistrable` a proposito. Se extrae el `insert` crudo a un
helper interno compartido por las dos patas y por el alta simple, para que el `where
exists` de pertenencia, el `periodoSql` y el `comercioNormalizado` no se dupliquen. El
guard de `TraspasoNoRegistrable` **se queda**: el alta simple sigue sin poder registrar un
traspaso, porque un traspaso sin par es exactamente lo que ese error evita.

### D3. La pertenencia y la igualdad de cartera van en el `where`, y el error se diagnostica despues

El `where exists` de la sentencia de patas exige que **las dos** cuentas pertenezcan a la
misma cartera de este usuario, con la forma que ya usa `registrarMovimiento`:
`cuentas c join carteras t on t.id = c.cartera_id where t.usuario_id = ... and
c.eliminado_en is null`.

**Por que la igualdad de cartera va en el `where` y no antes.** Es la misma razon por la que
`060` no comprueba y despues inserta: entre la comprobacion y la escritura hay una ventana.
Con dos cuentas la ventana es el doble de ancha.

**Como se distingue "no existe" de "son de carteras distintas".** Si la sentencia no deja
filas, R1 y R3 exigen **mensajes distintos**: "esa cuenta no es tuya" no es lo mismo que
"un traspaso entre carteras distintas". Se hace una lectura de diagnostico despues del
`insert` fallido, dentro de la misma transaccion, que devuelve el `cartera_id` de cada
cuenta. Si las dos existen y son distintas, es el error de carteras; si alguna falta o es
ajena, es el de cuenta. La escritura quedo igual de segura: el diagnostico solo elige el
mensaje, nunca decide si se escribe.

### D4. La reactivacion de la cuenta de destino es parte del alta, no una accion aparte

R1 exige que un traspaso recibido en una cuenta archivada la reactive. `reactivarCuenta` ya
existe desde `030-cuentas` y ya tiene el `where` correcto
(`... and archivada = true`), asi que es idempotente: si la cuenta no estaba archivada no
toca nada.

**Por que dentro de la transaccion.** Si el alta se confirmara y la reactivacion fallara, la
cuenta quedaria archivada recibiendo dinero, que es el estado que `cuentas` R5 prohibe.

**Verificado antes de escribir esto:** `obtenerCuenta` no filtra por `archivada` —solo lo
filtran las funciones de lista—, asi que una cuenta archivada se puede obtener y
reactivar. Por eso `reactivarCuenta` no tira `CuentaArchivada`.

### D5. Editar una pata reescribe el grupo con un `update` y `case`, y las cuentas no se emparejan

`editarMovimiento` deja de rechazar la pata. Cuando `transferencia_id` no es `null`, un
**unico `update`** sobre las filas del grupo asigna a cada pata un valor distinto con
`case when id = <la pata editada> then <nuevo> else <opuesto> end`. Sin bucle, por el mismo
motivo que la cascada de D7 en `060`: entre sentencia y sentencia el grupo queda a medio
caminar.

**Que campos se reflejan y cuales no.**

| campo | pata editada | pata opuesta |
|---|---|---|
| `monto` | el nuevo con su signo | el mismo `abs` con el signo opuesto |
| `fecha` | la nueva | la misma |
| `descripcion` | la nueva | la misma |
| `comercio` | el nuevo | el mismo |
| `cuenta_id` | el nuevo, validado en la cartera | **no se toca** |
| `sobre_id` | prohibido | prohibido |

`monto`, `fecha` y `descripcion` se reflejan porque R1 define el par como un grupo que
comparte importe, fecha y descripcion: si divergieran, el grupo dejaria de ser un traspaso
y `fecha` en dos periodos distintos haria que la suma por periodo no cerrara.
`comercio` se refleja por coherencia, y no cuesta nada. El `periodo` sale de `fecha`, asi
que mover la fecha mueve las dos patas al mismo periodo y el disponible del sobre no se
toca en ninguno de los dos casos.

`cuenta_id` **no** se refleja porque cada pata *es* su cuenta: mover la pata de origen de
la cuenta X a la Y sigue siendo un traspaso valido —Y paga al mismo destino—, y forzar
que la pata opuesta lo siguiera convertiria una correccion de cuenta en un traspaso entre
pares de cuentas, que es otra operacion. Se valida contra la cartera, con el mismo error de
pertenencia del alta.

**Por que no se edita el `grupos_transferencia`.** Su `descripcion` y su `fecha` son la
copia del grupo. El `update` de las patas y el de la fila del grupo van en la misma
transaccion, y en el mismo `insert` inicial se escriben desde el mismo valor, de modo que
no pueden divergir.

**Una pata sola sigue siendo editable.** El `case` con una sola fila no tiene rama `else`
que ejecutar, y el grupo no se descuadra porque no hay nada que emparejar. El aviso de
pata unica se mantiene, porque R1 lo exige en cada operacion que la deja sola.

### D6. El aviso de pata unica y el aviso de deuda salen de lecturas, no de cuentas

R1 exige avisar cuando el traspaso no tiene contraparte, y el aviso tiene que **nombrar el
efecto** sobre el dinero suelto y el patrimonio, porque R3 acotado dice que ahi si se
mueven. R4 exige informar cuando un traspaso reduce la deuda de una cuenta de credito.

Las dos cosas son lecturas, no calculos:

- El aviso de pata unica sale de la **forma** del grupo —si el `insert` dejo una pata— y es
  un mensaje fijo. No hace falta calcular el dinero suelto para decir que se mueve por el
  importe: el importe ya es el dato, y la magnitud la da el `abs` de la pata.
- El aviso de deuda se decide comparando el `saldoDeCuenta` de la cuenta de destino antes
  y despues del `insert`, con el mismo fragmento que usa el resto del repo. Si el saldo
  subio, la deuda bajo, y el mensaje nombra cuanto. Es la unica lectura extra del alta, y
  ocurre **dentro** de la transaccion para que compare el mismo instante.

**Por que no se avisa de todo.** Avisar tambien cuando el patrimonio no se mueve seria
informacion que R3 ya da por descontada, y el requisito no lo pide.

### D7. La prohibicion entre carteras es total, y el comentario de `cuentas.ts` queda desmentido

R1, `carteras` R4 y `transacciones` R3 y R5 rechazan el traspaso entre carteras. Con la
confirmacion de `PREGUNTAS.md` #1 la prohibicion no tiene la excepcion de la misma moneda:
las dos patas son **siempre** de la misma cartera, y por eso la comprobacion de D3 es de
igualdad y no de pertenencia suelta.

**Consecuencia que hay que corregir.** El comentario de `gruposTransferencia` en
`src/db/tablas/cuentas.ts:78-80` dice que "las dos pueden estar en carteras distintas -de
hecho es el caso normal-" y justifica por eso que la tabla no tenga `cartera_id`. La
justificacion del `cartera_id` sigue en pie —la columna seria una de las dos, no la del
traspaso—, pero la afirmacion de que un traspaso cruza carteras es **falsa** y hay que
quitarla. Es la clase de comentario que induce a error justo al leer `070`, y `060` ya
corrigio el equivalente de `fragmentos.ts:41-43` por lo mismo (tarea 9.6).

### D8. R2 y R3 no requieren tocar la aritmetica derivada

`saldoDeCuenta` ya suma los traspasos —el par da cero sobre la suma— y `disponibleDeSobre`
ya los excluye con `m.tipo <> 'traspaso'`. La neutralidad de R3 y la exclusion de R2 **ya
estan implementadas** desde `050` y `060`.

Esto tambien explica por que la correccion de R4 no toco la formula: hacer que el pago de
una tarjeta bajara el dinero suelto habria exigido romper una de esas dos piezas, y con ella
la invariante que `comprobarInvariante` verifica.

`comprobarInvariante` sigue valiendo para el traspaso de una pata: es una identidad
algebraica, no un estado que se pueda violar.

## Risks / Trade-offs

- **El `insert` de dos patas es la sentencia mas compleja del repo** → Mitigacion: el
  `where exists` de pertenencia se extrae al mismo helper que usa el alta de `060`, y las
  pruebas cubren cuenta ajena, cartera ajena y cuenta inexistente por separado, que son
  las tres formas de que no salga fila.
- **El diagnostico posterior al `insert` fallido es una segunda sentencia** → Aceptado: no
  decide si se escribe, solo cual es el mensaje. La seguridad del `where` no depende de
  el.
- **Editar una pata reescribe la otra sin avisar en la fila** → Mitigacion: la UI lo dice
  antes de guardar, y la prueba del escenario verifica que las dos filas quedan con
  importes de signo opuesto y la misma fecha.
- **Reactivar la cuenta de destino es un efecto lateral de registrar** → Es lo que R1 pide.
  La prueba verifica que una cuenta **no** archivada no se toca, que es el mismo criterio
  que uso `060` en 6.5.
- **La prohibicion entre carteras se implementa una sola vez, en D3** → Si mañana se
  permitiera entre carteras de la misma moneda, el cambio no es borrar la comprobacion:
  es SACAR la igualdad del `where exists` y agregar el emparejamiento entre carteras que el
  modelo no soporta. Por eso el mensaje de error es propio y no reutilizado.
- **Un traspaso de una pata deja el grupo descuadrado a proposito** → Es lo que R1 permite
  y lo que el aviso nombra. El riesgo real es que se confunda con un bug: por eso la
  prueba del escenario afirma el cambio de `dinero_suelto` y `patrimonio` **por el
  importe**, que es lo unico que lo distingue de un fallo.

## Migration Plan

- **Ninguna.** `grupos_transferencia`, `movimientos.transferencia_id` y su indice parcial
  ya estan en `drizzle/0004_transacciones.sql` desde `060`. Este change no toca
  `drizzle/`.
- `grupos_transferencia` deja de ser codigo sin consumidor: es el punto de entrada de
  `registrarTraspaso`.
- **Rollback**: no aplica. No hay migracion que revertir; se saca el formulario y el
  repositorio, y las filas de `grupos_transferencia` que ya existan se quedan como
  historia, que es justo lo que permite la cascada de `060`.

## Open Questions

Ninguna que bloquee. Las dos que se habían abierto para `070` estan resueltas y
registradas: la edicion de una pata en `proposal.md` y en D5, y la prohibicion entre
carteras en D7 y en `PREGUNTAS.md` #1.

La que queda, y **no** es de este change: `PREGUNTAS.md` #2, el importe minimo de un
traspaso. `060` D9 decidio que no hay minimo y `070` lo aplica, asi que la pregunta solo
estan abierta si mas adelante se quiere un minimo pequeno. Si se define, es una validacion
en `validacion.ts` y no cambia ningun requisito.
