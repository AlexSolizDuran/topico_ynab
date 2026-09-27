opencode -s ses_f21a09d30ffeo63KfDh05t4LmT

# Contexto del proyecto — finanzas personales (MVP)

Este archivo conserva todo el razonamiento, decisiones y ejemplos que surjan al
diseñar el MVP. **Léelo antes de retomar el trabajo.** No reemplaza a
`openspec/specs/`: guarda el *por qué* detrás de cada decisión.

Última actualización: 2026-09-26.

---

## 1. Qué es este proyecto

App de finanzas personales con **presupuesto por sobres** (estilo YNAB). Cada
peso recibe un destino explícito antes de gastarse. Los sobres son del usuario y
de su propiedad exclusiva.

El MVP **no tiene código todavía**. Solo existe la especificación.

---

## 2. Estado actual del repositorio

```
mvp/
├── CONTEXTO.md          ← este archivo
├── PREGUNTAS.md         ← preguntas aún abiertas
├── PROMPTS-DISENO.md    ← 17 vistas para Google Stitch, en 3 tandas
├── modelo.puml          ← diagrama de entidades + derivados
└── openspec/
    ├── config.yaml
    └── specs/
        ├── autenticacion/   7 requisitos
        ├── carteras/        5 requisitos
        ├── comparativos/    4 requisitos
        ├── cuentas/         6 requisitos
        ├── grupos/          3 requisitos
        ├── metas/           6 requisitos
        ├── panel/          13 requisitos
        ├── patrimonio/      4 requisitos
        ├── recurrencias/    5 requisitos
        ├── sobres/         11 requisitos
        ├── transacciones/  10 requisitos
        └── traspasos/       4 requisitos
```

**Total: 78 requisitos y 257 escenarios en 12 capacidades.**

### Lo que se hizo

| Acción | Detalle |
|---|---|
| Se eliminó `specs/dashboards/` y `specs/movimientos/` | Describían capa de vista sin capa de escritura. Sus capacidades se reescribieron como `panel` y `transacciones`. |
| Se renombró `specs/user-auth/` → `specs/autenticacion/` | Consistencia de idioma con las capacidades. |
| Se escribieron 11 capacidades nuevas | `carteras`, `grupos`, `sobres`, `cuentas`, `transacciones`, `traspasos`, `recurrencias`, `metas`, `panel`, `patrimonio`, `comparativos`. |
| Se reescribió `autenticacion` | Se eliminaron las referencias a bcrypt, `password_verify`, `HttpOnly`, `SameSite=Lax` y HTTP 401. Ahora describe comportamiento observable. |
| Se reescribió `modelo.puml` | 10 entidades, una sola moneda por cartera, y se corrigieron el título duplicado, `eliminar_en` → `eliminado_en` y la relación rota `usuarios \|\|--o{ asignaciones`. |

### Por qué se eliminaron los dos specs originales

Describían una **capa de vista sin capa de escritura**. Detallaban qué mostrar,
pero ningún requisito decía cómo nace una cuenta, un movimiento o un sobre.
Implementarlos al pie de la letra produce una app donde se puede crear una cuenta
y ver un panel siempre en cero.

### Cómo se escriben los specs

Directamente en `openspec/specs/`. **No existe `openspec/changes/`** y no se usa
un ciclo de cambio: el usuario decidió escribir y revisar las capacidades en su
lugar, en el orden de la columna de número.

---

## 3. Conceptos de OpenSpec

| Concepto | Qué es |
|---|---|
| **OpenSpec** | Metodología donde la especificación es el artefacto primario y el código se deriva de ella. |
| **Capacidad** | Unidad de organización: una carpeta en `specs/`. Agrupa comportamiento del sistema. |
| **Spec** | `spec.md` dentro de la carpeta. Describe el **estado actual**. |
| **Requisito** | `### Requirement:` + párrafo con SHALL. Una obligación. |
| **Escenario** | `#### Scenario:` + viñetas WHEN/THEN. La unidad verificable: un test por escenario. |
| **Delta** | Solo lo que un cambio agrega, modifica o quita. **No se usa aquí.** |
| **Change** | Carpeta en `changes/` con `proposal.md`, `design.md`, `tasks.md`. **No se usa aquí.** |

