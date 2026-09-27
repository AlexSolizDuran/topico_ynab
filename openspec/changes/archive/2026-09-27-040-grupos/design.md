# Design

## Context

Ver **proposal.md — Why**. La restriccion dominante es que un grupo no tiene dinero:
es presentacional, no tiene presupuesto, y su total se deriva.

## Goals / Non-Goals

**Goals:**

- 3 requisitos, 10 escenarios.
- Que la tabla sea tan chica como el dominio permite: seis columnas, ninguna de dinero.
- Que "los grupos no se aniden" sea una propiedad de la base, no una regla de
  formulario.

**Non-Goals:**

- Los sobres que agrupan. Es `050-sobres`.
- El total de un grupo. Sale de los disponibles de sus sobres, y no hay sobres.
- Cualquier forma de anidamiento, de plantillas o de color por grupo.

## Decisions

### Sin columna `total`, y sin columna `grupo_padre`

Las dos ausencias son la misma clase de decision: lo que el requerimiento prohibe se
hace imposible por el esquema en vez de por una validacion.

`total` guardado seria una segunda fuente de verdad. Se desincroniza en cuanto un
sobre se mueve de grupo, se archiva o recibe un movimiento, y ninguno de esos tres
escribe en la tabla de grupos. O sea: la tabla que se desincroniza es justamente la
que nadie esta mirando cuando pasa. Dos pruebas vigilan que las columnas no aparezcan.

`grupo_padre` ausente convierte "no se anidan" en una propiedad del modelo: no hay
forma de anidar ni con SQL directo. Una validacion de formulario, en cambio, se puede
saltar con una consulta, y lo que se prohibe de verdad no puede depender de que todos
los caminos passen por el formulario.

### El anidamiento se rechaza aun asi, y con un mensaje

Sin columna de padre, un `grupo_padre` recibido por el formulario se podria ignorar.
Ignorarlo es peor que rechazarlo: el usuario creeria que organizo su agrupamiento
mientras el sistema tiro lo que mando. Por eso `validarGrupo` rechaza el campo con un
error que explica el motivo.

La validacion va **antes** del esquema, no junto a el. Un `z.object` de Zod 4 descarta
las claves que no declara en vez de rechazarlas, y si el nombre viniera vacio el
mensaje del formulario seria "el nombre no puede estar vacio" en una peticion que en
realidad estaba intentando anidar. Hay una prueba que fija ese orden.

### Archivar no tiene precondicion, y esa es la parte no obvia

`cuentas` solo se archiva en cero, con el saldo resuelto en SQL. Un grupo no tiene
saldo, asi que no hay nada que comprobar: archivar es escribir `archivado = true` y ya
esta. Intentar una precondicion equivalente —"no archivar si algun sobre tiene
disponible"— seria inventar una regla que el requerimiento no pide y que dejaria al
usuario sin poder ordenar su lista.

Lo que el requerimiento si exige es que archivar no toque los sobres, y eso lo
garantiza la ausencia de aritmetica: este repositorio no tiene una sola funcion de
dinero, asi que no puede alterarlos aunque quiera.

### Archivar dos veces se rechaza, restaurar sin archivar tambien

Un grupo ya archivado no es un error de estado: es una peticion redundante. Distinguir
los dos casos cuesta un `and(archivado = false)` en el `where` y da un error que dice
algo. El repositorio de cuentas ya lo hacia asi, y `grupos` sigue el mismo patron.

### Cero filas actualizadas tiene dos causas, y se distinguen

Renombrar a un nombre ya usado y renombrar un grupo de otra cartera terminan los dos
con cero filas, por el mismo `where`. Si eso responde siempre "ese nombre ya existe",
un grupo ajeno recibe un error que **confirma que el id existe**: un leak pequeno de
pertenencia. Por eso, cuando no se actualiza nada, se vuelve a preguntar si el grupo
es de esta cartera: si no lo es, el error es `GrupoNoExiste`; si lo es, el nombre
estaba ocupado. La segunda consulta solo corre en el camino de error.

### El orden se valida en el repositorio, no solo en el formulario

Un `orden` negativo se guardaba sin objeción y terminaba **primero** en la lista, con
un `order by asc`. El formulario lo rechaza, y tambien el repositorio: es el unico
numero que la aplicacion escribe en esta tabla, y un valor invalido tiene que notarse
antes de llegar a la base. Cuesta tres lineas y una prueba.

### Plegar es estado del cliente

Plegar un grupo es como se esta leyendo la lista, no un cambio en los datos. Mandarlo
al servidor haria que cada despliegue del grupo reescribiera lo que el usuario tiene
abierto, y un usuario revisando ocho sobres veria el grupo cerrarse solo. Va con
`useState`, en el componente, y no tiene Server Action.

## Seven scenarios deferred to 050-sobres

Siete de los diez escenarios no se pueden cumplir en este change, y no por falta de
esfuerzo: hablan de sobres.

| Escenario | Por que no aqui |
|---|---|
| Crear un sobre dentro de un grupo | no hay tabla de sobres donde meterlo |
| Crear un sobre sin grupo | no hay sobres que puedan quedar sin grupo |
| Mover un sobre a otro grupo | no hay sobres que mover |
| Total de un grupo | el total es la suma de los disponibles de sus sobres |
| Grupo plegado | plegar oculta sobres, y un grupo vacio no oculta nada |
| Total recalculado | el total se recalcula con los movimientos de sus sobres |
| Efecto de archivar un grupo | el escenario habla de sobres con disponible negativo |

Lo que se hace en vez de fingir cobertura:

- `tests/grupos/escenarios.test.ts` tiene un `DIFERIDOS` con el change que cubre cada
  uno **y el motivo**, y una prueba que exige que cubiertos y diferidos sean
  exactamente los diez escenarios del spec. Ninguno puede desaparecer en silencio.
- `050-sobres` mueve cada uno de `DIFERIDOS` a `MAPA` con su prueba. Si se olvida de
  alguno, la prueba de la union falla porque el escenario aparece en los dos lados, o
  en ninguno.

## Risks / Trade-offs

- **Un change con 7 de 10 escenarios diferidos** → es el mas incompleto de los cuatro.
  Se acepta porque los siete dependen de una tabla que todavia no existe, y porque el
  diferimiento esta escrito y verificado en vez de ser una nota al pie. La alternativa
  —meter `sobres` y `asignaciones` aca— seria hacer `050-sobres` sin su proposal ni su
  revision, que es peor.
- **`archivado` en vez de `archivada`** → sigue a `modelo.puml`, que usa masculino en
  `grupos` y `sobres` y femenino en `carteras` y `cuentas`. Es incoherente en ingles y
  consistente con el modelo, que es lo que manda.
- **Sin `eliminado_en`** → si un grupo se crea por error no se puede borrar, solo
  archivar. Es lo que dice el modelo. Borrar de verdad, con sus sobres, es una operacion
  que este dominio no contempla.
