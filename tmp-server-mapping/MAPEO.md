# Mapeo General — aiyou-voice-backend (servidor 64.23.133.231)

Servidor: `root@64.23.133.231` · Path: `/root/aiyou-voice-backend`
Stack: Node.js (ESM) + Express + Asterisk (AMI/ARI/AudioSocket) + Ultravox AI
Puertos: HTTP `3302`, AudioSocket TCP `9092`

---

## 1. Arquitectura general

```
[Asterisk PBX] ── AMI / ARI ──► [aiyou-voice-backend] ──► [Ultravox AI WebSocket]
       │                              │                            │
       │  AudioSocket :9092           │                            │
       └──────► audio bidireccional ──┘                            │
                                                                   │
                                  selectedTools ────► HTTP a CRMs (bitel/viva/auna...)
```

Flujo de una llamada saliente:

1. Cliente externo (CRM) hace `POST /api/calls/ultravox` al backend con `{destination, data, extras}`.
2. `calls.controller.makeUltravoxCall` valida horario/canales, encola si toca, y llama a `originateUltravoxCall` (AMI).
3. AMI levanta el canal en Asterisk con un `channelId` único; se pre-crea la `audioSession` (External Media → AudioSocket TCP).
4. Cuando entra el audio del peer, `external-media.service` instancia `UltravoxAPISession` (`services/ultravoxapi.service.js`).
5. La sesión Ultravox carga **prompt + tools de la empresa** (`tools/{empresa}.js`) y abre WS con `api.ultravox.ai`.
6. El modelo Ultravox ejecuta `selectedTools` haciendo HTTP a las URLs definidas en `tools/*.js` → endpoints del CRM.
7. Al colgar: el backend sube grabación (`uploadCallAudio`), envía transcripción (`sendTranscription`) y notifica `call-terminada` / `call-no-contesta`.

---

## 2. Endpoints HTTP del backend (Express)

Montados en [app.js](aiyou-voice-backend/app.js):

| Método | Ruta | Controller | Propósito |
|---|---|---|---|
| GET  | `/api/calls`                       | `getActiveCalls`           | Lista llamadas activas (AMI + ARI) |
| GET  | `/api/calls/sessions`              | `getBotSessions`           | Lista sesiones de bot |
| POST | `/api/calls/ultravox`              | `makeUltravoxCall`         | **Origina llamada con Ultravox** |
| POST | `/api/calls/ultravox/batch`        | `makeUltravoxCallBatch`    | Encola llamadas en lote |
| GET  | `/api/calls/ultravox/sessions/:id` | `getUltravoxSessions`      | Sesiones audio activas por empresa |
| GET  | `/api/calls/transfer/:id`          | `redirectThroughAsterisk`  | Redirección de llamada |
| GET  | `/api/calls/:id`                   | `getCallDetails`           | Detalle de llamada |
| POST | `/api/calls/:id/hangup`            | `hangupCall`               | Colgar |
| POST | `/api/calls/:id/speak`             | `speakOnCall`              | TTS sobre canal |
| POST | `/api/calls/:id/play`              | `playSoundOnCall`          | Reproduce sonido |
| GET  | `/api/health`                      | inline                      | Healthcheck |
| —    | `/api/extensions`                  | `extensions.routes`        | Gestión de extensiones |
| —    | `/api/system`                      | `system.routes`            | Sistema |
| —    | `/audio/*`                         | static                      | Archivos TTS |

**Header importante:** `x-origin-service` — define el host que el backend usa como `apiUrl` para callbacks al CRM (upload audio, transcripción, call-terminada, call-no-contesta).

---

## 3. Tools por empresa (las "tools de las llamadas")

Registro central: [tools/index.js](aiyou-voice-backend/src/tools/index.js)

```js
tools.auna = aunaTools;
tools.viva = vivaTools;
tools.bitel = bitelTools;
tools.encuesta = encuestaTools;
tools.generica = genericaTools;
```

