# autenticacion Specification

## Purpose
Proporcionar acceso seguro a la aplicacion y garantizar que cada usuario vea unicamente sus propios datos. Cubre el registro, el inicio y cierre de sesion, el cambio de credenciales y las reglas de aislamiento entre usuarios. Esta capacidad describe comportamiento observable y no prescribe tecnologias de almacenamiento, algoritmos de hash ni mecanismos concretos de sesion.

## Requirements

### Requirement: El usuario se registra con datos unicos
El sistema SHALL permitir crear una cuenta con nombre, apellido, nombre de usuario, correo electronico y contrasena. El sistema SHALL exigir una contrasena de al menos 6 caracteres. El sistema SHALL rechazar el registro cuando el nombre de usuario ya exista, sin distinguir mayusculas de minusculas, o cuando el correo electronico ya exista. La cuenta creada SHALL quedar activa y el usuario SHALL quedar con sesion iniciada.

#### Scenario: Registro exitoso
- **WHEN** un visitante se registra con nombre de usuario y correo electronico no registrados y una contrasena valida
- **THEN** el sistema crea la cuenta activa y deja al usuario con sesion iniciada

#### Scenario: Se rechaza el nombre de usuario duplicado
- **WHEN** un visitante se registra con un nombre de usuario ya existente que solo difiere en mayusculas
- **THEN** el sistema muestra un error y no crea la cuenta

#### Scenario: Se rechaza el correo duplicado
- **WHEN** un visitante se registra con un correo electronico ya existente
- **THEN** el sistema muestra un error y no crea la cuenta

#### Scenario: Contrasena demasiado corta
- **WHEN** un visitante se registra con una contrasena de menos de 6 caracteres
- **THEN** el sistema muestra un error y no crea la cuenta

#### Scenario: El nombre de usuario diferencia mayusculas
- **WHEN** dos usuarios intentan registrarse con el mismo nombre de usuario en distinta capitalizacion
- **THEN** el sistema solo acepta el primero

---

### Requirement: El usuario inicia sesion con nombre de usuario y contrasena
El sistema SHALL autenticar al usuario mediante nombre de usuario y contrasena, y SHALL tratar el nombre de usuario de forma insensible a mayusculas y minusculas. El sistema SHALL establecer una sesion autenticada tras un inicio de sesion exitoso. El sistema SHALL rechazar el acceso cuando el nombre de usuario no exista o la contrasena sea incorrecta.

#### Scenario: Inicio de sesion exitoso
- **WHEN** un usuario registrado envia su nombre de usuario y la contrasena correcta
- **THEN** el sistema establece una sesion autenticada y lo lleva al panel de su cartera

#### Scenario: Credenciales incorrectas
- **WHEN** un usuario envia un nombre de usuario desconocido o una contrasena incorrecta
- **THEN** el sistema muestra un error de credenciales y no establece sesion

#### Scenario: El nombre de usuario no distingue mayusculas
- **WHEN** un usuario inicia sesion con un nombre de usuario que difiere en capitalizacion del registrado
- **THEN** el sistema lo autentica como la misma cuenta

---

### Requirement: La sesion esta endurecida
El sistema SHALL proteger la sesion de modo que no sea accesible desde el cliente mediante scripts, y SHALL limitar su envio en peticiones originadas en otros sitios. El sistema SHALL generar un identificador de sesion nuevo al iniciar sesion, y SHALL destruir la sesion al cerrar sesion.

#### Scenario: Identificador renovado al iniciar sesion
- **WHEN** un usuario inicia sesion correctamente
- **THEN** el sistema genera un identificador de sesion nuevo

#### Scenario: Cierre de sesion
- **WHEN** un usuario autenticado cierra sesion
- **THEN** el sistema destruye la sesion y lo lleva a la pantalla de inicio de sesion

#### Scenario: Sesion no utilizable desde el cliente
- **WHEN** el navegador inspecciona los datos de la sesion
- **THEN** no encuentra el identificador de sesion expuesto a los scripts de la pagina

---

### Requirement: El sistema limita los intentos fallidos de inicio de sesion
El sistema SHALL bloquear nuevos intentos de inicio de sesion durante 60 segundos tras 5 intentos fallidos consecutivos. El sistema SHALL reiniciar el conteo de intentos cuando el inicio de sesion tenga exito.

#### Scenario: Bloqueo tras cinco intentos fallidos
- **WHEN** ocurren 5 intentos de inicio de sesion fallidos consecutivos
- **THEN** el sistema rechaza los siguientes intentos durante 60 segundos

#### Scenario: Contreinicio tras un acceso exitoso
- **WHEN** un usuario supera el limite de intentos y posteriormente inicia sesion correctamente
- **THEN** el conteo de intentos fallidos se reinicia

#### Scenario: Mensaje de bloqueo
- **WHEN** un usuario intenta iniciar sesion durante el periodo de bloqueo
- **THEN** el sistema informa que debe esperar antes de volver a intentar

