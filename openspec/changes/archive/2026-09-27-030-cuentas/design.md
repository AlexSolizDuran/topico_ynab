# Design

## Context

Ver **proposal.md — Why**. La restriccion dominante es que `cuentas` tiene seis
requisitos y cuatro de ellos giran alrededor de una decision de almacenamiento: el
saldo no es una columna.

## Goals / Non-Goals

**Goals:**

- 6 requisitos, 19 escenarios.
- Que el saldo sea imposible de desincronizar, no improbable.
- Que `numeric` viaje como `string` de punta a punta, incluida la validacion de
  entrada.

**Non-Goals:**

- Registrar, editar y eliminar movimientos. Es `060-transacciones`. Aca solo existe la
  tabla y la lectura que necesita el saldo.
- La UI de movimientos.
- El `disponible` de un sobre. Es `050-sobres`.

## Decisions

### El saldo no es una columna, y hay una prueba que lo vigila

`saldo = saldo_inicial + coalesce(sum(monto), 0)`, resuelto en Postgres.

Un saldo almacenado se desincroniza en cuanto se borra un movimiento, y repararlo
exige un trigger, un proceso o discipline. Cada uno de los tres falla de una forma
distinta y las tres son silenciosas. Derivado, el saldo no puede quedar viejo: cambiar
el saldo inicial, agregar un movimiento o eliminarlo dan el mismo resultado sin
escribir nada en ningun otro lado.

La garantia no es una convencion sino una prueba: `tests/cuentas/escenarios.test.ts`
recorta la definicion de la tabla y falla si aparece una columna `saldo:`. Agregar el
saldo almacenado rompe la suite, que es exactamente cuando hay que pensarlo.

### El signo vive en `monto`, y el tipo es informativo

`monto = '-450.00'` para un gasto. Asi el mismo `sum` sirve para las dos direcciones
y la consulta del saldo no necesita un `case` por tipo, ni un `abs`, ni distinguir
`gasto` de `ingreso`.

El enum `tipo` sigue existiendo porque el usuario lo elige y la vista lo muestra, pero
no participa en la aritmetica. Escribirlo de la otra forma —guardar `450.00` y restar
segun el tipo— obliga a que toda consulta de saldo sepa restar, y a que un tipo
mal puesto corrompa el saldo en silencio.

### El `left join` va con su condicion en el ON

```sql
left join movimientos m on m.cuenta_id = c.id and m.eliminado_en is null
```

Poner `m.eliminado_en is null` en el `WHERE` convierte el `left join` en `inner`:
una cuenta sin movimientos se queda sin fila, cuando su saldo es justamente el
`saldo_inicial`. Una cuenta recien creada desapareceria de la lista. Es un error
invisible en las cuentas con movimientos y muy evidente en las nuevas.

### `saldo_inicial` se valida en centimos con `BigInt`, no como numero

El campo del formulario llega como texto. Se valida la forma con una expresion
regular y el tope con `BigInt`, en unidades de centimos: `numeric(16,2)` acepta hasta
`99999999999999.99`, y comparar ese string contra un `number` seria la conversion que
todo el proyecto prohibe. `BigInt` no pierde nada porque opera sobre la cadena de
digitos.

### Cambiar el tipo esta prohibido en cuanto hay un movimiento

El tipo decide si la cuenta es dinero o deuda. Los movimientos ya registrados se
interpretaron con el tipo viejo, y como `movimientos` no guarda el tipo con el que se
creo, no habria forma de deshacer la conversion. Ademas el requerimiento lo pide
expresamente.

La excepcion es una cuenta sin movimientos: ahi el cambio es free, y se permite.

### Archivar es una etiqueta, no un cierre

`cuentas` R5 pide que la cuenta **siga aceptando movimientos hasta alcanzar el cero**, y
que un traspaso recibido en una cuenta archivada la reactiva. Por eso archivar solo
escribe `archivada`, y `reactivarCuenta` la saca sola cuando entra un movimiento. Si
archivar fuera un cierre real, la cuenta no podria reactivarse nunca.

La precondicion —saldo cero— se resuelve en SQL con `= 0`, y no comparando strings de
importes en JavaScript. Postgres devuelve `0.00` o `-0.00` segun como normalice, y
comparar en JS es donde aparecen los centavos perdidos.

### Cada lectura del saldo exige `usuario_id` y `cartera_id`

`saldoDeCuenta` recibe `cuenta_id` y podria limitarse a eso, pero no: un saldo derivado
alcanza sin prueba de pertenencia es una pantalla que muestra la plata de otro. La
firma exige los dos ids y el filtro va en la misma consulta, contra la tabla
`carteras`. La auditoria de firmas de `010-auth` lo verifica y ya rechazo una version
anterior que no los pedia.

## Risks / Trade-offs

- **`movimientos` creada antes que `060-transacciones`** → dos capacidades tocan la
  misma tabla. Mitigacion: `060` solo agrega comportamiento, y la definicion de la
  columna es una sola, en `src/db/tablas/cuentas.ts`.
- **N+1 en la pagina de cartera** → una consulta de saldo por cuenta archivada. Se
  acepta a cambio de no meter subconsultas correlacionadas en el `listarCuentas`, que
  es la consulta que corre en cada carga. Con la lista de cuentas de una cartera, son
  unas pocas filas.
- **`saldo_inicial` editable sin limite de veces** → un usuario puede reescribir la
  historia de su cuenta. Es lo que pide el requerimiento, y el efecto es inmediato y
  visible. Lo que no se permite es tocar los movimientos, que son el registro.