### `specs/` vs `changes/`

```
openspec/
└── specs/   → lo que el sistema ES
```

OpenSpec permite dos flujos. Este proyecto usa el segundo:

1. **Con ciclo de cambio** — se escribe un change en `openspec/changes/` con los
   deltas, y al archivarlos los deltas se fusionan en `specs/`. Es el flujo
   estándar, útil cuando el cambio es grande ohay varios autores.
2. **Edición directa** — se edita `specs/<capacidad>/spec.md` en su lugar.

**Aquí se usa edición directa**, por decisión del usuario. `openspec/changes/`
no existe. La razón práctica: el alcance completo se decidió por adelantado y
cada capacidad se escribió y revisó en un solo pase, así que un change
intermedio solo habría agregado una capa de traducción.

La consecuencia es que **no hay validación automática de deltas**: si añades un
requisito, tienes que actualizar tú mismo el conteo de la sección 2.

### Estructura actual

```
openspec/
├── config.yaml
└── specs/                       ← ESTADO VIGENTE, 12 capacidades
    ├── autenticacion/   7 requisitos   reescrito, neutral de stack
    ├── carteras/        5 requisitos   nueva, isolation por moneda
    ├── comparativos/    4 requisitos   nueva
    ├── cuentas/         6 requisitos   nueva
    ├── grupos/          3 requisitos   nueva
    ├── metas/           6 requisitos   nueva
    ├── panel/          13 requisitos   nueva, solo lectura
    ├── patrimonio/      4 requisitos   nueva
    ├── recurrencias/    5 requisitos   nueva
    ├── sobres/         11 requisitos   nueva, el núcleo
    ├── transacciones/  10 requisitos   nueva
    └── traspasos/       4 requisitos   nueva
```

### Capacidad ≠ módulo de código

Una capacidad **no** es una pantalla, un módulo, una tabla ni una capa. Es un
conjunto de comportamientos agrupados por afinidad.

Dos pruebas para validar un nombre:

1. Si mañana cambias de framework, ¿esta carpeta sigue teniendo sentido?
2. ¿Puedes escribir todos sus escenarios sin mencionar pantalla, archivo o lenguaje?

`dashboards` fallaba ambas: era el nombre de una pantalla. De ahí el renombre
conceptual a capacidades por comportamiento.

---

## 4. El modelo mental de los sobres

### La imagen

Botes con etiqueta. Cuando te pagan, el dinero entra a tu cuenta y tú decides
cuánto va en cada sobre. Ese dinero ya tiene destino. Cuando gastas, sale del sobre
correspondiente. El sobre es tu límite.

### La invariante

```
patrimonio de la cartera  =  Σ disponibles de sobres + dinero suelto
```

Si esto no cuadra, hay un bug. Debe cumplirse en **cualquier** momento, con
**cualquier** combinación de datos. Es el único test que importa.

### Los tres estados del dinero

| Estado | Significado |
|---|---|
| En un sobre | Dinero con destino asignado, listo para gastarse |
| Gastado | Ya salió de un sobre |
| **Suelto** | Dinero que llega y aún no tiene destino (puede ser negativo) |

### Seis reglas del método

1. **Dale trabajo a cada peso** — nada queda suelto.
2. **Acepta tu gasto real** — el presupuesto se ajusta a la realidad, no al revés.
3. **Roda con los golpes** — un desborde se tapa con dinero suelto.
4. **Envejece tu dinero** — reduce el tiempo entre ganar y gastar.

(Y dos meta-reglas: el sobre es un **límite blando**, no una cuenta; los meses
**no reinician** nada, son filtros.)

### Los dos errores clásicos

**Repetir el plan del mes anterior.** Si en enero metiste 500 en un sobre y
gastaste 800, el plan estaba mal desde enero, no desde febrero. Repetir 500 en
febrero da `−300 + 500 − 800 = −600`: **duplicas la deuda**.

**Cuadrar mes a mes.** Si partes de cero cada mes, el número siempre "sale
bien" y nunca ves que el plan original era irreal.

### La fórmula para tapar un desborde

```
asignar = deuda pendiente + gasto esperado del mes + colchón
```