La selección se hace en `UltravoxAPISession` ([ultravoxapi.service.js:18](aiyou-voice-backend/src/services/ultravoxapi.service.js#L18)):

```js
const toolRuta = options.extras?.tool_ruta?.replace('.js','') || options.extras?.empresa?.nombre;
this.tools = this.processTools(tools[toolRuta] || tools['generica']);
```

`processTools` reescribe el host de cualquier URL `*.ai-you.io` por el `backendUrl` recibido en `x-origin-service`, **conservando el path**. Las URLs externas (p.ej. `sperant.com`) se dejan intactas.

### 3.1 Tools de **bitel** ([tools/bitel.js](aiyou-voice-backend/src/tools/bitel.js))

| Tool | Método | Path (path-only, host se reescribe) | Body / params |
|---|---|---|---|
| `queryCorpus` | (built-in Ultravox) | corpus_id `0d68b754-32d0-4c9d-966c-0e17aaeab8e5`, max_results 3 | — |
| `obtenerPlanesDisponibles` | GET | `/api/crm/tools/catalogo` | — |
| `tipificarLlamada` | PUT | `/api/crm/tools/llamadas/nuevaTipificacion` | `id_tipificacion_llamada:int`, `provider_call_id:int` |
| `buscarSucursal` | POST | `/api/crm/llamadas/buscarSucursal` ⚠️ | `termino:string`, `id_empresa:int` |

> ⚠️ **INCONSISTENCIA detectada**: `buscarSucursal` apunta a `/api/crm/llamadas/buscarSucursal` (sin `/tools/`), mientras que en el repo local `bitel-portabilidad` la ruta es `/api/crm/tools/llamadas/buscarSucursal` ([src/routes/crm/llamada.route.js:52](src/routes/crm/llamada.route.js#L52)). Las otras dos tools sí incluyen `/tools/`. Esto probablemente está rompiendo la tool en producción.

### 3.2 Otros archivos de tools

- [tools/viva.js](aiyou-voice-backend/src/tools/viva.js) — usa CRM **Sperant** (`sperantKey` desde env `SPERANT_KEY`) + JWT propio (`process.env.JWT`). Tool `obtenerLead` GET `viva-api.ai-you.io/api/crm/prospectos/{id}` y `crearClienteSperant` POST.
- [tools/auna.js](aiyou-voice-backend/src/tools/auna.js)
- [tools/encuesta.js](aiyou-voice-backend/src/tools/encuesta.js)
- [tools/generica.js](aiyou-voice-backend/src/tools/generica.js) — fallback si no se reconoce la empresa.

### 3.3 Tools built-in añadidas siempre

[ultravoxapi.service.js:106](aiyou-voice-backend/src/services/ultravoxapi.service.js#L106): se inyecta `{ toolName: "hangUp" }` además de las de la empresa.

---

## 4. Prompt de bitel ([prompts/bitel.md](aiyou-voice-backend/src/prompts/bitel.md))

- Persona "Sofía" — migración prepago → postpago.
- Variables sustituidas en runtime ([ultravoxapi.service.js:62-68](aiyou-voice-backend/src/services/ultravoxapi.service.js#L62-L68)):
  - `{{datos}}` → JSON completo de `data`
  - `{{timestamp}}` → ISO actual
  - `{{tipificaciones}}` → `extras.tipificaciones`
  - `{{key}}` → cualquier campo de `data` (ej. `{{nombre_cliente}}`, `{{telefono}}`)
- En el bloque "Tools Disponibles" del prompt **solo** se listan `obtenerPlanesDisponibles`, `queryCorpus`, `hangUp`. **No se mencionan** `tipificarLlamada` ni `buscarSucursal`, aunque estén registradas en `bitel.js` — el modelo puede no invocarlas si no se las describe.

---

## 5. Servicios clave

| Servicio | Responsabilidad |
|---|---|
| `services/ami.service.js` | Asterisk Manager: originate, hangup, redirect |
| `services/ari.service.js` | Asterisk REST: hangup, playSound, control de canales |
| `services/external-media.service.js` (77KB) | TCP AudioSocket :9092, sesiones de audio, cola, mutex de canales por empresa, scheduling |
| `services/ultravoxapi.service.js` | Crea sesión WS con Ultravox, carga tools, formatea prompt |
| `services/ultravox.service.js` | Wrapper de sesiones Ultravox |
| `services/call.service.js` | Helpers (speak, hangup, sessions) |
| `services/crm.service.js` | Callbacks al CRM: `upload-audio`, `transcripcion`, `call-entrada`, `call-terminada`, `call-no-contesta` |
| `services/tts.service.js` | TTS WS local |

### Endpoints del CRM que el backend invoca (host = `https://${x-origin-service}`)

- `POST /api/asterisk/upload-audio` (multipart: audio mp3, id_llamada, segundos, id_empresa)
- `POST /api/asterisk/transcripcion` (id_llamada, id_ultravox_call, metadata, transcripcion)
- `POST /api/asterisk/call-entrada` (provider_call_id, id_llamada)
- `POST /api/asterisk/call-terminada` (provider_call_id, id_llamada)
- `POST /api/asterisk/call-no-contesta` (provider_call_id, id_llamada, status)

Auth: `Authorization: Bearer ${config.crm.token}`.

---

## 6. Configuración (.env esperado)

Desde `.env.example`:

```
PORT=3302
AUDIOSOCKET_PORT=9092
HOST=0.0.0.0
AMI_HOST=127.0.0.1  AMI_PORT=5038  AMI_USERNAME=admin  AMI_PASSWORD=...
ARI_URL=http://127.0.0.1:8088  ARI_USERNAME=aiyou  ARI_PASSWORD=...  ARI_APP=aiyouvoice
TTS_URL=ws://localhost:9000/ws/tts
TTS_OUTPUT_DIR=/var/lib/asterisk/sounds/tts
ULTRAVOX_URL=ws://localhost:8000/ws/voice
```

Además se usan en runtime: `JWT`, `SPERANT_KEY` (ver `tools/viva.js`), `config.ultravox.key`, `config.crm.token`.

---

## 7. Resumen para validar tools de bitel

Para validar end-to-end una tool en una llamada bitel real:

1. **Confirmar registro**: tool aparece en `tools/bitel.js` y la URL apunta a un path real del backend `bitel-portabilidad`.
2. **Confirmar prompt**: la tool está descrita en `prompts/bitel.md` (sección "Tools Disponibles") — si no, el modelo no la invocará.
3. **Confirmar reescritura de host**: el cliente CRM envía header `x-origin-service: portabilidad-bitel.ai-you.io` (o el que corresponda) — `processTools` sustituye el host pero **conserva el path**; cualquier mismatch de path queda sin tocar.
4. **Confirmar ruta local**: el path debe existir en `bitel-portabilidad/src/routes/...`.

**Acciones sugeridas**:
- Corregir URL de `buscarSucursal` en `tools/bitel.js` agregando `/tools/`: `https://portabilidad-bitel.ai-you.io/api/crm/tools/llamadas/buscarSucursal`.
- Agregar `tipificarLlamada` y `buscarSucursal` a la sección "Tools Disponibles" del prompt `bitel.md` para que el modelo las invoque.
