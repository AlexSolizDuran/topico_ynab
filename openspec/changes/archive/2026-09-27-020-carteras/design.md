# Design

## Context

Ver **proposal.md — Why**. La restriccion dominante de este change es negativa: la
mayoria de los 5 requisitos dicen lo que el sistema **no** tiene que hacer. No
combinar carteras, no cambiar la moneda, no mezclar una cuenta de una cartera con
un sobre de otra. Un presupuesto familiar sin esas reglas produce un total que no
existe.

## Goals / Non-Goals

**Goals:**

- 5 requisitos de `carteras`, con la dependencia de archivado declarada.
- Que la moneda sea inmutable desde el momento en que se elige.
- Que exista una sola comparacion de monedas, reutilizada por traspasos y
  recurrencias.

**Non-Goals:**

- Conversion de moneda. Fuera de alcance por decision de dominio.
- Un selector de cartera persistente. Lo resuelve `110-panel`.
- La precondicion de saldo cero al archivar. Va en `050-sobres`.

## Decisions

### La moneda se fija al crear y jamas se cambia

Es lo que pide el spec, y la razon de fondo es que el cambio de moneda no es un
cambio de etiqueta: es una reexpresion de todos los saldos historicos, y el
sistema no tiene tipo de cambio con el que hacerla. Aceptar el cambio y
recalcular dejaria historiales que no cuadran con los saldos que los originaron.

Asi que la columna no tiene un metodo que la modifique, y el error lo explica. No
es validacion: es la ausencia deliberada de una capacidad.

### Una sola comparacion de monedas, en un solo lugar

`exigirMismaMoneda` es la unica funcion que sabe comparar dos carteras por
moneda. `070-traspasos` y `080-recurrencias` la llaman en vez de repetir la
comparacion, porque dos comparaciones de monedas en el codigo divergen tarde, y
cuando divergen el error aparece en un traspaso que si deberia haber pasado.

El mensaje nombra las dos monedas y dice por que no se puede, en vez de un error
generico: el usuario sabe que hacer —abrir la otra cartera— y un "operacion
invalida" no le dice nada.

### La cartera de un movimiento se deduce de la cuenta, no se declara

Un movimiento con `cartera_id` propio podria contradecir el de su cuenta. La
prueba de que no se contradice es que no existe: la cartera no se escribe. Se
deduce de la cuenta y la sobre acepta el mismo valor.

Por eso el helper toma la cuenta y devuelve la cartera, en vez de aceptar ambas y
compararlas. Comparar lo que no puede divergir es trabajo de mas que ademas
devolveria un error incomprensible.

### Un unico idioma en los identificadores de cartera

Las carteras usan `cartera_id` en todas las firmas de repositorio, y `usuario_id`
siempre acompana. Es la convencion que `autenticacion` R7 dejo establecida y que
`datos-neon` exige: sin RLS, la pertenencia se demuestra en la firma.

## Risks / Trade-offs

- **Archivar queda sin el control de saldo hasta `050-sobres`** → una cartera con
  saldos se podria archivar antes de ese change. Mitigacion: la accion de archivar
  rechaza mientras falten las tablas que debe consultar, en vez de archivar a
  ciegas. Es preferible un "todavia no" honesto a un archivado sin control.
- **`cartera_id` propagandose a todas las firmas** → mas parametros en cada
  metodo. Es el costo de no tener RLS, y la prueba de firmas de `010-auth` lo
  hace explicito: sin `usuario_id` el build de pruebas falla.
- **Sin tipo de cambio, un usuario con dos monedas lleva dos carteras** → no
  puede ver su patrimonio total. Es la decision de dominio, no un defecto, y el
  sistema no debe inventar una cifra que no puede calcular.
