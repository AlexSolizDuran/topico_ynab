---
name: dinero
description: Regla del dinero del proyecto - los importes son numeric(16,2) de Postgres y SIEMPRE se manejan como string, con la aritmetica derivada en SQL y nunca en JavaScript. Usar al escribir o revisar cualquier columna numeric, campo de importe, saldo, disponible, total, asignacion o calculo de dinero, y al debuggear totales que no cuadran.
---

# Regla del dinero

## La regla, en una linea

`type Dinero = string`. Nunca `number`. Nunca `parseFloat`.

No es una convencion de estilo: la firma de la columna de Drizzle **rechaza el
numero en TypeScript**. `PgNumericBuilder` declara `dataType: 'string'`, asi que
el tipo inferido de una columna `numeric` ya es `string` y `tsc` falla si le
pasas un `number`.

## Por que no se negocia

```js
Number('1234567890123456.78')  // -> '1234567890123456.75'
```

Un float de 64 bits tiene 15-17 digitos significativos. Un `numeric(16,2)`
ocupa hasta 16. En magnitudes grandes **el float pierde centavos y no lanza
ningun error**: el saldo queda corrida, el panel no cuadra, y el bug aparece
meses despues cuando ya no se sabe de donde vino.

## Prohibido

| No | Por que | Usar en su lugar |
|---|---|---|
| `number` como tipo de importe | pierde centavos | `Dinero` (= `string`) |
| `parseFloat(x)` / `parseInt(x)` | vuelve a `number` | 그대로 el string |
| `Number(x)`, `+x` | idem | 그대로 el string |
| `a + b`, `a - b`, `a * b` entre importes | idem | `sql` en la consulta |
| `a.toFixed(2)` | `toFixed` exige `number` | `Intl.NumberFormat` |
| `.map(Number).reduce((a,b)=>a+b, 0)` | doble falla | `sum()` en SQL |
| JSON.parse/revive del importe | puede entregar `number` | mantener `string` |

## Permitido sobre el string

Solo concatenacion, comparacion lexicografica irrelevante, y estas dos:

```ts
// Formato: el string va directo, sin convertir antes
new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
  .format(importe as unknown as number)
```

Lo de `as unknown as number` es la concession de la API de `Intl`, que pide
`number`. **No convierte el dato**: solo le pasa la referencia para que la
formatee. El valor que sigue siendo `string` en tu capa de dominio.

## Patrones

### Declarar la columna

```ts
import { numeric } from 'drizzle-orm/pg-core'

export const transacciones = pgTable('transacciones', {
  importe: numeric('importe', { precision: 16, scale: 2 }).notNull(),
  //  ^ el tipo inferido es string. No lo tipes como number ni con $type<number>()
})
```

Nunca `$type<number>()`: ese cast existe para *mentir* sobre la columna y es
exactamente el bug que esta regla previene.

### Available de un sobre: `asignado - (gastado + reservado)`

Es una resta entre tres importes, asi que va en SQL, con `coalesce` para que un
sobre sin movimientos no devuelva `null`:

```sql
select
  e.id,
  coalesce(a.total, 0) - (coalesce(g.total, 0) + coalesce(r.total, 0)) as disponible
from sobres e
left join lateral (
  select sum(a2.importe) as total from asignaciones a2 where a2.sobre_id = e.id
) a on true
left join lateral (
  select sum(t.importe) as total from transacciones t
  where t.sobre_id = e.id and t.tipo = 'gasto'
) g on true
left join lateral (
  select sum(r2.importe) as total from reservas r2 where r2.sobre_id = e.id
) r on true
```

Cuidado con el tipo del `0` de `coalesce`: Postgres resuelve `numeric` +
`integer` a `numeric`, pero si el `sum()` viene de una subconsulta vacia puede
quedar `bigint`. castea explicito cuando la precision importe:

```sql
coalesce(a.total, 0)::numeric(16,2)
```

### Invariante del patrimonio

```sql
-- patrimonio = suma(disponibles) + dinero_suelto
select
  (select coalesce(sum(disponible), 0) from disponibles) + c.dinero_suelto as patrimonio
from carteras c
where c.id = $cartera_id
```

`disponibles` es la subconsulta del patron anterior. El `usuario_id` y el
`cartera_id` **no son opcionales**: ver la skill `datos-neon`.

## Al revisar codigo

- [ ] Todo importe tiene tipo `Dinero`, no `number`
- [ ] Ninguna columna `numeric` lleva `$type<number>()`
- [ ] No hay `parseFloat` / `Number` / `+` sobre un importe
- [ ] Toda suma, resta o promedio sale de `sum()` / `coalesce` en SQL
- [ ] El formateo pasa el string directo a `Intl.NumberFormat`
- [ ] Los rollups filtran por `usuario_id` y `cartera_id`

## Fuente

`openspec/config.yaml` (inyectado por el CLI) y `openspec/specs/*/spec.md`. Si
el codigo y el spec discrepan sobre el dinero, **el spec manda**: reportalo y
corregi el codigo, no al reves.
