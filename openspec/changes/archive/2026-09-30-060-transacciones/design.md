# Design

## Context

`movimientos` existe desde `030-cuentas` y se **lee** desde `050-sobres`, pero no hay una
sola forma de escribir en ella. Este change agrega el comportamiento alrededor de esa
tabla que ya tiene todas las columnas que hacen falta: `cuenta_id`, `sobre_id`, `tipo`,
`monto`, `fecha`, `descripcion`, `comercio`, `origen`, `eliminado_en`.

Dos restricciones del repo pesan mas que cualquier decision de este documento:

- **El dinero no pasa por JavaScript.** `numeric(16,2)` vuelve de Drizzle como `string`,
  y toda suma vive en SQL. El `monto` de un movimiento entra y sale como texto.
- **El aislamiento es por capa de aplicacion, no RLS.** No hay red de seguridad en la
  base: un `where` olvidado es una fuga entre usuarios.

Y una tercera, propia de este change: **esta tabla no tiene `periodo` ni `cartera_id`, y
no se le agregan.** Las dos cosas se deducen. Ver D1 y D2.

Ver `proposal.md` para la motivacion. Este documento cubre el como.

## Goals / Non-Goals

**Goals:**

- Que registrar, editar y borrar un movimiento cambien saldo y disponible **sin una sola
  operacion de recalculo**, porque los dos son sumas y no hay nada guardado que
  desfasar.
- Que la cartera de un movimiento sea siempre la de su cuenta, deducida y no declarada.
- Que borrar una pata de un traspaso borre el grupo entero, en una sola instruccion.
- Que los 33 escenarios del spec tengan una prueba con nombre, referenciada desde un
  mapa de trazabilidad.

**Non-Goals:**

- **La pantalla de traspaso.** Ver D5. El tipo `traspaso` se acepta y la cascada se
  garantiza, pero el alta de las dos patas es de `070-traspasos`.
- Editar una pata de un traspaso. Ver D6.
- Un importe minimo. Ver D9.
- `comercio` con autocompletado, y cualquier normalizacion de nombres de comercio.
- Paginacion del historial. Ver R2 de `risks`.

## Decisions

### D1. El periodo se deriva de `fecha`; no hay columna `periodo`

R7 exige que el periodo de un movimiento sea el mes calendario de su fecha, y R8 que un
alta retroactiva recalcule ese periodo y los siguientes. Si `periodo` fuera columna, R8
seria un trabajo real: recalcular la columna de cada fila afectada, y decidir si las
periodos posteriores se tocan aunque no cambien.

`modelo.puml` **no declara `periodo` en `movimientos`** —si lo hiciera en
`asignaciones`, que si lo tiene—, y `disponibleDeSobre` ya filtra con
`m.fecha < finDePeriodo(periodo)`. O sea, el filtro por fecha es el que ya existe y
funciona.

**Por que no columna.** Derivado, R7 se cumple siempre y **R8 no tiene nada que
recalcular**: los derivados se vuelven a leer y dan el numero nuevo. Una columna
`periodo` seria un segundo derivado almacenado, con todo lo que eso implica —la
`asignaciones.periodo` es distinto porque alli el periodo **es parte del dato**, no una
consecuencia de la fecha.

**Consecuencia en la vista.** El aviso de R8 no es un trabajo pendiente sino un mensaje
honesto: "este movimiento cambia mayo y los meses siguientes". No hay job, ni cola, ni
columna que barrer.

### D2. `usuario_id` es la unica entrada; la cartera se deduce por join

R10 es explicito: la cartera se obtiene desde la cuenta asociada y **no** de un dato
declarado en el propio movimiento. `movimientos` no tiene `cartera_id` y no se lo
agrega.

Cada lectura y cada escritura cruza la misma cadena, igual que hace
`pertenenciaDeSobre` en `fragmentos.ts`:

```
movimientos -> cuenta_id -> cuentas -> carteras -> usuarios
```

**Por que no aceptar `cartera_id` como parametro.** Seria un parametro que el
formulario controla y que la base no puede contrastar: un `cartera_id` equivocado
filtraria o escribira en la cartera de otro, y el unico aviso seria un resultado
plausible. Deducirlo hace que el error sea imposible de expresar en la interfaz.

**Consecuencia para las Server Actions.** `cartera_id` sale de la URL y de la sesion, y
se usa para leer el contexto de la pantalla —las cuentas y los sobres del formulario—
pero la escritura pasa `usuario_id` y el `cuenta_id` que el usuario eligio. La prueba de
`050` que hacia caer un `cartera_id` ajeno se repite aca.

### D3. Una devolucion es un `ingreso` positivo con `sobre_id`; no hay tipo nuevo

R4 dice que la devolucion "no modifique el patrimonio ni el dinero suelto". Medido
contra la implementacion, solo la segunda mitad es literally cierta:

