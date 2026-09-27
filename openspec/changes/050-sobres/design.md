# Design

## Context

`030-cuentas` dejo `cuentas` y `movimientos`; `040-grupos` dejo `grupos` sin ningun
campo de dinero. Este change agrega las dos tablas que falta y, sobre ellas, la primera
aritmetica derivada del proyecto.

Dos restricciones del repo pesan mas que cualquier decision de este documento:

- **El dinero no pasa por JavaScript.** `numeric(16,2)` vuelve de Drizzle como
  `string`, y toda suma vive en SQL. La regla no es una preferencia: la firma de la
  columna rechaza el numero.
- **El aislamiento es por capa de aplicacion, no RLS.** Cada repositorio exige
  `usuario_id` y `cartera_id` en lectura y escritura. No hay red de seguridad en la
  base: un `where` olvidado es una fuga entre usuarios.

Ver `proposal.md` para la motivacion. Este documento cubre el como.

## Goals / Non-Goals

**Goals:**

- Una sola definicion del disponible, usada por la fila, por el total del grupo y por
  el dinero suelto, para que las tres cifras no puedan divergir.
- Que el disponible sobreviva a editar una asignacion y a borrar un movimiento, sin
  ninguna operacion de re.calculo.
- Preservar la invariante `patrimonio = suma(disponibles) + dinero_suelto` sin tocar
  saldos de cuenta al mover dinero entre sobres.
- Que archivar y borrar sean dos operaciones distinguibles, y que el motivo del
  rechazo sea accionable.

**Non-Goals:**

- La tabla `movimientos` y su CRUD. `030` ya la creo y `060-transacciones` la
  completa. Este change solo la **lee**, para el disponible.
- El panel. `110-panel` consume estos numeros.
- Cualquier umbral minimo de importe. Ver Open Questions.

## Decisions

### D1. El disponible se deriva, y la formula vive en un solo archivo

La formula —`sum(asignaciones.monto) + sum(movimientos.monto)` filtrando traspasos y
eliminados— esta en `disponibleDeSobre`, en `src/repos/fragmentos.ts`. La consumen
`listarSobres`, `totalDeGrupo` y `resumenDeCartera`.

**Por que no una columna.** Un disponible guardado hay que actualizarlo en cada alta,
edicion y borrado de movimiento, y en cada correccion de asignacion. Este change
permite las tres cosas, incluida la baja de un movimiento por `eliminado_en`. Cada una
es una occasion de que la columna quede desfasada, y un disponible desfasado se ve
igual de plausible que uno correcto. Hay una prueba que recorta el schema y falla si
aparece la columna.

**Por que no una vista de SQL.** La formula necesita el `periodo` como parametro, y
una vista no lo puede recibir.

**Por que no calcularlo en JS al leer.** Rompe la regla del dinero, y con magnitudes
grandes un `number` pierde centavos.

### D2. Mover entre sobres escribe una asignacion, no dos movimientos

`moverEntreSobres` inserta una asignacion **negativa** en el origen con
`motivo = 'reasignacion'`, y suma al disponible del destino. No toca `movimientos`.

**La alternativa descartada es la obvia**: un gasto en el origen y un ingreso en el
destino, que es como se veria en un banco. Falla por una razon que un test decia
pasar: los movimientos se imputan a una `cuenta_id`, y un par gasto/ingreso se cancela
**a nivel de cartera**. El disponible del sobre queda bien y `patrimonio` no se mueve,
asi que una comprobacion superficial pasa. Pero el saldo de cada cuenta quedaria
falso, y la cuenta es dinero real en un banco real.

El motivo unico tambien sirve de auditoria: una asignacion negativa con
`motivo = 'reasignacion'` se distingue de una asignacion negativa hecha por el
usuario, y el enum lo vuelve explicito en la base.

### D3. `eliminado_en` y `archivado` son dos cosas distintas

- `archivado` es reversible y **exige disponible `0`**. R11: despues acepta
  devoluciones, y vuelve a la vista.
- `eliminado_en` es la baja definitiva, y solo se concede a un sobre sin
  movimientos.

Por que no borrar de verdad: un sobre con una asignacion que lo referencia dejaria una
fila huerfana o reventaria la FK, y el spec exige que el historial se conserve. Por que
no archivar siempre: archivar es reversible, y un sobre recien creado que el usuario
cambio de idea deberia desaparecer, no reaparecer en un listado de archivados. Dos
errores distintos, `SobreConSaldo` y `SobreConMovimientos`, porque el consejo es
distinto: vaciar el sobre, o archivarlo.

### D4. La validacion deja pasar el grupo vacio para que responda el dominio

`SinGrupo` era **codigo muerto**: `crearSobre` tipaba `grupo_id: number`, asi que un
campo de formulario vacio no podia siquiera llegar, y el usuario recibia "no se pudo
identificar el sobre" —un error de forma— en vez de "elige un grupo", que es lo que
dice el requerimiento.

