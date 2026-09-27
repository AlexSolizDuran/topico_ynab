# App de finanzas personales — prompts para Google Stitch

## Contexto que va en CADA prompt

> App web responsiva de finanzas personales con sobres de presupuesto
> (metodo YNAB). Un usuario lleva sus cuentas, reparte el dinero en sobres
> con nombre y registra cada gasto. Todo esta en espanol (Mexico).
>
> **Conceptos que la interfaz debe dejar claros:**
> - **Patrimonio** = suma de disponibles de sobres + dinero suelto
> - **Dinero suelto** = lo que hay en las cuentas sin asignar a ningun sobre
> - **Disponible de un sobre** = dinero que le pusiste menos lo que gastaste
> - Un sobre puede quedar **negativo** (te pasaste). Se muestra en rojo
>   y el sistema **no lo corrige**: solo avisa que hay dinero suelto
> - Las cuentas son de 4 tipos: corriente, ahorro, efectivo y
>   **credito**. El credito es deuda: su saldo es **negativo**
> - Los meses no reinician saldos. Lo que sobra en marzo sigue en abril
> - Las carteras son contenedores independientes con su propia moneda.
>   Solo se ve una cartera a la vez y **nunca se suman entre carteras**
>
> **Sistema visual:**
> - Fondo claro, tarjetas blancas, mucho espacio en blanco
> - Tipografia sans-serif, tamano grande y legible para numeros
> - Los numeros van alineados a la derecha, con cifras tabulares
> - Verde = disponible positivo. **Rojo = negativo o desborde.**
>   Gris = archivado. Azul = acciones y enlaces
> - Bordes redondeados suaves, sombras muy sutiles
> - Responsive: en movil las listas se vuelven tarjetas apiladas;
>   en escritorio, tablas con columnas
> - **Accesible:** contraste alto, nunca solo color para transmitir
>   informacion (siempre icono o texto junto al color), navegacion
>   por teclado, etiquetas en todos los campos de formulario
> - Iconos de linea, grosor uniforme, estilo outline

---

# TANDA 1 — Vistas criticas

> Disena estas 5 pantallas. Son el corazon de la app. Todo lo que se
> disene despues debe seguir esta misma direccion visual.

## 1.1 — Iniciar sesion

Formulario centrado en una tarjeta angosta, sobre fondo con degradado
sutil o panel de color.

**Contenido:**
- Logotipo o nombre de la app arriba
- Campo "Usuario"
- Campo "Contrasena" con boton de mostrar/ocultar
- Boton principal "Entrar"
- Enlace "Olvidaste tu contrasena?" (aunque aun no funcione, se muestra)
- Texto pequeno: "No tienes cuenta? Registrate"

**Estados a disenar:** boton en carga al enviar.

**No incluir:** registro, recuperacion de contrasena, redes sociales.

---

## 1.2 — Lista de carteras

Primera pantalla despues de entrar. Muestra las carteras como tarjetas
separadas, una por renglon.

**Cada tarjeta muestra:**
- Nombre de la cartera ("Mexico", "USA")
- Etiqueta con el codigo de moneda (MXN, USD)
- Patrimonio de esa cartera, en su propia moneda
- Un pequeno desglose: "Disponible en sobres" y "Dinero suelto"
- Boton o flecha para entrar

**Encabezado:** nombre de la persona, su avatar, y un icono de
configuracion.

**Si solo hay una cartera:** se puede abrir directo al panel y esta vista
solo se usa al crear una segunda. Muestra ambas variantes.

**Nuevo:** boton "+ Nueva cartera" que abre un formulario con nombre y
selector de moneda.

**Restriccion importante:** nunca sumar carteras ni mostrar un total
combinado. Cada una vive aislada.

---

## 1.3 — Panel: pestana Resumen

**Barra superior:** selector de cartera (permite cambiar a otra), nombre
del mes actual, y un icono de ajustes.

**Bloque 1 — Patrimonio (lo mas destacado)**
- Cifra grande y centrada
- Etiqueta "Patrimonio"
- Debajo, en letra pequena: "= X en sobres + Y sin asignar"
  (seccion desplegable que explica el calculo)

**Bloque 2 — Dinero suelto**
- Cifra destacada, con accion primaria "Asignar"
- Si es negativo, en rojo, con el texto "Asignaste mas de lo que tienes"

**Bloque 3 — Cuentas**
- Lista compacta: nombre, tipo como icono, saldo alineado a la derecha
- Cuentas de credito en rojo cuando estan en deuda
- Total de cuentas al pie
- Enlace "Ver todas las cuentas"
- Las cuentas archivadas van en una seccion colapsada al final

