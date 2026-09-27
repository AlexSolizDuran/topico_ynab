---
name: datos-neon
description: Acceso a datos con Neon Postgres y Drizzle ORM - pooled vs unpooled, migraciones inmutables, y aislamiento por capa de aplicacion sin RLS. Usar al escribir repositorios, queries, migraciones, configurar la conexion, o cuando una query devuelva filas de otro usuario. El repositorio centralizado DEBE exigir usuarioId y carteraId.
allowed-tools: Bash(openspec:*), Read, Edit, Write, Grep, Glob
license: MIT
metadata:
  appliesTo: "todos los changes"
---

# Datos: Neon + Drizzle

## Sin RLS. Esta no se negocia

**No hay Row Level Security.** El aislamiento es por **capa de aplicacion**.

Esto importa porque RLS es el default en cualquier tutorial de Postgres, asi
que la costumbre va a empujar en la direccion contraria. Si aparece un
`enable row level security` o un `create policy`, esta rompiendo una decision
del proyecto.

El motivo esta en `openspec/config.yaml`.

## La regla del repositorio centralizado

> El repositorio centralizado **debe** exigir `usuarioId` y `carteraId` en toda
> lectura y escritura.

No es una recomendacion de estilo: es la unica frontera de seguridad del
sistema. Sin RLS, un `WHERE` olvidado es una fuga de datos entre usuarios.

```ts
// MAL: un repositorio que acepta solo sobreId expone datos ajenos
async function porSobre(sobreId: string) {
  return db.query.sobres.findFirst({ where: eq(sobres.id, sobreId) })
}

// BIEN: el identificador del usuario no es un parametro opcional
async function porSobre(args: { sobreId: string; usuarioId: string; carteraId: string }) {
  return db.query.sobres.findFirst({
    where: and(
      eq(sobres.id, args.sobreId),
      eq(sobres.usuarioId, args.usuarioId),
      eq(sobres.carteraId, args.carteraId),
    ),
  })
}
```

El patron se repite en cada metodo. Un metodo sin `usuarioId` en la firma es un
bug, no una excepcion.

## Dos URLs, dos propositos

| Variable | Cuando | Por que |
|---|---|---|
| `DATABASE_URL` | runtime | **pooled**. El pooler de Neon; un solo connection string para toda la app |
| `DATABASE_URL_UNPOOLED` | migraciones | Conexion directa, sin pooler |

Las migraciones **deben** ir por `UNPOOLED`. Correr DDL a traves del pooler en
Neon es una fuente clasica de advisory locks y migraciones colgadas.

El rol de migracion y el de runtime **no son el mismo**: el primero puede DDL,
el segundo solo DML. Verificar antes de escribir la primera migracion.

## Migraciones: inmutables

**Una migracion que ya corrio no se edita nunca.** Se agrega una nueva.

Editar una migracion aplicada produce drift: el entorno de desarrollo tiene el
schema viejo y el de produccion el nuevo, y el fallo aparece semanas despues
con un mensaje que no apunta a la causa. Si el error esta en la migracion
`0003_init`, la correccion es una `0004_fix`, no reescribir la `0003`.

Revisar el estado antes de migrar:

```bash
drizzle-kit generate   # genera el diff como una migracion nueva
drizzle-kit migrate   # aplica
```

## Drizzle: el schema en un lugar

Un solo archivo de schema, un solo cliente. En serverless, el cliente se
construye en una funcion memoizada a nivel de modulo, o cada invocacion abre un
pool nuevo y Neon agota conexiones.

## `numeric` y el resto de tipos

Todo importe es `numeric(16,2)` y llega como **`string`**. Ver la skill
`dinero`: es la regla con el modo de falla mas caro del proyecto.

## Al revisar codigo

- [ ] No hay `enable row level security` ni `create policy`
- [ ] Todo metodo del repositorio recibe `usuarioId` y `carteraId` en la firma
- [ ] Toda query filtra por `usuarioId` y `carteraId`
- [ ] Las migraciones usan `DATABASE_URL_UNPOOLED`
- [ ] El runtime usa `DATABASE_URL` pooled
- [ ] No se edito ninguna migracion ya aplicada
- [ ] El cliente de Drizzle esta memoizado
- [ ] Los `numeric` no llevan `$type<number>()`

## Fuente

`openspec/config.yaml`, `modelo.puml` y `openspec/specs/*/spec.md`. **El spec
manda.**