Ahora el parametro es `number | null` y el repositorio lanza `SinGrupo`. El esquema
acepta el vacio a proposito. Si la validacion lo rechazara, el mensaje correcta
pertenece a una capa que no lo tiene.

### D5. El total del grupo excluye archivados, y el panel de desbordes no depende del grupo

`totalDeGrupo` cuenta solo sobres no archivados: el total tiene que ser el de lo que
el usuario ve desplegado. Los archivados en negativo aparecen aparte, y el panel los
lista por `disponible < 0` sobre todos los sobres no eliminados, **no por grupo**.

Eso importa: si el panel partiese de los grupos activos, archivar un grupo esconderia
justo los sobres en rojo que hay que mirar. Hay una prueba que archiva el grupo con el
sobre en negativo y exige que siga en la lista.

### D6. El total se calcula una vez por grupo, en la base

La pagina pide `totalDeGrupo` por grupo activo, en paralelo. Con cuarenta grupos son
cuarenta viajes, y es aceptable: la alternativa —calcular el total sumando disponibles
en JS— esta prohibida por la regla del dinero. Si llega a molestar, el arreglo es una
sola consulta agrupada, no una suma en memoria.

## Defectos que encontraron las pruebas

El diseno inicial no los preveia. Se documentan porque explican por que el codigo
tiene la forma que tiene:

1. `resumenDeCartera` no cruzaba `cartera_id` con `usuario_id`. Con el id de una
   cartera ajena devolvia una fila de ceros en vez de un error: silencioso, y con
   aspecto de cartera vacia.
2. `moverEntreSobres` escribia en un sobre archivado. Usaba el helper privado y se
   saltaba el chequeo que si tiene `asignarASobre`, que es un error de R4 y de R11 a
   la vez.
3. Un sobre archivado en negativo no aparecia en ningun listado: el listado estaba
   partido en dos por `archivado` y ese sobre caia entre los dos. Violacion directa
   de R11.
4. `SinGrupo` nunca se lanzaba. Ver D4.

El patron es comun a los tres primeros: **aislamiento y visibilidad se olvidaron en el
camino feliz**. Salieron al escribir pruebas que usan una segunda cartera y una
segunda usuario, no al leer el codigo.

## Risks / Trade-offs

- **Comentario falso en `src/repos/dinero-suelto.ts:133`** → Dice que un `SQL` de
  Drizzle no se puede interpolar dos veces y que por eso `dinero_suelto` salia con el
  doble. Es falso: los `SQL` son inmutables y reutilizables, y el `-14000.00` que se
  persiguio era una expectativa mal calculada en la prueba. El refactor a funciones se
  quedo porque mejora la legibilidad, pero el comentario le echa la culpa a la
  libreria por un error propio y hay que corregirlo.
- **El disponible se recalcula por fila** → El listado hace una subconsulta por
  sobre. Con decenas de sobres es barato; con cientos, habria que medir. Aceptado en el
  MVP, sin medida que lo respalde.
- **`coalesce(sum(...), 0)` devuelve el entero `0`** → Cuando no hay filas, el total
  vuelve `'0'` y no `'0.00'`. Le falta un cast a `numeric(16,2)`. Hay dos pruebas en
  rojo por esto, y el tipo `Dinero` no distingue los dos casos.
- **Cada consulta debe filtrar `eliminado_en is null`** → Olvidarlo resucita sobres
  borrados. Se mitiga pasando toda lectura por los repositorios, pero el filtro es
  manual en cada `where`.
- **Tapar un desborde no puede ser atomico entre dos sobres** → Mover entre sobres usa
  una transaccion, pero la vista no muestra las dos mitades a la vez. Aceptado: el
  disponible se recalcula y no queda estado parcial visible.

## Migration Plan

- `drizzle/0003_sobres.sql` crea `sobres`, `asignaciones` y el enum
  `motivo_de_asignacion`, en ese orden, y suma `0003` al journal.
- **Aun no corrio en ningun entorno persistente**, asi que el archivo sigue editable.
  En cuanto corra, pasa a inmutable: un cambio de schema posterior es una migracion
  nueva.
- Rollback: `drop table asignaciones; drop table sobres;` mas borrar el enum. No hay
  datos que perder todavia, porque no hay nada escrito fuera de las pruebas.

## Open Questions

- **Importe minimo de una asignacion** (`PREGUNTAS.md` #2). Hoy se acepta cualquier
  importe positivo. Si se define un minimo, es una regla de `validacion.ts` y no
  cambia ningun requerimiento, asi que se puede decidir al escribir `060`.
- **Como se comporta el panel con una cartera archivada** (`PREGUNTAS.md` #4). Este
  change no lo decide: la pagina ya exige cartera no archivada para escribir, y el
  panel es de `110`.