| | antes | despues de la devolucion |
|---|---|---|
| `disponible` del sobre | X − 200 | X |
| `patrimonio` = `sum(saldos)` | P | **P + 200** |
| `dinero_suelto` = `sum(saldos) − sum(disponibles)` | S | S |

`dinero_suelto` no se mueve porque las dos sumas suben 200. `patrimonio` si, porque el
dinero vuelve a la cuenta.

**La lectura que se implementa es el efecto neto del par.** Compra mas devolucion suman
cero contra el estado previo a la compra: el usuario no tiene mas plata de la que
tenia. "No es dinero nuevo" significa eso, y significa que **no se cuenta dos veces**.

**Por que no un tipo `devolucion` en el enum.** Para que `patrimonio` no se moviera
habria que excluir la devolucion de `saldoDeCuenta`, y ahi hace falta distinguirla. Eso
significa un valor mas en `tipo_movimiento`, una condicion mas en `fragmentos.ts`, y un
saldo de cuenta que **miente**: el reembolso no se reflejaria en la cuenta que lo recibio.
Un banco real si lo refleja, y la cuenta es dinero real.

**Consecuencia en la prueba.** El escenario "Una devolucion no crea dinero" se cubre
afirmando las dos cosas que si son ciertas: `dinero_suelto` identico antes y despues, y
el par compra + devolucion en cero contra el estado previo a la compra. No se afirma que
`patrimonio` sea identico, porque no lo es.

### D4. Asignar y quitar sobre es un `UPDATE` de una columna

R3 dice que asignar un sobre a un movimiento pendiente "sin alterar el saldo de la
cuenta, que ya habia cambiado cuando se registro el movimiento". Eso sale solo si la
operacion **no toca `monto` ni `cuenta_id`**: es un `update ... set sobre_id = ?` sobre
la fila.

Los dos derivados se mueven porque los dos son sumas que leen la fila: `saldoDeCuenta`
suma por `cuenta_id` y no ve `sobre_id`; `disponibleDeSobre` suma por `sobre_id` y acaba
de cambiar de grupo.

Quitar el sobre es el mismo `update` con `null`. Y el `check` que garantiza que un
traspaso no lleve sobre ya lo hace `fragmentos.ts` al excluir `tipo = 'traspaso'`; el
repositorio lo rechaza antes, con mensaje.

### D5. `grupos_transferencia` y `transferencia_id` en este change; la pantalla, en `070`

`modelo.puml` declara una entidad `grupos_transferencia` con `id`, `descripcion`,
`fecha` y `creado_en`, y `movimientos.transferencia_id` como FK nullable, con la nota
*"Al borrar cualquier pata, se borran todas del grupo"*. **La base no tiene ninguna de
las dos cosas**: `0000` creo `movimientos` sin la columna, y `0001` a `0003` nunca la
agregaron.

R6 lo necesita —"SHALL eliminar tambien todas las patas de un traspaso cuando se borra
cualquiera de ellas"— y R6 es de este change. Asi que el esquema entra aca.

**El formulario no.** `transacciones` R1 dice "SHALL distinguir entre gasto, ingreso y
traspaso": distinguir, no registrar las dos patas. `traspasos` R1 es el que dice "SHALL
registrar el traspaso como un grupo que empareja las dos patas", y `traspasos` es
`070-traspasos`.

**Por que el esquema antes que la pantalla.** Al reves, `070` tendria que agregar una
columna a una tabla ya desplegada, y este repo trata las migraciones aplicadas como
inmutables. Agregarla ahora, con la tabla vacia, es gratis.

### D6. Editar una pata de un traspaso se rechaza en `060`

R5 dice que se puede editar "cualquier dato de un movimiento", y eso incluye una pata.
Pero `traspasos` R1 exige que las dos patas sean "de signo opuesto", y editar el importe
de una sola rompe el emparejamiento: el grupo deja de cuadrar y `patrimonio` deja de
estar intacto.

**Decision: `editarMovimiento` rechaza con un error explicito un movimiento con
`transferencia_id`.** No es una limitacion disfrazada: en `060` no hay forma de crear
un traspaso, asi que ninguna pata existe todavia en la interfaz. `070` —que si la crea—
decide si editar el grupo reescribe las dos patas o sigue rechazando.

La alternativa, editar las dos patas en espejo, se descarta aca porque es comportamiento
de `traspasos`, no de `transacciones`, y hacerlo aqui seria inventar una regla que el
spec no pide.

### D7. La cascada de patas se resuelve con un `UPDATE` sobre el grupo, no en JavaScript

Borrar una pata: un `update` que marca `eliminado_en` en **todas** las filas con el mismo
`transferencia_id`, y el borrado de la propia pata es una caso de ese mismo `update`. Una
sola instruccion, atómica, y sin que las filas intermedias sean visibles.

**Por que no un trigger de base.** El repo aísla por capa de aplicacion, no RLS, y mete
toda la logica en los repositorios. Un trigger seria la unica pieza de negocio fuera de
JavaScript, sin prueba propia y sin poder reutilizar `fragmentos.ts`.

