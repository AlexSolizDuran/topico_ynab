import { defineConfig } from 'drizzle-kit'

/**
 * Migraciones por `DATABASE_URL_UNPOOLED` (pooled para el runtime).
 *
 * El generador de drizzle-kit solo lee el schema: no abre conexion. El pooler
 * importa para `drizzle-kit migrate`, que si corre DDL.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? '',
  },
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
  strict: true,
  verbose: true,
})
