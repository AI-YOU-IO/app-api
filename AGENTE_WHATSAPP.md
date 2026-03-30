# Agente de WhatsApp - Documentacion

## Descripcion General

El agente de WhatsApp es un sistema de IA conversacional que recibe mensajes de clientes via WhatsApp, los procesa usando un LLM (OpenAI) con capacidad de tool-calling, y responde automaticamente. Soporta mensajes de texto y audio (transcripcion automatica).

---

## Arquitectura General

```
WhatsApp (Meta API)
       |
       v
messageProcessing.controller.js   <-- Punto de entrada
       |
       v
AssistantService.runProcess()      <-- Orquestador del LLM
       |
       +---> PromptCacheService    <-- Prompt del sistema (por empresa)
       +---> MemoryService         <-- Historial de conversacion (Redis/DB)
       +---> LLM Provider          <-- Llamada al modelo (OpenAI)
       +---> ToolExecutor          <-- Ejecucion de herramientas
       |
       v
WhatsappGraphService               <-- Envio de respuesta al cliente
```

---

## Flujo Completo de un Mensaje

### 1. Recepcion del mensaje

**Archivo:** `src/controllers/messageProcessing.controller.js`

El controlador recibe un POST en `/message` con el payload del webhook de WhatsApp y ejecuta:

1. **Normaliza el telefono** - Agrega codigo de pais `51` (Peru) si es necesario
2. **Busca configuracion de WhatsApp** - Identifica la empresa por `numero_telefono_id`
3. **Busca o crea la persona** - Registro del cliente por numero de celular
4. **Asigna asesor** - Round-robin entre asesores disponibles (rol 3)
5. **Busca o crea el chat** - Sesion de conversacion activa
6. **Transcribe audio** - Si el mensaje es de tipo audio, usa OpenAI Whisper
7. **Verifica si el bot esta activo** - Si `bot_activo = false`, no responde
8. **Llama al AssistantService** - Genera la respuesta con IA
9. **Envia respuesta por WhatsApp** - Via Meta Graph API
10. **Guarda mensajes en BD** - Tanto el entrante como el saliente
11. **Notifica via WebSocket** - Para actualizar el CRM en tiempo real

### 2. Procesamiento con IA (AssistantService)

**Archivo:** `src/services/assistant/asistant.service.js`

El metodo `runProcess()` es el nucleo del agente:

```
runProcess({ id_empresa, chatId, userMessage, datosPersona })
```

**Pasos internos:**

1. **Construye el system prompt** via `PromptCacheService.buildSystemPrompt()` inyectando datos del cliente y timestamp actual
2. **Carga las definiciones de tools** desde la base de datos para la empresa
3. **Obtiene historial** desde Redis (o BD como fallback) via `MemoryService`
4. **Envia al LLM** el system prompt + historial + mensaje nuevo + tools disponibles
5. **Si el LLM solicita tool_calls:**
   - Ejecuta cada tool via `ToolExecutor`
   - Agrega el resultado al historial
   - Vuelve a llamar al LLM (loop, maximo **5 iteraciones**)
6. **Cuando el LLM responde con texto final**, lo retorna
7. **Guarda el historial actualizado** en Redis (TTL 24h)

### 3. Configuracion del LLM

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `LLM_MODEL` | `gpt-4.1-mini` | Modelo a usar |
| `LLM_TEMPERATURE` | `0.5` | Temperatura de generacion |
| `LLM_PROVIDER` | `openai` | Proveedor (`openai` o `local`) |
| `OPENAI_API_KEY` | - | API key de OpenAI |
| `OPENAI_BASE_URL` | - | URL base (para LLM local) |

---

## Servicios del Asistente

### MemoryService

**Archivo:** `src/services/assistant/memory.service.js`

Gestiona el historial de conversacion con cache en Redis.

| Metodo | Descripcion |
|--------|-------------|
| `getConversationHistory(chatId)` | Obtiene historial desde Redis, si no existe va a BD |
| `addMessagesToCache(chatId, newMessages)` | Agrega mensajes al cache Redis |

