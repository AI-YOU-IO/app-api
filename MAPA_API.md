# Mapa de API - Frontend → Backend

## LOGIN (público, sin auth)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/crm/login` | `{ username, password }` |

---

## DASHBOARD

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/reportes/dashboard` | Panel principal |

---

## CONVERSACIONES

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/contactos/{offset}?filtros` | Lista contactos (paginado) |
| GET | `/crm/contacto/{id}/mensajes` | Mensajes de un chat |
| POST | `/crm/contacto/{id}/mensajes` | Enviar mensaje |
| POST | `/crm/contacto/{id}/mark-read` | Marcar como leído |
| PATCH | `/crm/contacto/{id}/toggle-bot` | Activar/desactivar bot |
| GET | `/crm/contactos/unread/count` | Badge no leídos (Sidebar) |
| GET | `/crm/persona/{id}/perfilamiento` | Preguntas de perfilamiento |
| PUT | `/crm/persona/{id}` | Editar persona desde chat |

---

## LEADS (Prospectos)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/persona` | Lista de leads |
| GET | `/crm/estados` | Dropdown estados |
| GET | `/crm/tipificaciones` | Dropdown tipificaciones |
| GET | `/crm/catalogo` | Dropdown planes |
| GET | `/crm/usuarios/rol/3` | Dropdown asesores |
| GET | `/crm/persona/{id}/perfilamiento` | Detalle perfilamiento |
| PUT | `/crm/persona/{id}` | Editar lead |
| POST | `/crm/persona/bulk-assign` | Asignación masiva a asesor |

---

## CLIENTES

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/clientes` | Lista clientes (id_tipo_persona=2) |
| GET | `/crm/usuarios/rol/3` | Dropdown asesores |
| POST | `/crm/persona` | Crear cliente |
| PUT | `/crm/persona/{id}` | Editar cliente |

---

## LLAMADAS

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/llamadas` | Lista llamadas |
| GET | `/crm/llamadas/ejecucion/{id}` | Llamadas por ejecución |
| GET | `/crm/llamadas/{id}` | Detalle llamada |
| GET | `/crm/tipificacion-llamada` | Dropdown tipificaciones |

---

## CAMPAÑAS

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/campanias` | Lista campañas |
| GET | `/crm/campanias/{id}` | Detalle campaña |
| GET | `/crm/tipos-campania` | Dropdown tipos (Llamadas/WhatsApp) |
| GET | `/crm/bases-numeros` | Dropdown bases |
| GET | `/crm/formatos` | Dropdown formatos |
| GET | `/crm/plantillas` | Dropdown plantillas |
| POST | `/crm/campanias` | Crear campaña |
| PUT | `/crm/campanias/{id}` | Editar campaña |
| DELETE | `/crm/campanias/{id}` | Eliminar campaña |
| GET | `/crm/campanias/{id}/bases` | Bases de una campaña |
| POST | `/crm/campania-bases` | Agregar base a campaña |
| DELETE | `/crm/campania-bases/{id}` | Quitar base de campaña |
| GET | `/crm/campanias/{id}/ejecuciones` | Ejecuciones de campaña |
| POST | `/crm/campania-ejecuciones/ejecutar` | Ejecutar campaña |
| GET | `/crm/campanias/{id}/config-llamadas` | Config de llamadas |
| POST | `/crm/campanias/{id}/config-llamadas` | Guardar config llamadas |
| GET | `/crm/personas` | Para agregar personas a ejecución |

---

## ENCUESTAS (público: `/crm/tools/`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/tools/encuesta/estadisticas` | Dashboard encuestas |
| GET | `/crm/tools/encuesta/encuestas` | Lista encuestas (paginada) |
| GET | `/crm/tools/encuesta/encuesta/{id}` | Detalle encuesta |
| GET | `/crm/tools/encuesta/personas` | Personas de encuesta (con auth) |
| POST | `/crm/tools/encuesta/personas` | Agregar persona (con auth) |
| DELETE | `/crm/tools/encuesta/personas/{id}` | Eliminar persona (con auth) |
| GET | `/crm/tools/encuesta/reportes` | Reportes encuestas |

---

## REPORTES

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/reportes/{tipo}?fechas` | Reportes por tipo y rango |

---

## PERFIL

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/personas?limit=1` | Info del perfil |
| GET | `/crm/conversaciones?limit=1` | Actividad reciente |
| PUT | `/crm/usuarios/{id}/password` | Cambiar contraseña |

---

## CONFIGURACIÓN

### Usuarios

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/usuarios` | Lista usuarios |
| GET | `/crm/roles` | Dropdown roles |
| GET | `/crm/sucursales` | Dropdown sucursales |
| GET | `/crm/usuarios/rol/2` | Supervisores (para id_padre) |
| POST | `/crm/usuarios` | Crear usuario |
| PUT | `/crm/usuarios/{id}` | Editar usuario |
| DELETE | `/crm/usuarios/{id}` | Eliminar usuario |

### Roles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/roles` | Lista roles |
| GET | `/crm/roles/{id}` | Detalle rol + módulos |
| GET | `/crm/modulos` | Lista módulos disponibles |
| POST | `/crm/roles` | Crear rol |
| PUT | `/crm/roles/{id}` | Editar rol + sync módulos |
| DELETE | `/crm/roles/{id}` | Eliminar rol |