| Si esperas gastar… | Asignas | Disponible final |
|---|---|---|
| 610 | 210 + 610 = **820** | 0 |
| 400 (te comprometes a bajar) | 210 + 400 = **610** | 0 |
| 610 + colchón de 180 | **1,000** | +180 |

Ni 210 (solo la deuda) ni 400 (copiar el mes anterior). El número sale de la
fórmula.

**820 es una corrección de una sola vez.** Una vez saldada la deuda, los 210
componentes desaparecen: a partir del mes 3 asignas gasto esperado + colchón.

**Cuadrar en 0 no es estar cómodo.** Con disponible 0 cualquier gasto inesperado
vuelve a generar deuda. El colchón no es lujo.

### Sobre vs. categoría

**Son lo mismo.** En este modelo toda categoría es un sobre: no hay dos
conceptos. Una categoría tiene cuánto se le asignó, cuánto se gastó y cuánto
queda (acumulado).

### Los meses

El presupuesto es **uno solo y continuo**. El mes es un filtro para ver el
movimiento, no una caja que se vacía. Lo que no gastas se acumula. Un sobre vacío
en julio sigue vacío en agosto.

---

## 5. Los casos límite

Son los que un MVP debe soportar. Todos derivados de un ejemplo de 6 meses.

| # | Caso | Qué exige el sistema |
|---|---|---|
| 1 | **Gasto con tarjeta**: el sobre baja aunque el banco no se mueva | El sobre es una promesa, no dinero físico |
| 2 | **Reembolso**: el sobre sube | Activity negativa, no dinero nuevo |
| 3 | **Sobre en negativo**: se gastó más de lo que había | Permitirlo, mostrarlo, y decidir quién lo paga |
| 4 | **Tapar el negativo** con dinero suelto | Automático con aviso (recomendado); alternativa manual |
| 5 | **Mover entre sobres**: reetiqueta | Σ disponibles no cambia, el patrimonio no cambia, no se crea dinero |
| 6 | **Transferencia entre cuentas** | **No toca sobres, ni dinero suelto, ni patrimonio.** Solo mueve saldos de cuenta |
| 7 | **Borrar un movimiento** | Todo se recalcula desde cero. Nunca guardar saldos |
| 8 | **Pagar la tarjeta** | **Solo transferencia.** NO requiere apartar en un sobre |
| 9 | **Movimiento sin asignar** | Dinero en limbo esperando destino (`sobre_id` nulo) |
| 10 | **Víndice sobre↔cuenta** | Independiente. El sobre no fuerza a una cuenta real |

### Los dos errores de implementación más comunes

**Tratar el pago de la tarjeta como asignación.** La factura ya se descontó del
sobre al comprar. Pagar es **solo mover dinero entre cuentas**. Si exiges
apartarlo en un sobre, rompes la invariante.

**Guardar saldos precalculados.** Si al borrar un movimiento no recalculas, el
error se vuelve permanente. Todo se deriva: disponible, dinero suelto, saldo de
cuenta, patrimonio.

### Un error que cometimos en el ejemplo

Al borrar un cobro de 250 (duplicado en tarjeta), sumamos +250 al sobre pero
dejamos la deuda de la tarjeta igual. **Borrar una fila mueve el sobre y la
cuenta a la vez**, o la invariante se rompe. El mes 1 corregido quedó:

```
Comida 860 · Transporte 500 · Diversión 0 · Salud 400 · Ahorro 2,000
Σ sobres 3,760 + dinero suelto 900 = 4,660 = banco 2,660 + ahorro 2,000 ✓
```

Los meses 2–6 del ejemplo arrastran el mismo error en sus filas de borrado. **No
usar esos números como referencia en los specs.** Hay que rehacerlos.

### El principio que resuelve los casos difíciles

> **El sistema debe dejarte equivocarte, pero no debe mentirte.**

- Te deja repartir de más → pero avisa que el dinero suelto quedó negativo
- Te deja gastar más de un sobre → pero el sobre muestra el negativo real
- Te deja borrar → pero recalcula todo desde cero
- Te deja archivar un sobre → pero solo cuando llega a cero

Este principio ya está escrito en los specs: cada caso difícil del apartado 5
tiene un requisito que lo resuelve.

---

## 6. Modelo de datos

