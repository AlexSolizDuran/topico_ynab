# Tasks

## 1. Proyecto y dependencias

- [x] 1.1 Crear `package.json` con next 16.3.6, react 19.3.0, drizzle-orm 0.45.3, pg, zod y @node-rs/argon2 2.2.1 en dependencias, y typescript 5, tailwindcss 4.3.3, drizzle-kit 0.31.11, vitest 5.0.2 y @electric-sql/pglite 0.5.8 en desarrollo, con scripts `dev`, `build`, `lint`, `typecheck` y `test`. Verificado con `npm install` y `npm run typecheck`
- [x] 1.2 Crear `tsconfig.json` con `strict`, alias `@/*` hacia `src/*` y `moduleResolution: bundler`, y `next.config.ts` con `serverExternalPackages` para el modulo nativo de argon2 y `pg`. Verificado: `tsc --noEmit` pasa sin errores
- [x] 1.3 Crear `.env.example` con placeholders de `DATABASE_URL` y `DATABASE_URL_UNPOOLED` y `.gitignore` que excluye `.env*` menos `.env.example`, `node_modules`, `.next` y `drizzle/meta`. Verificado: `git check-ignore` marca `.env.local` y `git add -n .env.example` lo ofrece, o sea no esta ignorado

## 2. La regla del dinero

- [x] 2.1 Crear `src/dinero.ts` con `export type Dinero = string` y `formatear(importe, moneda)` que compone el importe a partir de los digitos exactos del string. Verificado con `tests/dinero.test.ts`: 12 pruebas, incluida la que demuestra que `1234567890123456.78` conserva los centavos donde `Number` los pierde
- [x] 2.2 Prohibir la conversion numerica en el proyecto: `tests/regla-del-dinero.test.ts` lee el codigo fuente de `src/` y falla si aparece `parseFloat`, `parseInt`, `Number(`, `$type<number>()` o `toFixed`, ignorando comentarios. Verificado: pasa con el codigo actual
- [x] 2.3 Describir por que `formatear` no pasa el string a `Intl.NumberFormat`: la API convierte su argumento a numero internamente, y deformaria la cifra mostrada en magnitudes grandes. La composicion toma de `Intl` solo el simbolo, los separadores y el orden de las partes. Verificado con las pruebas de `formatear`, que comparan contra `Intl` en el rango exacto y fijan los digitos fuera de el

## 3. Datos

- [x] 3.1 Crear `src/db/schema.ts` como punto unico de ampliacion y `src/db/cliente.ts` con el cliente Drizzle memoizado a nivel de modulo, con respaldo en `globalThis` para el hot reload, `max: 1` por invocacion serverless, y error explicito si falta `DATABASE_URL`. Verificado: el archivo compila y el cliente se construye en la llamada, no en el import, para que las pruebas puedan importar repositorios sin la variable
- [x] 3.2 Definir `src/db/tipos.ts` con `type Base`, el tipo de cliente que aceptan los repositorios. Los repositorios reciben el cliente como parametro en vez de leer el global, que es lo que permite que el mismo codigo corra contra Neon y contra PGlite. Los fragmentos SQL de `src/db/derivados.ts` se crean en `050-sobres`, no aca: referencian tablas que todavia no existen y no se pueden tipar ni probar hasta que existan
- [x] 3.3 Crear `drizzle.config.ts` con `schema: './src/db/schema.ts'`, `out: './drizzle'` y `dialect: 'postgresql'`, usando `DATABASE_URL_UNPOOLED` para el generador. Verificado con `npx drizzle-kit generate`: reporta 0 tablas y ningun cambio

## 4. Interfaz base

- [x] 4.1 Crear `src/app/globals.css` con el tema de Tailwind 4 por `@theme` transcrito del diseno de Stitch: Plus Jakarta Sans para cifras, Inter para texto, `#2563eb` primario, `#10b981` positivo, `#ef4444` negativo, lienzo `#f8fafc`, borde `#e2e8f0`, radio de tarjeta y tres niveles de sombra. La regla global `cifra` aplica `tabular-nums` a todo importe. Verificado: el build resuelve las utilidades del tema
- [x] 4.2 Crear `src/app/layout.tsx` con las dos tipografias via `next/font` (autoalojadas, sin peticion a un tercero ni CLS) y `src/app/page.tsx` como andamiaje. Verificado con `npm run build`: el build de Next.js completa y prerenderiza
- [x] 4.3 Preparar el despliegue en Vercel: el build tiene que completar en el build de Vercel, no puede haber rutas locales, y las dos variables de conexion se documentan para el panel. Verificado al final del proyecto con `npm run build` limpio y `next build` sin referencias al entorno de desarrollo

## 5. Arnés de pruebas

- [x] 5.1 Crear `vitest.config.mts` con el entorno `node`, alias `@/*` y `include: ['tests/**/*.test.ts']`, excluyendo solo los modulos de `tests/helpers/`. Verificado con `npm test`: corre y reporta pruebas
- [x] 5.2 Crear `tests/helpers/pg.ts` con `crearBaseDePruebas()` que levante una instancia de PGlite nueva por llamada y aplique en orden los archivos `.sql` de `drizzle/`, devolviendo el cliente de Drizzle. Verificado con `tests/arnes-pg.test.ts`: dos llamadas dan instancias distintas y una consulta a `pg_tables` responde
Las fabricas de datos de prueba no son de este change: se crean en `010-auth` con `usuarios`, `carteras` y `sesiones`, y se amplia change por change a medida que aparecen las tablas. Una fabrica sin tabla contra la que escribir no se puede probar.

## 6. Integración con OpenSpec

- [x] 6.1 Confirmar que `openspec status --change 000-base` reporta `specs` como `skipped` y `design` y `tasks` como completados, y que `openspec validate --specs --strict` sigue pasando con 12 capacidades. Verificado con `openspec status --json`
- [x] 6.2 Confirmar que `openspec validate --changes --strict` acepta el change con `skip_specs: true` y cero deltas. Verificado: `1 passed, 0 failed` con el aviso de que el cero de deltas fue aceptado