- **Cache key:** `chat:history:{chatId}`
- **TTL:** 86400 segundos (24 horas)
- **Formato:** Array JSON de mensajes con roles (`user`, `assistant`, `tool`)

### PromptCacheService

**Archivo:** `src/services/assistant/promptCache.service.js`

Carga y cachea los system prompts por empresa.

| Metodo | Descripcion |
|--------|-------------|
| `getPromptByEmpresa(id_empresa)` | Obtiene el template del prompt desde BD |
| `buildSystemPrompt(template, datosPersona)` | Reemplaza variables del template |
| `clearCache()` | Limpia cache de prompts |

**Variables de template:**

| Variable | Valor |
|----------|-------|
| `{{datos}}` | JSON con datos del cliente |
| `{{timestamp}}` | Fecha y hora actual con nombre del dia |

### ToolExecutor

**Archivo:** `src/services/assistant/tools/toolExecutor.js`

Ejecuta las herramientas que el LLM solicita.

| Tool | Descripcion | Parametros |
|------|-------------|------------|
| `obtenerLinkPago` | Genera link de pago para cuotas | `grupo_familiar` |
| `obtenerLinkCambio` | Genera link para cambio de tarjeta | `grupo_familiar` |
| `tipificarConversacion` | Clasifica la conversacion | `id_tipificacion` |

Las definiciones de tools se cargan desde la base de datos por empresa, siguiendo el formato de funciones de OpenAI.

---

## Servicios Externos Integrados

### WhatsApp Graph API

**Archivo:** `src/services/whatsapp/whatsappGraph.service.js`

| Metodo | Descripcion |
|--------|-------------|
| `enviarMensajeTexto(idEmpresa, phone, message)` | Envia mensaje de texto |
| `listarPlantillas()` | Lista plantillas de WhatsApp |
| `crearPlantilla()` | Crea nueva plantilla |

Soporta: texto, imagenes, documentos, audio, video y plantillas.

### Transcripcion de Audio

**Archivo:** `src/services/transcription/transcription.service.js`

| Metodo | Descripcion |
|--------|-------------|
| `transcribeFromUrl(url)` | Descarga audio desde URL y transcribe |
| `transcribe(buffer, filename)` | Transcribe buffer de audio directamente |

- **Motor:** OpenAI Whisper
- **Idioma:** Espanol (es)
- **Formatos soportados:** .ogg, .mp3, .wav, .m4a, .webm, .mp4

### WebSocket Notifier

**Archivo:** `src/services/websocketNotifier.service.js`

Notifica al CRM en tiempo real cuando hay mensajes nuevos.

| Webhook | Evento |
|---------|--------|
| `/webhook/mensaje-entrante` | Mensaje recibido del cliente |
| `/webhook/mensaje-saliente` | Mensaje enviado por el bot/asesor |

---

## Modelos de Base de Datos Involucrados

```
empresa
  |---> configuracion_whatsapp    (credenciales WhatsApp por empresa)
  |---> prompt_asistente          (system prompt por empresa)
  |---> herramienta               (tools disponibles por empresa)
  +---> persona                   (clientes/contactos)
           |---> chat             (sesiones de conversacion)
           |      +---> mensaje   (mensajes individuales)
           +---> usuario          (asesor asignado)
```

---

## Cache en Redis

| Key | Contenido | TTL |
|-----|-----------|-----|
| `chat:history:{chatId}` | Historial de conversacion (JSON) | 24h |
| Prompt cache (in-memory) | System prompts por empresa | Hasta `clearCache()` |

---

## Variables de Entorno Relevantes

| Variable | Descripcion |
|----------|-------------|
| `LLM_MODEL` | Modelo de IA |
| `LLM_TEMPERATURE` | Temperatura del LLM |
| `LLM_PROVIDER` | Proveedor de LLM |
| `OPENAI_API_KEY` | API key de OpenAI |
| `OPENAI_BASE_URL` | URL base del LLM |
| `CLIENTE_ID` | Credencial API externa (pagos) |
| `CLIENTE_SECRETO` | Credencial API externa (pagos) |
| `WS_SERVER_URL` | URL del servidor WebSocket |