Tablas y atributos **en español**, sin acentos en los identificadores. El
diagrama completo esta en `modelo.puml`: un diagrama de entidades y otro de
derivados.

### Las 10 entidades

| Entidad | Guarda | Rol |
|---|---|---|
| **usuarios** | quién entra y su zona horaria | 1 → muchas carteras |
| **carteras** | nombre y **una moneda** | aisla los importes; el panel muestra una |
| **grupos** | Necesidades, Deseos, Ahorros | 1 → muchos sobres; no se anidan |
| **cuentas** | banco, ahorro, efectivo, tarjeta | 1 → muchos movimientos |
| **sobres** | los sobres (comida, transporte…) | 1 → muchas asignaciones, movimientos y metas |
| **asignaciones** | cuánto se metió en un sobre en un periodo | cuelga de `sobres` |
| **grupos_transferencia** | una transferencia y sus dos patas | empareja movimientos de tipo `traspaso` |
| **movimientos** | cada gasto, ingreso o traspaso | cuelga de `cuentas` y, opcionalmente, de `sobres` |
| **metas** | "juntar 20,000 para vacaciones antes de diciembre" | cuelga de `sobres`; varias, una activa |
| **reglas_recurrentes** | "cada día 1 cobro la renta" | genera movimientos |

### Atributos

**usuarios**: `id` · `nombre` · `apellido` · `nombre_usuario` · `correo` ·
`hash_contrasena` · `activo` · `zona_horaria` · `creado_en`

**carteras**: `id` · `usuario_id` · `nombre` · `moneda` (`char(3)`, ISO 4217) ·
`archivada` · `orden` · `creado_en` · `eliminado_en`

**grupos**: `id` · `cartera_id` · `nombre` · `archivado` · `orden` · `creado_en`

**cuentas**: `id` · `cartera_id` · `nombre` · `tipo` (`corriente` · `ahorro` ·
`efectivo` · `credito`) · `saldo_inicial` · `archivada` · `orden` · `creado_en` ·
`eliminado_en`. **Sin columna de saldo.**
(`credito` → saldo **negativo** = deuda)

**sobres**: `id` · `cartera_id` · `grupo_id` · `nombre` · `archivado` · `orden` ·
`creado_en` · `eliminado_en`. **Sin columna de disponible.**

**asignaciones**: `id` · `sobre_id` · `periodo` (`YYYY-MM`) · `monto` (siempre
positivo). **Varias por sobre y periodo: se suman.**

**grupos_transferencia**: `id` · `descripcion` · `fecha` · `creado_en`

**movimientos**: `id` · `cuenta_id` · `sobre_id` (nullable) · `transferencia_id`
(nullable) · `tipo` (`gasto` · `ingreso` · `traspaso`) · `monto` (**con signo**:
negativo = gasto, positivo = ingreso) · `fecha` · `descripcion` · `comercio`
(nullable) · `origen` (`manual` · `recurrente`) · `regla_id` (nullable) ·
`eliminado_en` · `creado_en` · `actualizado_en`

**metas**: `id` · `sobre_id` · `monto_objetivo` · `fecha_limite` (nullable) ·
`estado` (`activa` · `completada` · `abandonada`) · `completada_en` ·
`abandonada_en` · `creado_en`

**reglas_recurrentes**: `id` · `cartera_id` · `cuenta_id` · `sobre_id` (nullable) ·
`descripcion` · `monto` (siempre positivo) · `frecuencia` (`diaria` · `semanal` ·
`mensual` · `anual`) · `dia` · `mes` (nullable, para anual) · `fecha_inicio` ·
`activa` · `creado_en` · `eliminado_en`

### Decisiones estructurales

#### `sobre_id` nullable en `movimientos`

`sobres |o--o{ movimientos`: la relacion es **opcional**. Un movimiento puede
quedar sin sobre. Es la mecanica central de YNAB: el dinero llega y espera
decision.

#### Ni `usuario_id` ni `cartera_id` en `movimientos`

La pertenencia se deduce:

```
movimientos -> cuenta_id -> cuentas -> cartera_id -> carteras -> usuario_id
```

