# Preguntas pendientes

Estas son las preguntas que siguen abiertas. Todo lo demas ya esta decidido y
recogido en `openspec/specs/`. Cada pregunta indica donde quedo documentada la
decision provisional, para poder revisarla si el usuario cambia de opinion.

## Bloqueantes

Ninguna. El conjunto de specs esta completo y se puede implementar.

## Para confirmar

### 1. ¿Un traspaso entre carteras de distinta moneda, o entre carteras en general?

**Decision provisional:** el sistema rechaza el traspaso cuando las cuentas
involucradas pertenecen a carteras distintas, sin importar si comparten moneda.

**Por que esta decision:** la decision del usuario fue "no se puede pasar de una
cartera a otra, o al menos no pasar de una moneda a otra". El modelo fue
construido de modo que un movimiento pertenece a una sola cartera, deducida por
`movimientos -> cuenta_id -> cuentas -> carteras -> usuarios`, y el usuario
rechazo anadir reglas de integridad cruzada al modelo. Bajo esa estructura, un
traspaso entre carteras distintas no tiene a que almacenarse en ninguna parte.

**Lo que falta confirmar:** si dos carteras de la MISMA moneda deben poder
transferirse entre si, o si la prohibition es total.

**Donde esta documentada:** `carteras` R4, `traspasos` R1, `transacciones` R3 y R5.

---

### 2. ¿El importe minimo de un traspaso y de una asignacion

**Decision provisional:** no se fijo un minimo. `sobres` R4 exige que una
asignacion sea positiva, pero ni las asignaciones ni los traspasos fijan una
cota minima, y `traspasos` R1 tampoco exige que el importe sea distinto de cero.

**Por que esta abierta:** con un importe minimo pequeño, tipico 1 centavo, se
pueden usar traspasos para repartir con precision decimales que no cuadran por
redondeo. Sin minimo, se pueden crear traspasos sin efecto util.

**Lo que falta decidir:** si existe un minimo, y de cuanto.

**Donde esta documentada:** `sobres` R4, `traspasos` R1.

---

### 3. ¿Umbral por defecto para destacar variaciones en comparativos

**Decision provisional:** el umbral lo define el sistema y el usuario puede
ajustarlo. No se fijo un valor por defecto.

**Por que esta abierta:** un umbral fijo sin justification hace que la
funcionalidad parezca arbitraria en la primera pantalla que ve el usuario.

**Lo que falta decidir:** el valor por defecto, y si el umbral se expresa como
porcentaje, como importe absoluto, o como ambos.

**Donde esta documentada:** `comparativos` R2.

---

### 4. ¿Que muestra el panel cuando una cartera esta archivada

**Decision provisional:** no se especifico. Un usuario puede archivar una
cartera cuando todas sus cuentas y sobres estan en cero, y el sistema conserva
sus datos e historial, pero no se definio si el panel sigue mostrando esa
cartera, la oculta, o impide abrirla.

**Lo que falta decidir:** el comportamiento del panel y si se permite reabrir
una cartera archivada.

**Donde esta documentada:** `carteras` R5, `panel` R1.

---

### 5. ¿Se conserva el acceso a la cartera archivada

Relacionado con la anterior: la especificacion de `carteras` dice que una cartera
archivada conserva sus datos y su historial, pero no dice si puede consultarse.
Si se oculta por completo, "conservar el historial" solo significaria que los
datos no se borran, no que el usuario pueda verlos.

**Donde esta documentada:** `carteras` R5.

---

### 6. ¿El enlace de recuperacion de contrasena en PROMPTS-DISENO.md

**Decision provisional:** la recuperacion de contrasena quedo fuera de alcance, y
la capacidad de autenticacion no la incluye. Sin embargo, `PROMPTS-DISENO.md`
incluye en la vista de inicio de sesion un enlace de contrasena olvidada.

**Lo que falta decidir:** si se quita el enlace del prompt de diseno, o si se
agrega la recuperacion de contrasena como capacidad nueva.

**Donde esta documentada:** `PROMPTS-DISENO.md`, lote 1.

## Descartadas

Estas preguntas se respondieron durante la planificacion y ya estan reflejadas en
las especificaciones:

- ¿Como se tapa un sobre gastado de mas? -> tapa manual, solo con aviso.
  `sobres` R7.
- ¿Que pasa al archivar un sobre con saldo? -> solo con disponible cero; despues
  acepta devoluciones. `sobres` R11.
- ¿Que pasa al borrar un sobre con movimientos? -> no se borra, se archiva.
  `sobres` R10.
- ¿Se recalcula al registrar un movimiento pasado? -> si, siempre. `transacciones` R8.
- ¿A que mes pertenece un movimiento? -> al mes calendario de su fecha, con la
  zona horaria del usuario. `transacciones` R7.
- ¿Como se redondean los centavos? -> importes exactos, redondeo solo al
  mostrar. `carteras` R4.
- ¿Un cambio de OpenSpec o varios? -> edicion directa en `openspec/specs/`.
- ¿El panel ahora o al final? -> es una de las doce capacidades.
- ¿Autoasignacion en el MVP? -> fuera de alcance. `transacciones` R2.
- ¿Conciliacion bancaria en el MVP? -> fuera de alcance; la app no se conecta a
  bancos.
- ¿Copia de seguridad? -> fuera de alcance.
- ¿Meses futuros en el presupuesto? -> fuera de alcance.
- ¿Plantillas de sobres? -> fuera de alcance.
- ¿Deuda compartida? -> fuera de alcance.
- ¿Adjuntos en movimientos? -> fuera de alcance.
- ¿Notificaciones y recordatorios? -> fuera de alcance.
- ¿Presupuesto por porcentaje del ingreso? -> fuera de alcance.
- ¿Clasificacion automatica con LLM? -> fuera de alcance.
