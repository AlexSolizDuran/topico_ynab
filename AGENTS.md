# AGENTS.md

Instrucciones para cualquier agente o harness que trabaje en este repositorio.
Esta documentación es autocontenida: no hace falta leer ningún chat previo.

## Qué es esto

Finanzas personales con sobres de presupuesto ( budgeting estilo YNAB ). Un
repositorio **sin código**: solo diseño. No hay `package.json`, ni `src/`, ni
dependencias. El trabajo de implementación todavía no empieza.

El diseño está expresado como un OpenSpec de 12 capacidades.

## Estado del OpenSpec

| | |
|---|---|
| Capacidades | 12 |
| Requisitos | 78 |
| Escenarios | 257 |
| Validado | contra las reglas del schema `spec-driven` |

`openspec/specs/<capacidad>/spec.md` es la fuente de verdad. La estructura de
cada spec es fija: `## Purpose`, luego `## Requirements`, y dentro
`### Requirement:` con el texto normativo (SHALL/MUST) y sus
`#### Scenario:` en formato `- **WHEN**` / `- **THEN**`.

Las capacidades son: `autenticacion` (7), `carteras` (5), `cuentas` (6),
`grupos` (3), `sobres` (11), `transacciones` (10), `traspasos` (4),
`recurrencias` (5), `metas` (6), `patrimonio` (4), `panel` (13),
`comparativos` (4).

**Los specs son neutrales de stack a propósito.** No mencionan languages,
frameworks, base de datos ni nombres de tabla, para sobrevivir a un cambio de
stack sin reescrituras. El stack vive únicamente en `openspec/config.yaml`.

## Configuración del CLI

El paquete se llama **`@fission-ai/openspec`**. No es `openspec`: ese nombre
pertenece a un paquete ajeno sin binario, y `npx openspec` falla con
"could not determine executable to run".

```bash
npm install -g @fission-ai/openspec@latest
openspec init --tools opencode
```

`init` refresca un `openspec/` existente sin tocar los specs, y no sobrescribe
el campo `context` de un proyecto ya configurado. Requiere Node ≥ 20.19.0.

Después de `init`, **reinicia opencode**: la configuración se carga al arrancar
y no se recarga en caliente. Aparece `.opencode/skills/openspec-*/SKILL.md` y
`.opencode/commands/opsx-*.md`.

**Estado al 2026-09-27: ya ejecutado.** `@fission-ai/openspec` 1.13.2 global,
Node 24.18.0, `init --tools opencode` corrido. Dejó 6 commands, 6 skills
`openspec-*` y confirmó `config.yaml (exists)`. Se verificó con md5 que los 12
specs y `config.yaml` quedaron **byte-idénticos** después del `init`. **No
vuelvas a correr `init`** salvo que quieras restaurar los archivos del CLI.

**El MCP de Google Stitch** está configurado en
`~/.config/opencode/opencode.jsonc` (tipo `remote`, permisos `600`, key
**fuera** del repo). Aparece al reiniciar. Si las tools de Stitch no están
disponibles, la key o el endpoint están mal: ver la skill `vistas-stitch`.

### Forma de los comandos en opencode

El id de la herramienta es `opencode` y escribe `opsx-<id>.md`, así que los
comandos usan **guion**, no dos puntos:

| | |
|---|---|
| opencode (este repo) | `/opsx-propose` `/opsx-apply` `/opsx-archive` |
| Claude Code, Gemini, Qoder | `/opsx:propose` `/opsx:apply` |

Confundir esto es el error más fácil de cometer.

El CLI corre en la terminal (`openspec validate`, `list`, `show`, `view`,
`new change`, `status`, `instructions`, `archive`); los `/opsx-*` corren en el
chat. El CLI es el que instala los comandos.

## Cómo se ejecuta el trabajo

`openspec/specs/` es el diseño **objetivo ya acordado**: describe cómo se
comportará el sistema, no cómo se comporta hoy. Como ya está completo, cada
change **implementa** contra esos requisitos en vez de re-derivarlos.

Ciclo por change:

```bash
openspec new change 010-auth
```
```
/opsx-propose 010-auth     # redacta proposal + design + tasks
# revisión humana
/opsx-apply                # implementa desde tasks.md
/opsx-archive             # lo mueve a changes/archive/
```

Cada change lleva `skip_specs: true` en su `.openspec.yaml`: no introduce
comportamiento nuevo, solo materializa lo ya especificado. Sin ese marcador,
`openspec validate` rechaza un change con cero deltas.

Contenido literal de `openspec/changes/<change>/.openspec.yaml`:

```yaml
schema: spec-driven
skip_specs: true
```

`openspec new change <id>` crea el directorio pero puede no escribir ese
archivo: créalo a mano antes de `/opsx-apply`. Los nombres de change son
kebab-case en minúsculas, con guiones simples.

Al proponer, lee primero la capacidad con `openspec show <cap> --type spec` y
cita sus requisitos por nombre.

## Orden de implementación

Derivado de las dependencias del modelo de datos, no del tamaño. `panel` y
`comparativos` van últimos porque agregan todo lo demás.

| # | change | capacidad | req |
|---|---|---|---|
| 1 | `010-auth` | autenticacion | 7 |
| 2 | `020-carteras` | carteras | 5 |
| 3 | `030-cuentas` | cuentas | 6 |
| 4 | `040-grupos` | grupos | 3 |
| 5 | `050-sobres` | sobres | 11 |
| 6 | `060-transacciones` | transacciones | 10 |
| 7 | `070-traspasos` | traspasos | 4 |
| 8 | `080-recurrencias` | recurrencias | 5 |
| 9 | `090-metas` | metas | 6 |
| 10 | `100-patrimonio` | patrimonio | 4 |
| 11 | `110-panel` | panel | 13 |
| 12 | `120-comparativos` | comparativos | 4 |

El prefijo numérico ordena el `openspec list`.

## La regla del dinero

La regla más importante del proyecto. Está en `openspec/config.yaml`; se
repite acá porque ninguna sesión puede dar por hecho el contexto.

- Postgres `numeric(16,2)`. Drizzle lo devuelve como **`string`**, ya verificado
  en su propio código: `PgNumericBuilder` declara `dataType: 'string'`.
- `type Dinero = string`. **Nunca** `number`, nunca `parseFloat`. No es una
  convención: la firma de la columna en TypeScript rechaza el número.
- Toda aritmética derivada va en **SQL** (`sum`, `coalesce`), nunca en JS.
- `Intl.NumberFormat` recibe el string directo, sin convertir antes.
- Motivo medido: `Number('1234567890123456.78')` produce `...56.75`. Un float
  pierde centavos en magnitudes grandes.

Invariante del dominio: `patrimonio = suma(disponibles) + dinero_suelto`. El
disponible de un sobre es `asignado - (gastado + reservado)`. Es SQL, no JS.

## Stack

En `openspec/config.yaml`. Resumen: Next.js 16 App Router en Vercel, Postgres
en Neon, Drizzle ORM, Tailwind 4, TypeScript 5. Autenticación **a mano sobre
Postgres** con Argon2id y sesiones persistidas (los serverless de Vercel no
conservan memoria entre invocaciones). Aislamiento **por capa de aplicación**,
no RLS: el repositorio centralizado debe exigir `usuarioId` y `carteraId` en
toda lectura y escritura. Sin Cron: las recurrencias se materializan al reabrir
la app.

## Decisiones de dominio

No contradigas los specs. En resumen:

- Sobres negativos permitidos; el tapado es manual.
- Los meses y los saldos no se reinician.
- Los importes son exactos, sin reparto automático.
- Un sobre se archiva solo con disponible `0`; después acepta devoluciones.
- Un sobre con movimientos se archiva, nunca se elimina.
- Se permiten varias asignaciones por sobre y periodo.
- Se permiten varias metas históricas, pero una sola activa.
- Un traspaso puede tener una sola pata, con aviso.
- Cada cartera tiene una moneda y no hay conversión. El panel muestra una
  cartera y nunca mezcla dos.

