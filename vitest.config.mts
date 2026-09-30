import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/** Un modulo vacio, para sustituir a `server-only` en las pruebas. */
const MODULO_VACIO = fileURLToPath(new URL('./tests/helpers/vacio.ts', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    /**
     * Los dos patrones, y no solo `.ts`: una prueba de vista se escribe en JSX, igual que
     * el componente que dibuja. Escribirla con `createElement` solo para poder dejarla en
     * `.ts` hace la prueba mas dificil de leer que lo que verifica.
     */
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      /**
       * `server-only` lanza al importarse fuera de un Server Component, que es
       * exactamente lo que quiere en el build y exactamente lo que estorba aqui:
       * las pruebas son codigo de servidor. Se apunta a un modulo vacio para que
       * los archivos marcados puedan importarse sin perder la proteccion del
       * build.
       */
      'server-only': MODULO_VACIO,
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
