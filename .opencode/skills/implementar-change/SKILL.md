---
name: implementar-change
description: Procedimiento para implementar una de las 12 capacidades de este repo como change de OpenSpec - orden de dependencias, skip_specs, y como leer la capacidad antes de proponer. Usar al empezar o retomar cualquier change de openspec/changes/, al crear un change nuevo, o cuando haya que decidir que capability va primero.
allowed-tools: Bash(openspec:*), Read, Edit, Write, Grep, Glob
license: MIT
metadata:
  appliesTo: "los 12 changes"
---

# Implementar un change

## El flujo, en orden

```bash
openspec new change 010-auth
```

Despues, **en el chat** (guion, no dos puntos, porque el id del tool es
`opencode`):

```
/opsx-propose 010-auth
/opsx-apply
/opsx-archive
```

El CLI corre en la terminal (`openspec validate`, `list`, `show`, `new change`,
`status`, `instructions`, `archive`). Los `/opsx-*` corren en el chat y los
instala `openspec init --tools opencode`. Son dos cosas distintas.

## Orden de las 12 capacidades

Derivado de las **dependencias del modelo de datos**, no del tamano. `panel` y
`comparativos` van ultimos porque agregan todo lo demas.

| # | change | capacidad | requisitos |
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

El prefijo numerico ordena el `openspec list`. **No saltees el orden**: `060`
necesita `050`, `100` necesita `060` y `080`.

## Leer la capacidad ANTES de proponer

Este es el paso que se saltea mas y el que mas cuesta caro. El spec ya esta
completo y es la fuente de verdad:

```bash
openspec show <capacidad> --type spec
```

Ejemplo: `openspec show sobres --type spec`.

En la proposal, **cita los requisitos por nombre**. Un requisito sin nombre al
que referirse no se puede verificar al revisar.

## `skip_specs: true`, y por que

Cada change lleva este archivo, con este contenido literal:

```yaml
schema: spec-driven
skip_specs: true
```

En `.openspec/changes/<change>/.openspec.yaml`.

`openspec new change <id>` crea el directorio pero **puede no escribir ese
archivo**: crealo a mano antes de `/opsx-apply`.

La razon del `skip_specs` es que los specs describen el comportamiento **objetivo
ya acordado**, no el actual. El change no introduce comportamiento nuevo:
materializa lo que el spec ya decia. Sin el marcador, `openspec validate`
rechaza un change con cero deltas.

## Validar

```bash
openspec validate --specs --strict   # los 12 specs del repo
openspec list --specs
```

`--strict` es el que decide si los requisitos parsean. Es un chequeo de
**formato**, no de calidad del diseno: si falla, el problema es la estructura
del markdown, no la capacidad.

## Los comandos `/opsx-*` ya existen

`.opencode/commands/` tiene `opsx-propose`, `opsx-apply`, `opsx-archive`,
`opsx-explore`, `opsx-sync` y `opsx-update`. Y `.opencode/skills/` tiene las
skills `openspec-*` correspondientes. **No los reescribas ni los dupliques.**

Las skills propias de este proyecto (`dinero`, `auth-manual`, `datos-neon`,
`vistas-stitch`) conviven con esas. Si algo se solapa, gana la regla de
`AGENTS.md` porque se carga siempre.

## Lo que un change NO hace

- No redefine comportamiento. Si hace falta cambiar un requisito, se edita
  `openspec/specs/` primero, y se vuelve a validar.
- No agrega requisitos nuevos por iniciativa propia. Las capacidades son 12, con
  78 requisitos cerrados.
- No toca el stack. El stack vive en `openspec/config.yaml`; los specs son
  neutrales a proposito, para sobrevivir a un cambio de stack.