| | Con `usuario_id` | Sin `usuario_id` |
|---|---|---|
| Consultas del panel | mas rapidas (hay que unir con `cuentas`) | lentas |
| Fuga entre usuarios | menor, la base filtra sola | depende del join |
| Consistencia | puede desincronizarse | imposible que se contradiga |

**Omitir.** Menos superficie de bug. Si crece, se agrega.

La consecuencia es que **un movimiento pertenece a exactamente una cartera** por
construccion, y por eso un traspaso entre carteras distintas no tiene donde
almacenarse. Ver `PREGUNTAS.md` pregunta 1.

#### `transferencia_id` nullable en `movimientos`

Un traspaso normal tiene dos filas que comparten `transferencia_id`. Se permite
una sola pata, con aviso, asi que la relacion es `0..*` y no `1..*`.

#### Sin `saldo`, `disponible` ni `dinero_suelto`

Se calculan siempre, nunca se guardan:

```
saldo_cuenta  = saldo_inicial + SUM(monto de sus movimientos)

disponible(sobre, periodo M) = SUM(asignaciones con periodo <= M)
                             + SUM(monto de sus movimientos no eliminados,
                                   tipo != traspaso, con fecha <= fin de M)

dinero_suelto(cartera) = SUM(saldos de sus cuentas)
                       - SUM(disponibles de sus sobres)
```

Las tarjetas entran con saldo negativo, asi que **restan dinero suelto**. Eso es
la deuda.

**Invariante:** `patrimonio(cartera) = SUM(disponibles) + dinero_suelto(cartera)`

Los traspasos la dejan invariante: mueven saldos de cuenta, no disponibles.

**No existe tabla `meses_presupuesto`.** No hay cierre de periodo: los periodos se
derivan de la fecha de cada movimiento, y cualquier corrección retroactiva
recalcula los periodos afectados.

---

## 7. Decisiones tomadas

### Modelo

| Decisión | Elección | Por qué |
|---|---|---|
| Tablas y atributos en español | Sí, snake_case sin acentos | Consistencia con las capacidades |
| Sobre y categoría | **Son lo mismo** | En YNAB toda categoría es un sobre |
| Disponible | **Siempre calculado**, nunca guardado | Si no, los borrados no se reparan |
| Saldo de cuenta | **Siempre calculado** | Mismo motivo |
| Dinero suelto puede ser negativo | Sí, y se avisa | Es la señal de sobre-asignación |
| `usuario_id` en `movimientos` | **Omitido** | Se deduce por `cuenta_id → cuentas → carteras → usuarios`; evita desincronización |
| `cartera_id` en `movimientos` | **Omitido** | Mismo motivo, y hace imposible el traspaso entre carteras |
| `sobre_id` nullable | **Sí** | Dinero en limbo, mecánica central |
| Importes | `numeric(16,2)`, exactos | Sin flotantes |
| Redondeo | Solo al mostrar | 1,000 entre 3 sobres no reparte el centavo |
| Periodos | No reinician; sin cierre | Un solo presupuesto continuo |
| Grupos anidados | No | Un solo nivel |
| Asignaciones únicas por sobre/periodo | **No** | Varias se suman |
| Una meta activa por sobre | **Sí** | Con historial de metas anteriores |
| Sin `saldo`, `disponible` ni `dinero_suelto` | Correcto | Son derivados |

### Reglas de dinero

| Decisión | Elección |
|---|---|
| Tapar un desborde | **Manual**, el usuario elige de dónde; el sistema solo avisa si hay dinero suelto |
| Sobre negativo | Se permite, y se destaca en el panel |
| Devoluciones | Reducen el gasto original; no son dinero nuevo |
| Pago de tarjeta | **Traspaso**, no asignación; el dinero ya se descontó al comprar |
| Traspaso entre cuentas | No toca sobres, ni dinero suelto, ni patrimonio |
| Traspaso con una sola pata | Se permite, con aviso |
| Borrar un sobre | Solo sin movimientos y con disponible 0 |
| Archivar un sobre | Solo con disponible 0; después acepta devoluciones |
| Archivar un grupo | No oculta sus sobres |
| Editar un movimiento | Sí, recalcula el periodo de su fecha |
| Mes de un movimiento | Calendario de la **fecha**, con la zona horaria del usuario |

### Alcance

