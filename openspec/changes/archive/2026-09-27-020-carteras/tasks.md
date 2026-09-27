# Tasks

## 1. Moneda y aislamiento

- [x] 1.1 Crear `src/carteras/monedas.ts` validando la FORMA del codigo (3 letras mayusculas) en vez de una lista cerrada, mas `MONEDAS_CONOCIDAS` para el selector, y `exigirMismaMoneda(una, otra)` que lanza `MonedaDistinta` nombrando las dos. Verificar con pruebas: dos carteras con la misma moneda pasan, dos con distinta lanzan con las dos monedas en el mensaje
- [x] 1.2 Anadir `cambiarNombre` a `src/repos/carteras.ts` y `exigirMonedaNoCambiada` a `carteras/monedas.ts`, que lanza `MonedaInmutable` con un mensaje que explica que la moneda solo se define al crear. Verificar con pruebas: el nombre cambia, la moneda no, y el mensaje dice por que
- [x] 1.3 Verificar que ninguna funcion del repositorio escribe en `carteras.moneda` despues de crear. Verificar con una prueba que lee el fuente y falla si aparece un `set` con `moneda`

## 2. Crear, editar y listar

- [x] 2.1 Completar `crearCartera` con validacion de nombre no vacio, moneda valida y nombre unico dentro del usuario. Verificar con pruebas: creacion valida, nombre repetido rechazado, nombre vacio rechazado, moneda invalida rechazada
- [x] 2.2 Completar `listarCarteras` separando activas de archivadas, y anadir `contarCarteras`. Verificar con pruebas: una cartera archivada no aparece en la lista de activas pero si en la de archivadas
- [x] 2.3 Anadir `archivarCartera` y `restaurarCartera`, con la precondicion de saldos en `carteras/saldos.ts`. Verificar que archivar marca `archivada` y que restaurar la devuelve, y que `restaurar` sobre una cartera ya activa es un error
- [x] 2.4 Anadir `operarSobreCartera`, que rechaza con `CarteraArchivada` cuando `archivada` es verdadera, y usarla en todas las operaciones de escritura. Verificar con pruebas: escribir en una cartera archivada se rechaza, en una activa pasa

## 3. Propiedad de cuentas y sobres

- [x] 3.1 Crear `src/carteras/propiedad.ts` con `carteraDeCuenta` y `exigirMismaCartera`, que rechaza mezclar una cuenta y un sobre de carteras distintas. Verificar con pruebas: misma cartera pasa, carteras distintas lanzan nombrando ambas
- [x] 3.2 Dejar `carteraDeCuenta` anotado como el metodo que deduce la cartera del movimiento a partir de su cuenta, sin que el movimiento la declare. Verificar con una prueba que el tipo de movimiento no tiene campo de cartera

## 4. Vista de carteras

- [x] 4.1 Crear `src/carteras/validacion.ts` con el esquema de entrada de cartera y el de archivo. Verificar con pruebas de los rechazos
- [x] 4.2 Crear `src/carteras/acciones.ts` con las Server Actions de crear, renombrar, archivar y restaurar, con `'use server'` y translateindo errores de dominio a resultados por campo. Verificar que el build no arrastra el servidor al cliente
- [x] 4.3 Crear `src/app/(app)/carteras/page.tsx` con la lista de carteras: cada una con nombre, etiqueta de moneda y boton de entrada; mas el formulario de nueva cartera con selector de moneda. Verificar que compila y que el panel redirige aca cuando hay mas de una cartera
- [x] 4.4 Mostrar en la vista que las carteras no se suman, sin ningun total combinado en el DOM. Verificar con una prueba que la pagina no contiene la suma de dos carteras

## 5. Verificación

- [x] 5.1 Anadir el mapa de trazabilidad de `carteras` con sus 15 escenarios, declarando explicitamente cuales quedan para `050-sobres` y por que. Verificar que el conteo coincide con el spec
- [x] 5.2 Verificar que `openspec validate --specs --strict` sigue pasando con 12 capacidades, que `npm run typecheck` no reporta errores, que `npm test` pasa y que `npm run build` completa
