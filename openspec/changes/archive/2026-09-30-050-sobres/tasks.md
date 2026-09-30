# Tasks

Estado real al 2026-09-27. Las tareas marcadas `[x]` estan hechas y verificadas; las
marcadas `[ ]` son lo que falta para que este change sea archivable. Ver la nota de
orden al final.

## 1. Tablas y migracion

- [x] 1.1 `src/db/tablas/sobres.ts` con `sobres` y `asignaciones`. Verificar que `pg_tables` lista las dos y que el enum `motivo_de_asignacion` existe
- [x] 1.2 **Sin columna de disponible en `sobres`**, porque se deriva. Verificar con la prueba `no es un dato almacenado: la tabla no tiene columna de disponible`, que recorta el schema y falla si aparece la palabra
- [x] 1.3 `grupo_id` **not null** y con FK a `grupos`, verificado por la prueba que rechaza crear un sobre en un grupo de otra cartera
- [x] 1.4 Indice unico por `(cartera_id, nombre)` e indice por `(cartera_id, orden)`. Verificar que el mismo nombre en otra cartera si se acepta
- [x] 1.5 `motivo` con default `usuario` y el enum de dos valores. Verificar que una asignacion sin motivo explicito es de usuario
- [x] 1.6 `drizzle/0003_sobres.sql` y el journal, con la cadena `0000` a `0003`. Verificar que el arnes de migraciones las aplica en orden

## 2. Formulas compartidas

- [x] 2.1 `src/repos/fragmentos.ts` con `disponibleDeSobre` y `saldoDeCuenta` como unica fuente. Verificar que `listarSobres`, `totalDeGrupo` y `resumenDeCartera` dan el mismo numero para el mismo sobre
- [x] 2.2 `src/repos/filas.ts` normalizando PGlite y `pg`. Verificar que un `total` de la vista y el mismo total del repositorio coinciden
- [x] 2.3 **Corregir el comentario de `src/repos/dinero-suelto.ts:133`.** Afirma que un `SQL` de Drizzle no se puede interpolar dos veces y le echa la culpa de un `-14000.00` que era una expectativa mal calculada. Verificar que la afirmacion se borra y que la prueba sigue verde, porque el refactor a funciones se mantiene por legibilidad y no por necesidad

## 3. Repositorio

- [x] 3.1 `crearSobre`, `buscarSobre`, `listarSobres`, `renombrarSobre`, `reordenarSobre` y `moverSobreDeGrupo`, cada una exigiendo cartera propia. Verificar con pruebas: cartera ajena, cartera archivada y orden no entero
- [x] 3.2 `archivarSobre` exigiendo disponible `0` **en el periodo que manda el formulario**, y rechazando archivar dos veces. Verificar con pruebas: archivar vaciado, archivar recien creado en cero, y rechazar con saldo
- [x] 3.3 `restaurarSobre` y `eliminarSobre`, este ultimo solo sin movimientos. Verificar los dos rechazos por separado, `SobreConSaldo` y `SobreConMovimientos`, porque el consejo al usuario es distinto
- [x] 3.4 `asignarASobre`, `corregirAsignacion`, `taparDesborde` y `listarAsignaciones`. Verificar que corregir y tapar rechazan importe no positivo, y que asignar a un archivado da `SobreArchivado`
- [x] 3.5 `moverEntreSobres` con asignacion negativa `reasignacion` en el origen, **sin tocar `movimientos`**. Verificar con la prueba de que la contraparte es una reasignacion y no un movimiento
- [x] 3.6 `moverEntreSobres` rechaza destino archivado y **permite origen archivado**. Verificar los dos casos, porque es la asimetria de R11
- [x] 3.7 `listarSobresEnNegativo` incluyendo los archivados, y `listarSobresArchivadosConSaldo`. Verificar con la prueba de que archivar el grupo no esconde los desbordes
- [x] 3.8 `crearSobre` y `moverSobreDeGrupo` aceptan `grupo_id: null` y lanzan `SinGrupo`. Verificar con la prueba de que el mensaje dice "grupo" y no es un error de forma
- [x] 3.9 `resumenDeCartera` cruzando `cartera_id` con `usuario_id`. Verificar que con el id de una cartera ajena da error y no una fila de ceros
- [x] 3.10 `avisaDeDesborde` sin tapar nada por su cuenta. Verificar que el aviso no modifica ningun disponible

## 4. Total de grupo

