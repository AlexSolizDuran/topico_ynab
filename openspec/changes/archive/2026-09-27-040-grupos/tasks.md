# Tasks

## 1. Tabla

- [x] 1.1 Crear `grupos` en `src/db/tablas/grupos.ts` con `cartera_id`, `nombre`, `archivado`, `orden` y `creado_en`, sin `eliminado_en`. Verificar que `pg_tables` lista `grupos` y que la migracion aplica
- [x] 1.2 **Sin columna de total ni de disponible**, porque el total se deriva de los sobres. Verificar con una prueba que recorta los comentarios y falla si aparece `total`
- [x] 1.3 **Sin columna de padre**, porque los grupos no se anidan, y sin autorreferencia. Verificar con una prueba que falla si aparece `grupo_padre` o un `references(() => grupos`
- [x] 1.4 Indice unico por `(cartera_id, nombre)` e indice por `(cartera_id, orden)`. Verificar que el mismo nombre en otra cartera si se acepta
- [x] 1.5 Exportar `grupos` en `src/db/schema.ts` y anadir la fabrica `crearGrupo` a `tests/helpers/fabricas.ts`

## 2. Repositorio

- [x] 2.1 `crearGrupo` exigiendo cartera propia y no archivada, con el nombre unico en la cartera. Verificar con pruebas: los cuatro casos, cartera ajena y cartera archivada
- [x] 2.2 `listarGrupos` y `listarGruposArchivados`, cada una con su filtro, ordenadas por `orden` y luego por `id`. Verificar que un grupo archivado no sale en la lista activa y si en la de archivados
- [x] 2.3 `buscarGrupo` cruzando el grupo con la cartera del usuario. Verificar que un grupo de otra cartera da `GrupoNoExiste`
- [x] 2.4 `cambiarNombreGrupo`, **distinguiendo** el nombre ocupado del grupo ajeno, para no confirmar que el id existe. Verificar con pruebas: los dos errores
- [x] 2.5 `cambiarOrdenGrupo` rechazando un orden negativo o no entero **en el repositorio**. Verificar con pruebas: `-1`, `1.5` y `NaN` se rechazan y el grupo no se mueve
- [x] 2.6 `archivarGrupo` sin precondicion de saldo, y rechazando archivar dos veces. Verificar que archivar deja el grupo legible por id
- [x] 2.7 `restaurarGrupo`, y rechazando restaurar lo que no esta archivado. Verificar con pruebas

## 3. Entrada

- [x] 3.1 `validarGrupo` con nombre de 1 a 60 caracteres, recortando espacios. Verificar con pruebas: vacio, largo, y que se recorten
- [x] 3.2 `validarGrupo` rechaza `grupo_padre`, `padre_id`, `grupo_id_padre` y `contiene` **antes** del esquema, con un mensaje que explique que no se anidan. Verificar con pruebas, incluida la de que un nombre invalido no tapa el error de anidamiento
- [x] 3.3 `validarOrden` con `exigirEntero` y no con `z.coerce.number()`. Verificar con pruebas: acepta cero y `"3"`, rechaza negativo, decimal, texto y vacio

## 4. Vista

- [x] 4.1 `src/grupos/acciones.ts` con alta, renombre, orden, archivado y restaurado, todas con sesion y token de proteccion, y el `cartera_id` del servidor. Verificar que el build no arrastra el servidor al cliente
- [x] 4.2 `src/components/grupos.tsx` con plegar y desplegar por `useState`, sin Server Action. Verificar que no hay accion de plegado
- [x] 4.3 Anadir la seccion de grupos a `src/app/(app)/cartera/[cartera]/page.tsx`. Verificar que el build sigue pasando

## 5. Verificación

- [x] 5.1 Corregir el arnes de migraciones, que ordenaba el **contenido** del `.sql` y no su **nombre**. Verificar con una prueba que el orden es el del prefijo numerico y que no hay prefijos repetidos
- [x] 5.2 Anadir la trazabilidad de `grupos` con `MAPA` y `DIFERIDOS`, y exigir que la union de ambos sea exactamente los 10 escenarios del spec, con `change` y `motivo` en cada diferido. Verificar que falla si un escenario queda fuera de los dos lados
- [x] 5.3 Verificar que `openspec validate --specs --strict` sigue pasando con 12 capacidades, que el change es valido en estricto, que `npm run typecheck` no reporta errores, que `npm test` pasa y que `npm run build` completa
