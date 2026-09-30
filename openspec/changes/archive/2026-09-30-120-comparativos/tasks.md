# Tasks

4 requisitos, 13 escenarios.

## 1. Repositorio analítico de comparativos

- [x] 1.1 Tipos e interfaces en `src/repos/comparativos.ts` (`ElementoComparativa`, `SobreComparativo`, `GrupoComparativo`, `DatosComparativo`, `ConfiguracionUmbral`, `Variacion`).
- [x] 1.2 Lógica analítica de cálculo de diferencias, direcciones ('aumento' | 'disminucion' | 'sin_cambio'), cálculo de porcentajes y evaluación de umbral de relevancia.
- [x] 1.3 Implementación de `consultarComparativo` con agregación SQL por sobre, grupo y periodo, excluyendo movimientos de traspaso, y cálculo respecto al periodo de referencia.
- [x] 1.4 Pruebas del repositorio en `tests/comparativos/repositorio.test.ts`.

## 2. Componentes de UI de comparativos

- [x] 2.1 Componente `VistaComparativos` en `src/components/comparativos.tsx` con selectores de periodos, selección de periodo de referencia, selector de umbral ajustable, tabla de grupos y sobres con diferencias destacadas, y mensaje de ausencia de variaciones relevantes.
- [x] 2.2 Pruebas de vista en `tests/comparativos/vista.test.tsx`.

## 3. Integración en página de la app

- [x] 3.1 Crear página `src/app/(app)/comparativos/page.tsx` conectada a la cartera activa y sesión.

## 4. Verificación completa y matriz de escenarios

- [x] 4.1 Pruebas de trazabilidad en `tests/comparativos/escenarios.test.tsx` para los 13 escenarios de los 4 requisitos.
- [x] 4.2 Comprobar que `npm run typecheck` pasa sin errores.
- [x] 4.3 Validar con `npx @fission-ai/openspec validate --all`.
