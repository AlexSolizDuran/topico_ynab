# Tasks

6 requisitos, 23 escenarios.

## 1. Esquema y migración

- [x] 1.1 `src/db/tablas/metas.ts` con la tabla `metas`, enum `estado_meta` ('activa', 'completada', 'abandonada'), checks de importe positivo e índice único parcial `metas_sobre_activa_unica` sobre `(sobre_id) WHERE estado = 'activa'`.
- [x] 1.2 Exportar `metas` y sus tipos en `src/db/schema.ts`.
- [x] 1.3 `drizzle/0006_metas.sql` con el DDL correspondiente a la nueva tabla, tipos e índices.
- [x] 1.4 Verificar que `tests/arnes-pg.test.ts` aplica de `0000` a `0006` en orden.

## 2. Validación de entrada

- [x] 2.1 `src/metas/validacion.ts` con esquemas Zod para alta de meta (monto positivo con formato dinero, fecha límite opcional válida).
- [x] 2.2 Validaciones de negocio: comprobación de sobre existente, no archivado y perteneciente al usuario.
- [x] 2.3 Pruebas de validación en `tests/metas/validacion.test.ts`.

## 3. Repositorio de metas y lógica de avance

- [x] 3.1 `src/repos/metas.ts` con `crearMeta`, `obtenerMetaActiva`, `listarHistorialMetas`, `abandonarMeta` y `completarMeta`.
- [x] 3.2 Lógica de cálculo de avance: `restante`, `porcentaje`, `ritmoPorPeriodo` y `estadoVisual` ('cumplida', 'en_camino', 'retrasada') respetando la regla del dinero (cadenas y BigInt).
- [x] 3.3 Validación en `completarMeta`: rechazo si `disponible < monto_objetivo`.
- [x] 3.4 Rechazo de segunda meta activa si ya existe una activa en el sobre.
- [x] 3.5 Pruebas unitarias de cálculos y repositorio en `tests/metas/repositorio.test.ts` y `tests/metas/calculos.test.ts`.

## 4. Integración con sobres y archivado

- [x] 4.1 Actualizar `archivarSobre` en `src/repos/sobres.ts` para marcar como `abandonada` la meta activa del sobre al ser archivado.
- [x] 4.2 Impedir creación de metas en sobres archivados.
- [x] 4.3 Pruebas de integración sobre sobre archivado y devoluciones posteriores en `tests/metas/archivado.test.ts`.

## 5. Server Actions

- [x] 5.1 `src/metas/acciones.ts` con `accionCrearMeta`, `accionCompletarMeta` y `accionAbandonarMeta`.
- [x] 5.2 Autenticación obligatoria con `exigirSesion` y protección anti-CSRF con `exigirTokenProteccion`.
- [x] 5.3 Pruebas de Server Actions en `tests/metas/acciones.test.ts`.

## 6. Componentes de interfaz e integración

- [x] 6.1 `src/components/metas.tsx` con tarjeta de meta activa, barra de progreso, badges de estado, formulario de fijar meta, botones de completar/abandonar e historial.
- [x] 6.2 Integración en la vista de cartera `src/app/(app)/cartera/[cartera]/page.tsx` y en filas de sobres.
- [x] 6.3 Pruebas de interfaz en `tests/metas/vista.test.tsx`.

## 7. Verificación completa y escenarios

- [x] 7.1 `tests/metas/escenarios.test.ts` mapeando y verificando los 23 escenarios de `openspec/specs/metas/spec.md`.
- [x] 7.2 Ejecutar `npm run typecheck` y suite completa con Vitest.
- [x] 7.3 Validar con `openspec validate --all`.