| Decisión | Elección |
|---|---|
| Carteras múltiples | **Sí, desde el inicio** |
| Una moneda por cartera | **Sí**, sin tipo de cambio |
| Grupos | **Añadidos** |
| Metas | **Añadidas** |
| Reglas recurrentes | **Añadidas** |
| Panel | **Añadido**, de solo lectura |
| Historial de patrimonio | **Añadido** |
| Comparativos | **Añadidos** |
| Multimoneda con conversión | Fuera de alcance |
| Conciliación bancaria | Fuera de alcance; la app no se conecta a bancos |
| Importación CSV | Fuera de alcance |
| Clasificación automática con LLM | Fuera de alcance |
| Copia de seguridad | Fuera de alcance |
| Meses futuros | Fuera de alcance |
| Autoasignación de sobrantes | Fuera de alcance |
| Plantillas de sobres | Fuera de alcance |
| Deuda compartida | Fuera de alcance |
| Adjuntos en movimientos | Fuera de alcance |
| Notificaciones | Fuera de alcance |
| Presupuesto por porcentaje del ingreso | Fuera de alcance |
| Recuperación de contraseña | Fuera de alcance |
| Usuarios compartidos / debtsplit | Fuera de alcance |

---

## 8. Decisiones pendientes

**Ninguna bloqueante.** Las 12 capacidades están escritas y se pueden implementar.
Quedan 6 preguntas abiertas, todas de confirmación, detalladas con su decisión
provisional en [`PREGUNTAS.md`](PREGUNTAS.md):

1. ¿Traspaso entre carteras de distinta moneda, o entre carteras en general?
2. ¿Importe mínimo de un traspaso o de una asignación?
3. ¿Umbral por defecto para destacar variaciones en comparativos?
4. ¿Qué muestra el panel cuando una cartera está archivada?
5. ¿Se conserva el acceso a la cartera archivada?
6. ¿Se quita el enlace de contraseña olvidada de `PROMPTS-DISENO.md`?

---

## 9. Convenciones de los specs

Heredadas de los specs existentes:

- Escritos en **español**
- Marcadores estructurales en inglés: `## Purpose`, `## Requirements`,
  `### Requirement:`, `#### Scenario:`
- Palabras clave de convención en inglés: `SHALL`, `WHEN`, `THEN`
- **Sin mencionar stack**: ni lenguajes, ni frameworks, ni base de datos, ni
  nombres de archivo. Así el spec sobrevive a un cambio de stack.

Ejemplo de formato (de `autenticacion/spec.md`):

```markdown
### Requirement: El usuario inicia sesion con nombre de usuario y contrasena
El sistema SHALL autenticar al usuario mediante nombre de usuario y contrasena, y
SHALL tratar el nombre de usuario de forma insensible a mayusculas y minusculas.
El sistema SHALL establecer una sesion autenticada tras un inicio de sesion exitoso.

#### Scenario: Inicio de sesion exitoso
- **WHEN** un usuario registrado envia su nombre de usuario y la contrasena correcta
- **THEN** el sistema establece una sesion autenticada y lo lleva al panel de su cartera
```

Cada requisito describe comportamiento observable, no implementación. Si un
requisito necesita nombrar una tabla o un algoritmo, está mal escrito.

---

## 10. Cómo retomar el trabajo

1. Lee las secciones 7 y 8 (decisiones tomadas y pendientes).
2. Revisa [`PREGUNTAS.md`](PREGUNTAS.md), que lista las 6 preguntas abiertas con
   su decisión provisional.
3. Para cambiar una capacidad, edita `openspec/specs/<capacidad>/spec.md`
   directamente. **No crees `openspec/changes/`**: el usuario decidió no usar el
   ciclo de cambio.
4. Si cambias una regla de dinero, actualiza también `modelo.puml` y las secciones
   4 y 7 de este archivo. Las specs, el modelo y este documento cuentan la misma
   historia desde tres ángulos, y se desincronizan con facilidad.
5. Verifica la invariante central contra cualquier ejemplo numérico nuevo.

**No escribas specs usando los números del ejemplo de 6 meses de la sección 5.**
Tienen errores en las filas de borrado. Si necesitas ejemplos para un spec,
rehazlos y verifica siempre contra la invariante.
