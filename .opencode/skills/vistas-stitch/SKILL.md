---
name: vistas-stitch
description: El diseno visual de la app vive en un proyecto de Google Stitch (id 8487809175016098023), accesible por MCP. Usar al construir vistas, pantallas, componentes de UI, el panel, o cuando necesites el diseno de referencia. Stitch es REFERENCIA VISUAL, no codigo para pegar - el stack real es Next.js 16 App Router + Tailwind 4.
allowed-tools: Read, Edit, Write, Grep, Glob
license: MIT
metadata:
  appliesTo: "110-panel, 120-comparativos y las vistas de las 3 tandas"
---

# Vistas: diseno en Google Stitch

## Donde esta el diseno

- **Proyecto Stitch:** `8487809175016098023`
- **URL:** `https://stitch.withgoogle.com/projects/8487809175016098023`
- **MCP:** configurado como `stitch` en `~/.config/opencode/opencode.jsonc`, tipo
  `remote`, endpoint `https://stitch.googleapis.com/mcp`

La API key vive **solo** en el config local de opencode, con permisos `600`, y
esta fuera del repo. No la copies a ningun archivo del proyecto.

Las tools del MCP aparecen al reiniciar opencode. Si no aparecen, la key o el
endpoint estan mal.

## Lo mas importante: Stitch NO es codigo para pegar

Esto es lo que sale mal si no se tiene presente.

**S**titch genera HTML/CSS de un stack propio, que **no es** el de este
proyecto. El diseno se **traduce**:

| Lo que hay en Stitch | Lo que se construye aca |
|---|---|
| HTML estatico | Componentes de Next.js 16 App Router (Server Components) |
| CSS propio | Tailwind CSS 4 |
| Layout de pantalla | Server Component + Server Action para las mutaciones |
| Sin estado de datos | Datos desde Postgres via Drizzle |

Copiar el HTML de Stitch a un `.tsx` produce una pantalla que se ve bien en
statico y se rompe en cuanto necesita datos reales, mutaciones o el patron de
`Dinero` como string.

Que se copia: **la composicion, la jerarquia visual, la disposicion, la
proporcion de los bloques**. Que no se copia: **el codigo**.

## El prompt que genero el diseno

`PROMPTS-DISENO.md` tiene las **17 vistas en tres tandas**. Es el prompt fuente
del que se genero el proyecto de Stitch, y queda como registro de que se pedia.

Si hace falta una vista que no esta en Stitch, el prompt esta en ese archivo
antes de improvisar.

## Traduccion de los specs a vistas

El comportamiento sale de los specs, la forma sale de Stitch. **Nunca al
reves.** Los specs son la fuente de verdad funcional; Stitch es la fuente de
verdad visual. Donde discrepan en comportamiento, gana el spec.

| Capa | Fuente |
|---|---|
| Que hace la vista, que valida, que muestra | `openspec/specs/<capacidad>/spec.md` |
| Como se ve | Stitch `8487809175016098023` |
| Que se puede pedir | `PREGUNTAS.md` (fuera de alcance explicito) |

## Restricciones que vienen del dominio

No son esteticas; los specs las imponen y el diseno tiene que convivir con
ellas:

- **Los importes son `string`.** Ningun componente convierte a `number`. Ver la
  skill `dinero`.
- **Una sola cartera por pantalla.** El panel nunca mezcla dos carteras, y cada
  cartera tiene una moneda. **No hay conversion de moneda**: no pongas un
  selector de moneda en el panel.
- **Los sobres negativos se muestran.** El tapado es manual, no automatico: la
  UI no debe sugerir "arreglar" un sobre negativo.
- **Los meses no se reinician.** La UI no debe insinuar un reset mensual.
- **Un sobre archivado con disponible `0`** deja de accepting asignaciones pero
  **acepta devoluciones**. El estado archivado no bloquea todo el sobre.
- **Presupuesto porcentual esta fuera de alcance.** No lo ofrezcas aunque el
  diseno parezca pedirlo.

## Al construir una vista

- [ ] La logica sale del spec de la capacidad, no del HTML de Stitch
- [ ] Server Components por defecto; `'use client'` solo donde haya interaccion
- [ ] Las mutaciones son Server Actions, no endpoints API
- [ ] Los importes llegan como `Dinero` y se formatean con `Intl.NumberFormat`
- [ ] No hay selector de moneda ni mezcla de carteras
- [ ] Se respeta la tabla de restricciones de arriba

## Fuente

Stitch `8487809175016098023`, `PROMPTS-DISENO.md` y
`openspec/specs/*/spec.md`.