### Módulos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/modulos` | Lista módulos |
| POST | `/crm/modulos` | Crear módulo |
| PUT | `/crm/modulos/{id}` | Editar módulo |
| DELETE | `/crm/modulos/{id}` | Eliminar módulo |

### Estados

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/estados` | Lista estados |
| PATCH | `/crm/estados/{id}/color` | Cambiar color |

### Tipificaciones

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/tipificaciones` | Lista tipificaciones |
| POST | `/crm/tipificaciones` | Crear |
| PUT | `/crm/tipificaciones/{id}` | Editar / reordenar |
| DELETE | `/crm/tipificaciones/{id}` | Eliminar |

### Tipificaciones de Llamada

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/tipificacion-llamada` | Lista |
| POST | `/crm/tipificacion-llamada` | Crear |
| PUT | `/crm/tipificacion-llamada/{id}` | Editar |
| DELETE | `/crm/tipificacion-llamada/{id}` | Eliminar |

### Catálogo (Planes)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/catalogo` | Lista planes |
| POST | `/crm/catalogo` | Crear plan |
| PUT | `/crm/catalogo/{id}` | Editar plan |
| DELETE | `/crm/catalogo/{id}` | Eliminar plan |

### Sucursales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/sucursales` | Lista |
| POST | `/crm/sucursales` | Crear |
| PUT | `/crm/sucursales/{id}` | Editar |
| DELETE | `/crm/sucursales/{id}` | Eliminar |

### Formatos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/formatos` | Lista |
| GET | `/crm/formatos/{id}` | Detalle + campos |
| POST | `/crm/formatos` | Crear |
| PUT | `/crm/formatos/{id}` | Editar |
| DELETE | `/crm/formatos/{id}` | Eliminar |
| POST | `/crm/formato-campos` | Crear campo |
| PUT | `/crm/formato-campos/{id}` | Editar campo |
| DELETE | `/crm/formato-campos/{id}` | Eliminar campo |

### Plantillas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/plantillas` | Lista |
| POST | `/crm/plantillas` | Crear |
| PUT | `/crm/plantillas/{id}` | Editar |
| DELETE | `/crm/plantillas/{id}` | Eliminar |

### Bases de Números

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/bases-numeros` | Lista |
| POST | `/crm/bases-numeros` | Crear |
| PUT | `/crm/bases-numeros/{id}` | Editar |
| DELETE | `/crm/bases-numeros/{id}` | Eliminar |
| POST | `/crm/bases-numeros/upload` | Subir archivo (multipart) |
| GET | `/crm/bases-numeros/{id}/detalles` | Detalle paginado |
| DELETE | `/crm/base-numero-detalles/{id}` | Eliminar detalle |

### FAQs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/faqs` | Lista |
| POST | `/crm/faqs` | Crear |
| PUT | `/crm/faqs/{id}` | Editar |
| DELETE | `/crm/faqs/{id}` | Eliminar |

### Preguntas de Perfilamiento

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/preguntas-perfilamiento` | Lista |
| POST | `/crm/preguntas-perfilamiento` | Crear |
| PUT | `/crm/preguntas-perfilamiento/{id}` | Editar / reordenar |
| DELETE | `/crm/preguntas-perfilamiento/{id}` | Eliminar |

### Periodicidades de Recordatorio

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/periodicidades-recordatorio` | Lista |
| POST | `/crm/periodicidades-recordatorio` | Crear |
| PUT | `/crm/periodicidades-recordatorio/{id}` | Editar |
| DELETE | `/crm/periodicidades-recordatorio/{id}` | Eliminar |

### Prompt Bot

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/prompt-asistente` | Obtener prompt actual |
| POST | `/crm/prompt-asistente` | Guardar prompt |

### Equipos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/usuarios/rol/2` | Supervisores |
| GET | `/crm/usuarios/rol/3` | Asesores |

---

## ADMINISTRACIÓN (admin)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/crm/admin/empresas` | Lista empresas |
| POST | `/crm/admin/empresas` | Crear empresa |
| PUT | `/crm/admin/empresas/{id}` | Editar empresa |
| PUT | `/crm/admin/empresas/{id}/estado` | Cambiar estado empresa |
| GET | `/crm/admin/usuarios` | Lista usuarios (global) |
| POST | `/crm/admin/usuarios` | Crear usuario (global) |
| PUT | `/crm/admin/usuarios/{id}` | Editar usuario |
| DELETE | `/crm/admin/usuarios/{id}` | Eliminar usuario |

---

> ~45 endpoints únicos, 170 llamadas totales.
> Todo autenticado vía Bearer token excepto `/crm/login` y las rutas GET de `/crm/tools/encuesta`.