**Bloque 4 — Sobres**
- Agrupados por grupo (Necesidades, Deseos, Ahorros) con pliegables
- Cada sobre: nombre, disponible, y una barra de progreso discreta
- Sobres negativos en rojo y ordenados primero
- Total por grupo y total general
- Enlace "Ver todos los sobres"

**Navegacion inferior (movil) o lateral (escritorio):** Resumen, Mes,
Comparar, Patrimonio, Movimientos.

---

## 1.4 — Sobres

Lista completa de sobres, agrupada por grupo.

**Encabezado:** total de la cartera, buscador, y boton "+ Nuevo sobre".
Filtros: por grupo, por estado (todos / en rojo / vacios / archivados).

**Cada sobre muestra:**
- Nombre y color de acento
- Disponible grande y a la derecha
- Barra de progreso
- Meta visual si tiene meta asignada: "12,400 de 20,000"
- Etiqueta "En rojo" si esta en negativo, con el monto
- Boton de menu contextual: editar, archivar, borrar

**Interaccion clave:** al tocar un sobre negativo, ofrecer "Tapar
desborde" con un selector de origen (dinero suelto u otro sobre) y
monto. **Nunca se hace automatico.**

**Agrupacion:** los grupos muestran su total. Se pueden plegar.
El orden de los grupos es personalizable.

**Vacios:** los sobres con 0 disponibles van atenuados, no ocultos.
Los archivados en una seccion aparte al final.

---

## 1.5 — Movimientos

Lista de todo el movimiento, con filtros.

**Barra de filtros:**
- Busqueda por texto (busca en descripcion y comercio)
- Filtro por cuenta
- Filtro por sobre
- Filtro por tipo (gasto / ingreso / traspaso)
- Filtro por rango de fechas
- Boton para limpiar filtros

**Cada fila muestra:** icono de categoria o comercio, descripcion,
nombre del sobre o la etiqueta "Sin asignar" en ambar, cuenta, y monto
a la derecha con su color.

**"Sin asignar"** (sobre_id nulo) debe ser visible y accionable: un
boton "Asignar sobre" en la fila.

**Encabezado:** total gastado, total ingresado, y diferencia, del periodo
filtrado.

**Agrupar por:** dia, con la fecha como encabezado de seccion y un
subtotal diario.

**Traspasos:** se muestran en gris, marcados con icono de doble flecha,
y sin sobre porque no afectan sobres.

---

# TANDA 2 — Vistas de captura

> Mismas reglas visuales que la tanda 1. Prioriza formularios claros
> sobre lo decorativo.

## 2.1 — Crear / editar cuenta

Formulario en panel lateral (escritorio) u hoja inferior (movil).

**Campos:**
- Nombre
- Tipo: selector de 4 opciones con icono y descripcion corta
  (Corriente: "Tu dinero del dia a dia" / Ahorro: "Dinero guardado" /
  Efectivo: "Billetes y monedas" / Credito: "Tarjeta, es deuda")
- Saldo inicial, con nota explicativa: "Lo que hay en la cuenta ahora.
  Los saldos futuros se calculan solos."
- Orden de aparicion

**Botones:** Guardar / Cancelar.

**Validacion:** nombre requerido, no duplicado dentro de la cartera.

---

## 2.2 — Crear / editar sobre

**Campos:**
- Nombre
- Grupo: selector con opcion de crear uno nuevo
- Orden

**Seccion opcional "Convertir en meta":**
- Interruptor para activarlo
- Monto objetivo
- Fecha limite

**Vista previa en vivo:** al escribir el nombre, mostrar una tarjeta con
como se vera el sobre en la lista.

**Cuando el sobre ya existe y tiene movimientos:** mostrar un aviso
claro de que archivar exige que el disponible llegue a 0, con boton
para "vaciar sobre" que abre el flujo de mover dinero.

---

## 2.3 — Crear / editar movimiento

El formulario mas usado de la app. Tiene que ser rapidisimo.

**Campos:**
- Tipo: Gasto / Ingreso (segmentado, con Gasto por defecto)
- Monto: campo numerico grande y prominente
- Cuenta: selector con saldo actual de cada una
- Sobre: selector con los sobres del grupo actual
- "Sin asignar" como opcion valida, claramente marcada
- Fecha: por defecto hoy, con selector de calendario
- Descripcion
- Comercio (opcional)

**Diseno:**
- El monto es el elemento visual dominante
- El selector de sobre muestra el disponible actual de cada opcion,
  para que sepas si alcanza
- Sobres negativos marcados en rojo en el selector

**Acciones rapidas:** boton de guardar con atajo de teclado.

**Modo archivo:** si el movimiento ya esta archivado (eliminado), la
vista es solo lectura con opcion de restaurar.

