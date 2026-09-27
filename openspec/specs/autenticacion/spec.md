# autenticacion Specification

## Purpose
Proporciona autenticación segura y aislada por usuario para la app de finanzas personales: inicio de sesión, registro, cierre de sesión, cambio de contraseña, endurecimiento de sesión y aislamiento de datos por usuario en la API del panel.

## Requirements

### Requirement: El usuario puede iniciar sesión con username y contraseña
El sistema SHALL autenticar a los usuarios por username y contraseña verificada con bcrypt. La comparación del username SHALL ser insensible a mayúsculas y minúsculas. Tras un inicio de sesión exitoso el sistema SHALL establecer una sesión autenticada y redirigir al usuario al panel principal.

#### Scenario: Inicio de sesión exitoso
- **WHEN** un usuario registrado envía su username y la contraseña correcta
- **THEN** el sistema crea una sesión y redirige al usuario al panel principal

#### Scenario: Credenciales incorrectas
- **WHEN** un usuario envía un username desconocido o una contraseña incorrecta
- **THEN** el sistema muestra un error y no crea sesión

#### Scenario: El username no distingue mayúsculas
- **WHEN** un usuario inicia sesión con un username que difiere en mayúsculas y minúsculas del registrado
- **THEN** el sistema lo autentica como la misma cuenta

#### Scenario: La contraseña se almacena como bcrypt
- **WHEN** una contraseña se almacena o se cambia
- **THEN** el valor almacenado es un hash bcrypt verificado con `password_verify` y nunca texto plano

### Requirement: La sesión está endurecida
El sistema SHALL usar una cookie de sesión HttpOnly y SameSite=Lax, regenerar el identificador de sesión al iniciar sesión, e invalidar la sesión al cerrar sesión.

#### Scenario: Sesión regenerada al iniciar sesión
- **WHEN** un usuario inicia sesión correctamente
- **THEN** el identificador de sesión se regenera para prevenir la fijación de sesión

#### Scenario: El cierre de sesión limpia la sesión
- **WHEN** un usuario autenticado cierra sesión
- **THEN** la sesión se destruye y el usuario es redirigido a la página de inicio de sesión

### Requirement: Los intentos fallidos de inicio de sesión están limitados
El sistema SHALL bloquear nuevos intentos durante 60 segundos tras 5 intentos fallidos consecutivos.

#### Scenario: Bloqueo tras varios intentos fallidos
- **WHEN** ocurren 5 intentos de inicio de sesión fallidos en fila
- **THEN** el sistema rechaza los siguientes intentos durante 60 segundos

### Requirement: El registro requiere un username y un email únicos
El sistema SHALL permitir crear una cuenta con nombre, apellido, username, email y contraseña (mínimo 6 caracteres), rechazando usernames y emails duplicados, y SHALL iniciar sesión al tener éxito.

#### Scenario: Se rechaza el username duplicado
- **WHEN** un usuario se registra con un username que ya existe, sin distinguir mayúsculas de minúsculas
- **THEN** el sistema muestra un error y no crea la cuenta

#### Scenario: Se rechaza el email duplicado
- **WHEN** un usuario se registra con un email que ya existe
- **THEN** el sistema muestra un error y no crea la cuenta

#### Scenario: Registro exitoso
- **WHEN** un usuario se registra con datos válidos y únicos
- **THEN** la cuenta se crea con una marca de activa y el usuario queda con sesión iniciada

### Requirement: El usuario puede cambiar su contraseña
El sistema SHALL permitir que un usuario autenticado defina una nueva contraseña (mínimo 6 caracteres) solo después de verificar la contraseña actual, y SHALL almacenar el nuevo valor como un hash bcrypt.

#### Scenario: Contraseña actual incorrecta
- **WHEN** un usuario envía una contraseña actual incorrecta
- **THEN** la contraseña no se cambia y se muestra un error

#### Scenario: Contraseña cambiada
- **WHEN** un usuario envía la contraseña actual correcta y una nueva contraseña que coincide
- **THEN** el hash almacenado se actualiza y el cambio se confirma

### Requirement: La API requiere autenticación
La API del panel SHALL rechazar las solicitudes sin una sesión válida con HTTP 401 y un error `login_required`.

#### Scenario: Acceso no autenticado a la API
- **WHEN** una solicitud llega a la API sin una sesión activa
- **THEN** la API responde 401 e indica que se requiere inicio de sesión

### Requirement: Protección CSRF en formularios que cambian estado
El sistema SHALL incluir un token CSRF por sesión en el inicio de sesión, el registro, el cierre de sesión y el cambio de contraseña, y SHALL rechazar las solicitudes POST con un token inválido.

#### Scenario: Token CSRF inválido
- **WHEN** se envía un formulario que cambia estado con un token ausente o inválido
- **THEN** la solicitud se rechaza con un error de seguridad