### D8. La zona horaria se usa para presentar y validar; no para convertir

R7 pide determinar el dia del mes "a partir de la zona horaria del usuario".
`usuarios.zona_horaria` existe, con default `America/Mexico_City`, y `fecha` es un
`date` —sin hora ni zona— a proposito.

**Decision: `fecha` guarda el dia calendario local que el usuario escribio.** El
`23:30` del 31 de marzo se guarda como `2026-03-31` porque para el usuario fue ese dia.
La zona horaria se usa para **mostrar** la fecha con su dia correcto y para **validar** un
rango de fechas en el filtro, no para re-derivar el dia desde un instante.

**Por que no `timestamptz`.** Guardar el instante obligaria a convertir en cada lectura
para decidir el mes, y el mes de un movimiento dejaria de ser una propiedad de la fila
para pasar a depender del `SET TIME ZONE` de la sesion. Un `date` con el dia local ya
resuelto hace que `date_trunc('month', fecha)` sea el periodo, siempre.

### D9. No hay importe minimo

`PREGUNTAS.md` #2 sigue abierta, y `050-sobres` la dejo anotada para decidir en este
change. **Se decide que no: cualquier importe distinto de cero se acepta.**

R1 solo exige rechazar el cero. Fijar un minimo seria una regla que ningun requerimiento
pide, y `050` ya acepto asignaciones de cualquier positivo. Si `PREGUNTAS.md` #2 se
resuelve mas adelante, es una validacion en `validacion.ts` y no un cambio de requisito.

### D10. El filtro de texto escapa los comodines de `LIKE`

R9 pide buscar en descripcion y comercio. El texto del usuario se interpola en un
`ilike '%texto%'`, y `%` o `_` que el usuario escriba se interpretarian como comodines:
buscar "100%" traeria todos. El texto se escapa **en SQL** con `replace` encadenado, y
el `escape` se declara en el `like`, para que el escape no dependa de la configuracion
de la sesion.

## Risks / Trade-offs

- **Editar una pata de traspaso se rechaza** → Es una limitacion real hasta que `070`
  defina la regla. Como en `060` no se crean traspasos, no es alcanzable desde la
  interfaz; si aparece, el error lo dice. Ver D6.
- **El historial no pagina** → Con tres años de movimientos la consulta devuelve la
  tabla entera. Mitigacion: el limite por periodo y el indice de
  `movimientos_cuenta_vivo`, que ya existe. Si molesta, el arreglo es un `limit` con
  paginacion, no un cambio de modelo.
- **El filtro de texto no usa indice** → `ilike '%x%'` no lo puede usar, y con muchos
  movimientos sera un recorrido. Aceptado en el MVP: R9 pide el filtro, no la velocidad.
  Si aparece un `tsvector`, es una migracion nueva.
- **La pertenencia se revalida en cada statement, no una vez por peticion** → Con siete
  consultas por pantalla son siete cruces contra `carteras`. Se acepta: la alternativa
  es cachear la pertenencia y que una cartera archivada a mitad de sesion se escape.
- **`grupos_transferencia` queda sin usar por `060`** → Es codigo sin consumidor hasta
  `070`. Se acepta porque la alternativa es una migracion con datos, y este repo trata
  las aplicadas como inmutables. La prueba del grupo exercises la cascata para que no sea
  codigo muerto sin verificar.
- **La edicion cruza carteras** → Cambiar una cuenta por otra de otra cartera se rechaza
  en el mismo `where` que exige la pertenencia, y con un error propio. Ver R5.

## Migration Plan

- `drizzle/0004_transacciones.sql`, en este orden:
  1. `create table grupos_transferencia` con `id`, `descripcion`, `fecha`, `creado_en`.
  2. `alter table movimientos add column transferencia_id integer`, nullable.
  3. La FK a `grupos_transferencia`, con `on delete cascade`.
  4. Un indice parcial sobre `transferencia_id` para los vivos, que es el que usa la
     cascada y la busqueda de patas.
- El orden lo da el **prefijo numerico** del nombre, no el contenido del archivo. No hay
  `drizzle/meta/`: lo aplica `tests/helpers/pg.ts`, que los ordena por nombre.
- **Aun no corrio en ningun entorno persistente**, asi que el archivo sigue editable. En
  cuanto corra pasa a inmutable, y cualquier ajuste posterior es `0005`.
- Rollback: `alter table movimientos drop column transferencia_id; drop table
  grupos_transferencia;`. No hay datos que perder todavia.

## Open Questions

Ninguna que bloquee este change. Las dos que quedan abiertas son de `070` o de
capacidades posteriores, y ninguna cambia el esquema ni el modelo:

- **Editar una pata de traspaso**: reescribir el grupo en espejo, o seguir rechazando. Es
  de `traspasos` R1. Ver D6.
- **Si `PREGUNTAS.md` #2 define un minimo**, es una regla de `validacion.ts` y no cambia
  ningun requisito. Ver D9.