---

## 2.4 — Nuevo traspaso

**Campos:**
- Cuenta origen: muestra saldo actual
- Cuenta destino: muestra saldo actual
- Monto
- Fecha
- Descripcion

**Advertencia visible si el monto es mayor al saldo de la cuenta
origen**, pero **permite continuar**.

**Restriccion:** solo se ofrecen cuentas de la cartera abierta. Nunca
cuentas de otra cartera. Si se busca, no hay resultados.

**Explicacion en pantalla:** "Un traspaso mueve dinero entre tus
cuentas. No es un gasto y no afecta tus sobres."

**Traspaso sin contraparte:** una advertencia en la interfaz, nunca un
bloqueo.

---

# TANDA 3 — Vistas secundarias

## 3.1 — Registro

Formulario centrado, igual que iniciar sesion.

**Campos:** Nombre, Apellido, Usuario, Correo, Contrasena.
**Ayuda:** requisito de minimo 6 caracteres en la contrasena.
**Validacion en linea:** usuario y correo ya existen.

---

## 3.2 — Cambiar contrasena

**Campo:** Contrasena actual, Contrasena nueva, Repetir contrasena.
**Ayuda:** requisito de minimo 6 caracteres, y que no sea igual a la
actual.
**Confirmacion:** las contrasenas coinciden.

---

## 3.3 — Cuentas (lista completa)

Similar a la seccion de cuentas del panel, pero a pagina completa.

**Agrega:** boton "+ Nueva cuenta", y por cuenta un menu con editar,
archivar, y "Ajustar saldo" (con confirmacion de que el ajuste
recalcula todo).

**Cuentas archivadas:** seccion colapsada al pie, con opcion de
restaurar.

---

## 3.4 — Detalle de sobre

Pagina de un sobre individual.

**Encabezado:** nombre del sobre, disponible grande, y acciones
(editar, archivar, borrar).

**Si tiene meta:** tarjeta de progreso con monto objetivo, fecha
limite, cuanto falta, cuanto necesitas por mes, y estado
(En camino / Retrasada / Completada / Abandonada). La marca
"Retrasada" en ambar, "Completada" en verde.

**Secciones:**
- Asignaciones del mes, con historial de meses anteriores
- Movimientos de este sobre
- Historial de disponible: como llego al numero actual

**Si el sobre esta en negativo:** bloque de accion en rojo con "Tapar
desborde" y "Registrar gasto con este sobre".

**Si esta archivado:** aviso de que sigue recibiendo devoluciones.

---

## 3.5 — Recurrencias

**Lista de reglas:**
- Descripcion, cuenta, sobre, monto
- Proxima fecha de aplicacion
- Interruptor de activar / desactivar por regla
- Distinguir reglas activas de inactivas

**Crear / editar regla:** los mismos campos que un movimiento, mas
frecuencia (diaria / semanal / mensual / anual), y dia del mes o de la
semana. Si es anual, tambien el mes.

**Vista previa:** "Se aplicara el proximo 1 de octubre".

---

## 3.6 — Grupos

**Lista de grupos** con nombre, cantidad de sobres y total de
disponibles, mas boton de reordenar por arrastre.

**Crear / editar grupo:** nombre y orden.

**Restriccion visible:** los grupos no contienen otros grupos.

---

# Notas de uso

**Por que las tandas van asi.** La tanda 1 define la direccion visual. Si
Stitch genera las 5 criticas y te gustan, las demas la siguen. Si no te
gustan, cambias el bloque "Contexto" y solo repites la tanda 1.

**Restricciones que no puedes dejar de lado.** El bloque de la vista de
carteras y el de "nunca se suman" son load-bearing. Si Stitch los ignora,
el diseno intentara hacer un total combinado, y eso contradice la decision
de que el panel muestra una cartera a la vez.

**Lo que no inclui a proposito.** Estados de error de red, esqueletos de
carga y modo oscuro. Son decisiones de implementacion, no de diseno
inicial. Si los quieres, agrego una cuarta tanda.

**Sobre el formato.** Stitch interpreta cada linea con guiones como una
instruccion de diseno separada, y los asteriscos como etiquetas. Si pegas
el archivo entero de golpe, las 17 vistas se mezclan. Copia vista por
vista.

---

# Como usar cada tanda

1. Abre Stitch
2. Pega el bloque "Contexto que va en CADA prompt"
3. Pega la vista que quieres de la tanda actual
4. Revisa el resultado antes de pasar a la siguiente
5. Si cambias la direccion visual, corrige el bloque Contexto y repite
   desde la tanda 1

Empieza siempre por la tanda 1. Las otras dos asumen que ya aprobaste la
direccion de las criticas.

