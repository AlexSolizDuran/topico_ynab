# Proposal

## Why

El repositorio tiene el diseño completo — 12 capacidades, 78 requisitos, 257
escenarios, todos validados — y cero código. No hay `package.json`, ni
dependencias, ni una forma de correr un solo escenario. Los 12 changes
siguientes materializan capacidades contra esos specs, pero ninguno puede
arrancar sin una base sobre la que Corran: sin runtime, sin acceso a datos, sin
definición del tipo de dinero y sin forma de verificar nada.

Este change no agrega comportamiento. Construye la base y la verifica.

## What Changes

- Inicializa Next.js 16 (App Router) con React 19, TypeScript 5 y Tailwind CSS 4
  en un único proyecto, sin backend separado: el runtime, las Server Actions y
  el acceso a datos viven acá.
- Define el tipo `Dinero` y el formateo de importes, de modo que ningún importe
  pueda escribirse como `number` por error de tipeo.
- Define los fragmentos SQL de los valores derivados —saldo de cuenta,
  disponible de sobre, dinero suelto, patrimonio— en un solo lugar, para que
  ningún cálculo derivado se escriba dos veces ni se haga en JavaScript.
- Configura el cliente de base de datos memoizado a nivel de módulo y las dos
  variables de conexión con sus propósitos distintos.
- Monta el arnés de pruebas sobre PGlite, que corre las migraciones reales, y
  deja las factories de datos de prueba.
- Transcribe al tema de Tailwind los tokens del sistema de diseño de Stitch, de
  modo que las vistas que vengan en los changes siguientes ya tengan la
  jerarquía visual resuelta.
- Deja `.env.example` con placeholders y `.gitignore` que excluye los secretos.

## Capabilities

### New Capabilities

Ninguna. Este change no describe comportamiento de usuario.

### Modified Capabilities

Ninguna. Ningún requisito de `openspec/specs/` cambia; este change construye la
infraestructura sobre la que los 12 changes siguientes implementarán esos
requisitos sin tocarlos.

## Impact

- **Archivos nuevos**: `package.json`, `tsconfig.json`, `next.config.ts`,
  `postcss.config.mjs`, `drizzle.config.ts`, `vitest.config.ts`,
  `.env.example`, `.gitignore`
- **Código nuevo**: `src/dinero.ts` (tipo y formateo), `src/db/cliente.ts`
  (conexión), `src/db/derivados.ts` (SQL derivado), `src/db/schema.ts` (vacío
  hasta que 010 agregue sus tablas), `src/app/` (layout raíz y página de
  arranque)
- **Dependencias**: next, react, drizzle-orm, pg, zod, @node-rs/argon2; en
  desarrollo typescript, tailwindcss, drizzle-kit, vitest y @electric-sql/pglite
- **Sin impacto en specs**: `openspec/specs/` no se toca. Se valida antes y
  después para demostrar que sigue intacto.
