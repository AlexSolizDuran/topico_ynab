# Design

## Context

`resumen` es la capacidad #13 y la primera que abarca **varias carteras a la vez**. Las anteriores operan sobre una cartera abierta (`panel`) o comparan periodos de una cartera (`comparativos`). El resumen es global pero no mezcla: agrupa por moneda.

La restriccion que manda sobre el diseño es que no existe tipo de cambio. Un "capital total" que sume MXN y USD seria un numero inventado. Por eso el resumen no produce una cifra unica: produce un grupo por moneda, y el usuario elige cual mira.

## Decisions

### D1: Agregacion por moneda en un repositorio propio
Se implementa `consultarResumenGlobal(db, usuario_id, periodo, meses)` en `src/repos/resumen-global.ts`. Recibe `usuario_id` (sin RLS, el filtro es explicito) y agrupa por `carteras.moneda`. Cada grupo es autocontenido: capital, flujo, series y comercios solo de esa moneda. Los grupos vienen ordenados por moneda para que la vista sea estable.

### D2: La regla del dinero, hasta el final
Los importes viajan como `Dinero` (`string`). Las sumas y agregaciones se resuelven en SQL (`sum`, `coalesce`). Las pocas consolidaciones que cruzan consultas (por ejemplo, unir los renglones mensuales con los dias del calendario) se hacen con `bigint` sobre centimos, via `aCentimos`/`deCentimos`, nunca con `number`. El formateo en pantalla delega en `formatear(importe, moneda)`.

### D3: Las carteras archivadas cuentan
El capital y las series incluyen las carteras archivadas (no eliminadas) del usuario. Archivar no borra historia: el dinero que paso por una cartera archivada sigue siendo dinero. La lista de carteras marca las archivadas para que el usuario entienda de donde sale el patrimonio.

### D4: Series completas, con ceros
La serie mensual cubre 12 periodos y la diaria cubre todos los dias del periodo elegido, incluidos los que no tuvieron movimientos (con ceros). Una serie que salta los huecos miente sobre la forma de la actividad. La serie anual incluye solo los anios con actividad.

### D5: Solo lectura, y el unico control es un filtro
La vista no captura ni edita nada. Su unico control que envia algo es el filtro de periodo, un `form` GET a `/resumen?mes=...` que reejecuta la lectura del servidor. No hay estado de formulario que pueda cambiar un dato, y el componente de la vista se renderiza en servidor en las pruebas.
