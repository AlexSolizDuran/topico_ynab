# Preguntas pendientes

10 decisiones abiertas. Las 6 primeras son **bloqueantes**: cambian los
requisitos que se van a escribir, así que conviene resolverlas antes.

Para las de alcance, se puede decidir más adelante sin bloquear el trabajo.

---

## Bloqueantes

### 1. ¿Cómo se tapa un sobre que se gastó de más?

Te pasaste en un sobre y quedó en negativo. ¿Qué hace el sistema?

- **Automático** — usa dinero suelto mientras alcance; si no alcanza, deja el
  sobre negativo y avisa. Es lo que hace YNAB.
- **Manual** — no hace nada hasta que el usuario elija de qué sobre taparlo.
- **Con bloque** — rechaza la operación si no alcanza dinero suelto.

Recomendación: automático con aviso. El usuario después puede mover dinero
entre sobres a mano.

---

### 2. ¿Qué pasa al archivar un sobre que todavía tiene saldo?

El riesgo: si el sobre desaparece de la cuenta, la invariante se rompe.

- **Reasignar antes** — no deja archivar un sobre con saldo distinto de cero.
- **Contarlo igual** — el sobre archivado sigue sumando al total, solo no se
  muestra.
- **Devolver al suelto** — el saldo vuelve automáticamente a dinero suelto.

Lo mismo aplica a **archivar una cuenta**: si es una tarjeta con deuda, el
patrimonio cambia.

---

### 3. ¿Qué pasa al borrar un sobre que tiene movimientos?

Un sobre con 40 movimientos no se puede borrar sin decidir qué pasa con ellos.

- **Solo archivar** — nunca se borra, se archiva. Los movimientos se conservan.
- **Reasignar** — se pide otro sobre destino para los movimientos.
- **Cascada** — se borran también los movimientos.

Si se permite borrar sin más, quedan movimientos apuntando a un sobre
inexistente y las consultas se rompen.

---

### 4. ¿Se recalcula al registrar un movimiento pasado?

Hoy registras un movimiento de **marzo** cuando estamos en junio.

- ¿Se recalcula marzo? Con el modelo derivado, **sí**, y es lo correcto.
- ¿El panel de marzo cambia a posteriori?

Parece raro, pero es lo correcto. Hay que dejarlo explícito en el spec para
que nadie lo "arregle" después.

---

### 5. ¿A qué mes pertenece un movimiento?

- Un movimiento pertenece al **mes calendario de su fecha**, no al mes en que
  lo registraste.
- **Zona horaria**: un movimiento del 31 de marzo a las 23:00, ¿es de marzo? Si
  el servidor está en UTC y el usuario en México, puede saltarse de mes. Hay
  que definir que la fecha la interpreta la zona horaria del usuario.

---

### 6. ¿Cómo se redondean los centavos?

Si repartes 1,000 entre 3 sobres: `333.33 × 3 = 999.99`. **¿Dónde va el centavo?**

Y si el sistema calcula porcentajes (como el 80% de alerta), el redondeo puede
hacer que la suma no cuadre contra la invariante.

Falta fijar la regla antes de escribir cualquier spec que calcule porcentajes.

---

## De alcance

### 7. ¿Un change o varios?

Opción **a**: un solo change que quita lo viejo y agrega `cuentas`, `sobres`,
`transacciones` y `traspasos`. Más rápido, un archivo de tareas.

Opción **b**: 4 changes separados, flujo spec-driven estricto. Más ceremony,
más control.

---

### 8. ¿El panel ahora o al final?

El panel necesita que sobres y movimientos ya existan para tener sentido. Se specs
al final, con el modelo de datos ya firme.

La alternativa es incluirlo ahora como spec de solo lectura de los derivados
(liquidez, balances por sobre, dinero suelto). Más trabajo antes de tener algo
funcional.

---

### 9. ¿Auto-asignación en el MVP?

Reparto automático del dinero suelto con prioridad:

1. Tapa sobres negativos
2. Completa metas
3. Reparte el resto

Es lo que hace cómoda la app, pero es una decisión de diseño grande. Se puede
dejar para después sin romper el modelo.

---

### 10. ¿Conciliación bancaria en el MVP?

El saldo real del banco contra el registrado. Sin ella, la app puede mostrar un
saldo que no coincide con el banco.

Alternativa más simple para el MVP: **exportar/importar CSV** y un ajuste
manual.

---

## Para responder

Basta con indicar el número y la letra. Ejemplos:

```
1. automática con aviso
2. devolver al suelto
3. solo archivar
4. sí, recalcula
5. mes calendario, zona del usuario
6. redondeo a 2 decimales, el centavo va al último
7. un solo change
8. al final
9. después
10. CSV por ahora
```
