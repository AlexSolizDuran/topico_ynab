# Design

## Context

`openspec/specs/` describe el comportamiento objetivo de 12 capacidades y
`modelo.puml` fija 11 entidades. Ningún archivo de ejecución existe. El stack ya
está decidido en `openspec/config.yaml`: Next.js 16 en Vercel, Postgres en Neon,
Drizzle ORM, Tailwind 4, TypeScript 5, autenticación a mano con Argon2id.

Dos restricciones de `config.yaml` condicionan toda la base: los importes son
`numeric(16,2)` y Drizzle los devuelve como `string`; y la aritmética derivada
tiene que vivir en SQL, nunca en JavaScript. Ver la skill `dinero`.

## Goals / Non-Goals

**Goals:**

- Un proyecto que arranca, compila y tiene pruebas que corren.
- Que el tipo de importe no admita `number` por error de tipeo.
- Una sola definición por valor derivado, reutilizada por panel, patrimonio y
  comparativos.
- Pruebas que corran contra Postgres real sin servicios externos.
- Los tokens visuales resueltos antes de la primera vista.

**Non-Goals:**

- Cualquier tabla de dominio. La migración inicial va en `010-auth`.
- Autenticación, acciones o repositorios. Son los changes siguientes.
- Modificar `openspec/specs/`.

## Decisions

### El importe es un `type` nominal, no un alias

`src/dinero.ts` exporta `type Dinero = string`. La columna de Drizzle ya infiere
`string` —`PgNumericBuilder` declara `dataType: 'string'`—, así que `tsc` rechaza
un `number` en la firma de la columna sin necesidad de runtime ni de validación.
Un alias `type Dinero = string` no aporta nada extra sobre el tipo ya inferido,
pero sí un punto de imports: toda función que toque dinero declara `Dinero` y
queda explícito en la firma.

Alternativa considerada: un branded type (`type Dinero = string & { __marca }`)
rechaza el string crudo y obliga a castear en los límites, lo que agrega
conversión en cada frontera. No compensa: la protección real ya la da la firma de
la columna.

### Los derivados se definen una vez, como fragmentos SQL

`src/db/derivados.ts` exporta funciones que devuelven fragments de Drizzle
(`SQL`), no strings: `saldo_cuenta()`, `disponible_sobre(periodo)`,
`dinero_suelto(carteraId)`, `patrimonio(carteraId)`. Se componen con `sql` y
`lateral` dentro de la consulta que las consume.

El motivo es que el disponible de un sobre es
`SUM(asignaciones con periodo <= M) + SUM(movimientos no eliminados, tipo !=
traspaso, con fecha <= fin de M)`: una resta entre tres importes, imposible de
expresar sin perder centavos en JavaScript. Al centralizarlo, el panel, el
historial de patrimonio y los comparativos leen la misma definición y no pueden
divergir.

Alternativa considerada: una vista de Postgres. Se descartó porque el disponible
depende del parámetro `periodo`, y una vista con parámetro no existe: solo
funciones. Un `set-returning function` agregaría una capa de RPC que el resto del
proyecto no usa.

`coalesce(..., 0)::numeric(16,2)` en cada agregado: un `sum()` sobre subconsulta
vacía devuelve `NULL`, y sin el cast explícito Postgres resuelve `numeric` contra
`integer` con precisión distinta a la de la columna.

### PGlite para las pruebas, Neon para la ejecución

`@electric-sql/pglite` es Postgres compilado a WebAssembly. Corre el mismo motor,
así que `numeric(16,2)`, los índices funcionales sobre `lower(...)`, los índices
parciales y los `enum` se comportan igual que en Neon. El arnés aplica los
archivos `.sql` que genera drizzle-kit, de modo que las pruebas ejercitan las
migraciones reales y no un schema reconstruido a mano.

Se descartó Docker o un Postgres local porque no hay servicio disponible en el
entorno, y Neon en las pruebas porque agrega red, costo y límites a cada corrida.
PGlite da tests herméticos y rápidos.

Cada archivo de prueba obtiene su propia instancia: los datos de un test no
pueden filtrarse al siguiente, que es justamente la clase de bug que la
invariante del patrimonio necesita cazar.

### El cliente de base de datos se memoiza a nivel de módulo

`src/db/cliente.ts` guarda el cliente en una variable de módulo. En Vercel
serverless, sin memoizar, cada invocación abriría un pool nuevo y Neon agota
conexiones. `globalThis` actúa de respaldo en desarrollo, donde el hot reload
reevalúa el módulo.

`DATABASE_URL` (pooled) para runtime, `DATABASE_URL_UNPOOLED` para migraciones.
Correr DDL a través del pooler de Neon es una fuente clásica de locks advising
colgados.

### Los tokens de Stitch se transcriben a Tailwind 4

El sistema de diseño del proyecto de Stitch es la fuente de verdad visual. De él
salen: Plus Jakarta Sans para cifras y titulares, Inter para texto, `#2563eb`
como primario, `#10b981` para positivo y `#ef4444` para negativo, canvas
`#f8fafc`, tarjetas blancas con `rounded-2xl` y borde `#e2e8f0`, y cifras
tabulares en todo importe. Tailwind 4 expone los tokens por `@theme`, así que las
vistas los consume como utilidades en lugar de repetir hexadecimales.

El HTML de Stitch no se copia: es un stack distinto y no tiene datos reales, ni
mutaciones, ni el patrón de `Dinero` como string. Se copia la composición, la
jerarquía y la proporción de los bloques.

## Risks / Trade-offs

- **PGlite no es Neon**: diferencias de versión o de extensiones no aparecen en
  las pruebas → el riesgo real es una función de Postgres que PGlite no
  implementa. Se mitiga con `numeric`, `enum`, índices funcionales e índices
  parciales, que son los únicos que usa el proyecto, y todos soportados.
- **La base no tiene migraciones todavía**: el arnés de pruebas no tiene nada que
  aplicar hasta que `010-auth` genere la primera → se verifica en `010-auth` con
  una prueba que falle si la migración no corrió.
- **Los fragmentos SQL de `derivados.ts` no se ejercitan hasta que existan
  tablas** → se escriben con el schema en mente y se prueban en `050-sobres`,
  que es donde la invariante se vuelve verificable. Riesgo aceptado: son cuatro
  funciones puras de SQL y el fallo aparece en la primera prueba de la
  invariante.
- **`skip_specs: true` sin capacidades declaradas**: `openspec validate` rechaza
  un change con cero deltas salvo ese marcador → verificado en `tasks.md`.