Fuera de alcance: conciliación bancaria, CSV, LLM, respaldos, meses futuros,
autoasignación, plantillas, deuda compartida, adjuntos, notificaciones,
presupuesto porcentual, conversión de moneda, recuperación de contraseña.

## Preguntas abiertas

Ninguna bloquea la construcción, pero la primera cambia comportamiento y
conviene resolverla antes de escribir código de `traspasos`. Están en detalle en
`PREGUNTAS.md`.

1. ¿Traspasos entre carteras de la **misma** moneda, o entre carteras en
   general? Los specs hoy los rechazan todos.
2. ¿Importe mínimo de un traspaso y de una asignación.
3. ¿Umbral por defecto para destacar variaciones en comparativos.
4. ¿Qué muestra el panel cuando una cartera está archivada.
5. ¿Se conserva el acceso a la cartera archivada.
6. Enlace de recuperación de contraseña en `PROMPTS-DISENO.md`.

## Reglas de trabajo

Se cargan en toda sesión. Si una contradice a un spec, el spec manda.

1. **El spec manda sobre el código.** Si divergen, se edita
   `openspec/specs/` y se vuelve a validar, nunca el código. Los specs
   describen el comportamiento objetivo ya acordado.
2. **Las migraciones son inmutables.** Una que ya corrió no se toca; se agrega
   una nueva. Editar una aplicada produce drift entre entornos.
3. **Nada de commits ni push sin pedido explícito.** Un agente no commitea por
   iniciativa propia.
4. **Identificadores en español**, para calzar con el modelo: `nombre_usuario`,
   `cartera_id`, `dinero_suelto`. Sin mezcla de idiomas en el schema.
5. **Cero secretos en el repo.** `.env.example` solo con placeholders. Las keys
   viven en el config local de opencode con permisos `600`, nunca versionadas.
6. **Verificar antes de decir que está.** Tests con **Vitest** (elegido el
   2026-09-27; el repo todavía no tiene `package.json`).

## Skills del proyecto

En `.opencode/skills/`. Se cargan **solo cuando su descripción dispara**, a
diferencia de este archivo que se carga siempre. Para detalles y patrones de
código, cargá la skill en vez de improvisar.

| Skill | Cuándo |
|---|---|
| `dinero` | Cualquier `numeric`, importe, saldo, disponible o total |
| `auth-manual` | Login, logout, sesión, cookie, CSRF, bloqueo de intentos |
| `implementar-change` | Crear o retomar un change de OpenSpec |
| `datos-neon` | Repositorios, queries, migraciones, conexión |
| `vistas-stitch` | Vistas, pantallas, componentes de UI |

Conviven con las 6 skills `openspec-*` que instala el CLI. No reescribas ni
dupliques esas.

## Otros documentos

| Archivo | Contenido |
|---|---|
| `openspec/config.yaml` | Contexto que OpenSpec inyecta: stack, regla del dinero, flujo |
| `modelo.puml` | 11 entidades, 2 diagramas. `sesiones` incluida por el auth a mano |
| `CONTEXTO.md` | Contexto del dominio, alcance e invariante |
| `PREGUNTAS.md` | Las 6 decisiones pendientes, con opciones y recomendación |
| `PROMPTS-DISENO.md` | 17 vistas en tres tandas, prompt fuente del diseño |
| Google Stitch `8487809175016098023` | El diseño visual. Referencia, **no** código para pegar |

## Detalles del modelo que se pierden si no los sabés

- `nombre_usuario` necesita un **índice único funcional sobre
  `lower(nombre_usuario)`**. Un `UNIQUE` normal de Postgres es sensible a
  mayúsculas y dejaría crear `Alex` y `alex` a la vez. El spec lo exige
  insensible.
- `sesiones.token_hash` guarda el hash, no el identificador en claro. El
  cierre de sesión **elimina** la fila; no hay columna de revocación.
- `sesiones.token_proteccion` caduca con la sesión: no se reutiliza entre
  sesiones distintas.
- El bloqueo de inicio de sesión son 5 intentos fallidos y 60 segundos, con
  reinicio del contador tras un inicio exitoso.
- La contraseña mínima es de **6** caracteres, no 8.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
