import process from 'node:process'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

process.loadEnvFile()

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('Falta DATABASE_URL_UNPOOLED o DATABASE_URL')
}

const pool = new Pool({ connectionString })
const db = drizzle(pool)

try {
  await migrate(db, {
    migrationsFolder: './drizzle',
    migrationsSchema: 'drizzle',
  })
  console.log('Migraciones aplicadas correctamente.')
} finally {
  await pool.end()
}