---

### Requirement: El usuario cambia su contrasena
El sistema SHALL permitir que un usuario autenticado defina una nueva contrasena de al menos 6 caracteres solo despues de verificar su contrasena actual. El sistema SHALL rechazar el cambio cuando la contrasena actual sea incorrecta o cuando la nueva no cumpla los requisitos. El usuario SHALL quedar autenticado con la nueva credencial tras un cambio exitoso.

#### Scenario: Contrasena actual incorrecta
- **WHEN** un usuario envia una contrasena actual incorrecta
- **THEN** el sistema no cambia la contrasena y muestra un error

#### Scenario: Contrasena nueva demasiado corta
- **WHEN** un usuario envia la contrasena actual correcta y una nueva de menos de 6 caracteres
- **THEN** el sistema rechaza el cambio y explica el requisito de longitud

#### Scenario: Contrasena cambiada
- **WHEN** un usuario envia la contrasena actual correcta y una nueva valida
- **THEN** el sistema confirma el cambio y la contrasena anterior deja de ser valida

---

### Requirement: El usuario actualiza sus datos de perfil
El sistema SHALL permitir que un usuario autenticado actualice su nombre, su apellido y su correo electronico. El sistema SHALL rechazar la actualizacion cuando el correo electronico ya pertenezca a otra cuenta. El sistema SHALL tratar el nombre de usuario y la zona horaria como inmodificables, y SHALL rechazar la actualizacion cuando se intente cambiar alguno de los dos.

#### Scenario: Actualizacion de datos
- **WHEN** un usuario autenticado envia un nombre, un apellido y un correo libre
- **THEN** el sistema guarda los tres datos y los muestra en su perfil

#### Scenario: Se rechaza el correo duplicado al editar el perfil
- **WHEN** un usuario autenticado envia un correo electronico que ya pertenece a otra cuenta
- **THEN** el sistema muestra un error y no guarda ningun dato del envio

#### Scenario: El nombre de usuario no cambia
- **WHEN** un usuario autenticado guarda su perfil reenviando su nombre de usuario sin modificar
- **THEN** el sistema guarda los datos y conserva el mismo nombre de usuario

#### Scenario: Se rechaza el cambio de nombre de usuario
- **WHEN** un usuario autenticado envia un nombre de usuario distinto del que ya tiene
- **THEN** el sistema rechaza el envio y el nombre de usuario permanece sin cambios

#### Scenario: La zona horaria no se cambia desde el perfil
- **WHEN** un usuario autenticado guarda su perfil con una zona horaria distinta de la que tiene
- **THEN** el sistema rechaza el envio y la zona horaria permanece sin cambios
- **AND** el sistema sigue usando la zona horaria original para determinar el periodo actual de sobres, metas y reglas recurrentes

---

### Requirement: El sistema protege las operaciones que cambian estado
El sistema SHALL asociar a cada sesion un token de proteccion contra peticiones no autorizadas, incluirlo en las operaciones que cambian estado y SHALL rechazar las solicitudes que lleguen sin ese token o con uno invalido. El sistema SHALL aplicar esta proteccion al menos al inicio de sesion, al registro, al cierre de sesion y al cambio de contrasena.

#### Scenario: Token ausente o invalido
- **WHEN** se envia una operacion que cambia estado con un token de proteccion ausente o invalido
- **THEN** el sistema rechaza la solicitud e informa que se requiere una sesion valida

#### Scenario: Operacion protegida valida
- **WHEN** se envia una operacion que cambia estado con un token de proteccion valido
- **THEN** el sistema la procesa con normalidad

#### Scenario: Token no reutilizable entre sesiones
- **WHEN** un usuario cierra sesion y otra persona intenta reutilizar el token anterior
- **THEN** el sistema rechaza la solicitud

---

### Requirement: El usuario solo accede a sus propios datos
El sistema SHALL negar el acceso a los datos de finanzas personales de un usuario autenticado a cualquier otro usuario. Toda cartera, grupo, cuenta, sobre, asignacion, movimiento, meta y regla recurrente SHALL pertenecer a un unico usuario. El sistema SHALL rechazar las solicitudes que no correspondan al usuario, y SHALL negar el acceso cuando la pertenencia no pueda verificarse.

#### Scenario: Acceso a datos ajenos
- **WHEN** un usuario autenticado solicita la cartera, un sobre o un movimiento que pertenece a otro usuario
- **THEN** el sistema le niega el acceso e informa que el recurso no existe

#### Scenario: Identificador inexistente
- **WHEN** un usuario solicita un recurso con un identificador que no corresponde a nada
- **THEN** el sistema informa que el recurso no existe sin revelar si pertenece a otro usuario

#### Scenario: Sesion ausente en una operacion protegida
- **WHEN** llega una solicitud de datos o de escritura sin una sesion valida
- **THEN** el sistema la rechaza e indica que se requiere iniciar sesion