- [x] 4.1 `totalDeGrupo` en `src/repos/grupos.ts`, sumando los disponibles de `fragmentos.ts` y excluyendo los archivados. Verificar con las cuatro pruebas del bloque `el total de un grupo`
- [x] 4.2 **Castear el cero de `coalesce` a `numeric(16,2)`** en `totalDeGrupo`. Sin filas, `coalesce(sum(...), 0)` devuelve el entero `0` y el total llega como `'0'` en vez de `'0.00'`. Verificar que las dos pruebas en rojo pasan: `deja fuera los sobres archivados del grupo` y `no cuenta un sobre de otro grupo ni de otra cartera`

## 5. Entrada y vista

- [x] 5.1 `src/sobres/validacion.ts` con los importes **como texto** y comparacion en `BigInt` contra el tope de `numeric(16,2)`. Verificar que rechaza negativo, cero, decimal y un numero de mas de 14 digitos enteros
- [x] 5.2 `src/sobres/acciones.ts` con 11 Server Actions, todas con sesion y token de proteccion, y el `cartera_id` tomado del servidor y no del formulario. Verificar con la prueba de pagina que un `cartera_id` ajeno no alcanza
- [x] 5.3 `src/components/sobres.tsx` con alta, edicion, asignar, tapar, mover, archivar, eliminar y restaurar. Verificar que el build no arrastra el servidor al cliente
- [x] 5.4 **Exponer la correccion de asignaciones en la UI.** `accionCorregirAsignacion` existe y funciona, pero ningun componente la llama: el requisito `Correccion de una asignacion` esta cubierto en el repositorio y no en la pantalla. Verificar con una prueba de pagina que el importe corregido se ve

## 6. Pagina

- [x] 6.1 Resumen con patrimonio, asignado y dinero suelto, mas el panel de desbordes. Verificar con las pruebas de `tests/sobres/pagina.test.ts`
- [x] 6.2 Total por grupo **fuero** del `<details>`, para que al plegar se oculten los sobres pero no la cifra. Verificar con la prueba de grupo plegado del punto 8.1
- [x] 6.3 Listado de sobres archivados y de archivados con saldo por devoluciones. Verificar con la prueba de que una devolucion a un archivado lo hace reaparecer
- [x] 6.4 Corregir `tests/cuentas/pagina.test.ts`, que mockeaba la pagina y rompio al aparecer el componente de sobres. Verificar que la suite de cuentas sigue verde
- [x] 6.5 **Corregir el comentario del total en la pagina.** Dice que el total vive en el `<summary>` cuando vive en un `<p>` hermano, y dice "sin `open` inicial" cuando el `<details>` lleva `open`. Verificar que el comentario describe lo que el codigo hace

## 7. Trazabilidad

- [x] 7.1 Prueba de **grupo plegado**, el septimo diferido de `grupos`. Verificar que el total queda fuera del `<details>` en el HTML renderizado, y no que dependa del estado de React
- [x] 7.2 Mover los **siete** escenarios de `DIFERIDOS` a `MAPA` en `tests/grupos/escenarios.test.ts`, cada uno con su prueba
- [x] 7.3 Ampliar el escaneo de referencias de `tests/grupos` a `tests/sobres` y usar ruta completa en las referencias, porque `sobres.test.ts` y `grupos.test.ts` comparten nombres de prueba. Verificar que la prueba de que cada referencia apunta a una prueba existente sigue mirando bien
- [x] 7.4 Pruebas de `src/sobres/validacion.ts`. Verificar el recorte de espacios, los limites de longitud y el rechazo de los nombres prohibidos
- [x] 7.5 Pruebas de `src/sobres/acciones.ts`. Verificar que una accion sin sesion no hace nada, que el token de proteccion se exige, y que cada error de dominio llega a la pantalla con su mensaje

## 8. Verificacion

- [x] 8.1 `npx tsc --noEmit` sin errores
- [x] 8.2 `npx vitest run` verde, y en verde las dos pruebas de 4.2
- [x] 8.3 `npm run build` completa
- [x] 8.4 `openspec validate --specs --strict` pasa con las 12 capacidades, y el change valida en estricto. Resuelto el 2026-09-30: el CLI se lanzo con `npx @fission-ai/openspec@latest` —`@fission-ai/openspec` ya no esta en el global de npm, y `AGENTS.md` lo da por instalado—. 12 passed / 0 failed, y `validate 050-sobres --strict` responde `Change '050-sobres' is valid`. Con `skip_specs: true` no hay deltas que revisar

## Nota sobre el orden

Este change se redacto **despues** de implementarlo. Las tareas `[x]` reflejan lo que
ya estaba; las `[ ]` son el trabajo real que falta. La primera version de estas tareas
deberia haberse escrito antes de la primera linea de codigo, con el gate de revision
humana en el medio. Desde `060-transacciones` el ciclo se respeta completo.
