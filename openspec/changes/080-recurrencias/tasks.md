# Tasks

5 requisitos, 18 escenarios. El orden sigue las dependencias reales: primero la base de datos y migracion, luego la validacion, el repositorio y motor de materializacion, las Server Actions y componentes UI, y finalmente las pruebas y trazabilidad completa.

## 1. Esquema y migración

- [ ] 1.1 `src/db/tablas/recurrencias.ts` con `reglasRecurrentes`, los enums `tipoReglaRecurrente` y `frecuenciaRecurrencia`, y exportar en `src/db/schema.ts`.
- [ ] 1.2 Añadir `regla_id` a `movimientos` en `src/db/tablas/cuentas.ts` con FK a `reglas_recurrentes(id)` ON DELETE SET NULL e indice parcial sobre vivos.
- [ ] 1.3 `drizzle/0005_recurrencias.sql` con la definicion SQL y relacion con `movimientos`.
- [ ] 1.4 Verificar que `tests/arnes-pg.test.ts` aplica de `0000` a `0005` en orden.

## 2. Validación de entrada

- [ ] 2.1 `src/recurrencias/validacion.ts` con validacion de importe positivo como texto, dia valido (1..31) y mes obligatorio cuando la frecuencia sea anual.
- [ ] 2.2 Validar que la cuenta y el sobre pertenezcan a la misma cartera.

## 3. Repositorio y motor de materialización

- [ ] 3.1 `src/repos/recurrencias.ts` con operaciones CRUD para reglas recurrentes: crear, listar, obtener, editar, alternar estado (activa/inactiva) y eliminar.
- [ ] 3.2 Algoritmo de calculo de ocurrencias segun frecuencia (diaria, semanal, mensual, anual) sin generar fechas anteriores a `fecha_inicio`.
- [ ] 3.3 Motor `materializarRecurrencias` que inserta movimientos marcados con `origen = 'recurrente'` y `regla_id`, aplicando signo negativo para gastos y positivo para ingresos.
- [ ] 3.4 Prevencion de duplicados: omitir si ya existe un movimiento vivo con igual regla/cuenta/monto/fecha, y permitir regenerar si el previo fue eliminado logicamente.
- [ ] 3.5 Soporte de ausencias: generar todos los periodos pendientes desde `fecha_inicio` hasta `fecha_hasta` e informar de la cantidad y periodos generados.
- [ ] 3.6 Inmutabilidad historica: editar o desactivar una regla no altera movimientos ya generados previamente.

## 4. Server Actions y componentes

- [ ] 4.1 `src/recurrencias/acciones.ts` con Server Actions protegidas por sesion y token de proteccion: crear, editar, alternar estado, eliminar y materializar.
- [ ] 4.2 `src/components/recurrencias.tsx` con formulario de regla, lista de reglas activas e inactivas y aviso de movimientos generados.
- [ ] 4.3 Integrar la seccion de recurrencias y materializacion en `src/app/(app)/cartera/[cartera]/page.tsx`.

## 5. Pruebas y trazabilidad

- [ ] 5.1 `tests/recurrencias/validacion.test.ts` cubriendo dias invalidos, anual sin mes, importes no positivos y carteras distintas.
- [ ] 5.2 `tests/recurrencias/repositorio.test.ts` cubriendo CRUD e inmutabilidad historica.
- [ ] 5.3 `tests/recurrencias/materializacion.test.ts` cubriendo generacion puntual, ausencias de varios meses, prevencion de duplicados y regeneracion tras borrado.
- [ ] 5.4 `tests/recurrencias/acciones.test.ts` cubriendo autorizacion, token y errores de dominio.
- [ ] 5.5 `tests/recurrencias/vista.test.tsx` cubriendo el renderizado del formulario, listas y avisos.
- [ ] 5.6 `tests/recurrencias/escenarios.test.ts` con el mapa de cobertura de los 18 escenarios de `openspec/specs/recurrencias/spec.md`.

## 6. Verificación

- [ ] 6.1 `npm run typecheck` sin errores.
- [ ] 6.2 `npm run test` verde en todas las suites sin regresiones.
- [ ] 6.3 `npm run build` completa con exito.
- [ ] 6.4 Archivar `080-recurrencias`.
