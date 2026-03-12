# API de Llamadas - Integración con Ultravox

## Información General

| Campo | Valor |
|-------|-------|
| **Proveedor** | Ultravox (AI-YOU / Maravia) |
| **Base URL** | `https://bot.ai-you.io/api/calls/ultravox` |
| **Timeout** | 30 segundos |
| **Max. Concurrentes** | 200 llamadas |
| **Polling Interval** | 10 segundos |

---

## Endpoints de Ultravox

### 1. Realizar Llamada

```http
POST https://bot.ai-you.io/api/calls/ultravox
Content-Type: application/json
```

#### Request Body

```json
{
  "destination": "+51987654321",
  "data": {
    "nombre_completo": "Juan Pérez García",
    "celular": "+51987654321",
    "campo_adicional_1": "valor1",
    "campo_adicional_2": "valor2"
  },
  "extras": {
    "voice": "12063647-093a-43fb-9e23-2e4ad5a2bde1",
    "tipificaciones": [
      {
        "id": 1,
        "nombre": "Interesado",
        "color": "#00FF00",
        "hijos": [
          {
            "id": 2,
            "nombre": "Agenda cita",
            "color": "#0000FF"
          }
        ]
      },
      {
        "id": 3,
        "nombre": "No interesado",
        "color": "#FF0000"
      }
    ],
    "empresa": {
      "id": 123,
      "nombre": "Mi Empresa SAC"
    }
  }
}
```

#### Descripción de Campos

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `destination` | string | Sí | Número de teléfono destino con código de país (ej: `+51987654321`) |
| `data` | object | Sí | Datos del contacto que se usarán en la llamada |
| `data.nombre_completo` | string | No | Nombre completo del contacto |
| `data.celular` | string | Sí | Número de celular del contacto |
| `data.*` | any | No | Campos adicionales dinámicos del contacto (json_adicional) |
| `extras` | object | Sí | Configuración adicional de la llamada |
| `extras.voice` | string | Sí | UUID del modelo de voz/bot a utilizar |
| `extras.tipificaciones` | array | Sí | Árbol de tipificaciones disponibles para clasificar la llamada |
| `extras.empresa` | object | Sí | Información de la empresa |
| `extras.empresa.id` | number | Sí | ID de la empresa |
| `extras.empresa.nombre` | string | Sí | Nombre comercial de la empresa |

#### Response Exitosa

```json
{
  "channelId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "initiated",
  "message": "Call initiated successfully"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `channelId` | string | UUID único de la llamada (se guarda como `provider_call_id`) |
| `status` | string | Estado inicial de la llamada |

#### Response Error

```json
{
  "error": "Invalid destination number",
  "code": "INVALID_DESTINATION"
}
```

---

### 2. Obtener Sesiones Activas

```http
GET https://bot.ai-you.io/api/calls/ultravox/sessions
Content-Type: application/json
```

#### Response Exitosa

```json
{
  "data": [
    {
      "channelId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "destination": "+51987654321",
      "status": "in_progress",
      "startedAt": "2024-01-15T10:30:00Z"
    },
    {
      "channelId": "b2c3d4e5-f6g7-8901-bcde-fg2345678901",
      "destination": "+51912345678",
      "status": "ringing",
      "startedAt": "2024-01-15T10:31:00Z"
    }
  ]
}
```

---

## Flujo de Ejecución de Campaña

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE EJECUCIÓN                           │
└─────────────────────────────────────────────────────────────────┘

1. POST /api/crm/campania-ejecuciones/ejecutar
   │
   ├─► Crear registro en campania_ejecucion (estado: 'pendiente')
   │
   ├─► Responder HTTP 202 (procesamiento en background)
   │
   └─► PROCESO ASÍNCRONO:
       │
       ├─► Cargar TODOS los números de las bases seleccionadas
       │   └─► Pagina por página (50 registros c/u)
       │
       ├─► Actualizar estado a 'en_proceso' + fecha_inicio
       │
       ├─► DESPACHAR LOTE INICIAL (hasta 200 llamadas)
       │   │
       │   └─► Por cada número:
       │       ├─► Formatear teléfono (agregar '51' si falta)
       │       ├─► POST a Ultravox API
       │       └─► Si OK: INSERT en tabla 'llamada'
       │
       ├─► POLLING LOOP (cada 10 segundos)
       │   │
       │   ├─► Verificar si fue cancelada
       │   ├─► GET /sessions para ver sesiones activas
       │   ├─► Calcular slots: 200 - sesiones_activas
       │   └─► Despachar más números hasta llenar slots
       │
       └─► FINALIZAR
           ├─► estado_ejecucion = 'ejecutado'
           ├─► fecha_fin = NOW()
           └─► resultado = { total, completadas, fallidas }
```

---

## Endpoints del CRM

### Ejecutar Campaña

```http
POST /api/crm/campania-ejecuciones/ejecutar
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "id_campania": 123,
  "ids_base_numero": [1, 2, 3]
}
```

**Response:**
```json
{
  "msg": "Ejecución iniciada en segundo plano",
  "data": {
    "idEjecucion": 456
  }
}
```

---

### Cancelar Ejecución

```http
PATCH /api/crm/campania-ejecuciones/{id}/cancelar
Authorization: Bearer {token}
```

**Response:**
```json
{
  "msg": "Ejecución cancelada exitosamente"
}
```

---

### Ver Estado de Ejecución

```http
GET /api/crm/campania-ejecuciones/{id}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": {
    "id": 456,
    "id_campania": 123,
    "estado_ejecucion": "ejecutado",
    "fecha_inicio": "2024-01-15T10:30:00Z",
    "fecha_fin": "2024-01-15T11:45:00Z",
    "resultado": {
      "total": 1500,
      "completadas": 1480,
      "fallidas": 20
    }
  }
}
```

---

### Listar Llamadas por Ejecución

```http
GET /api/crm/llamadas/ejecucion/{idCampaniaEjecucion}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "provider_call_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "id_estado_llamada": 1,
      "id_tipificacion_llamada": 5,
      "fecha_registro": "2024-01-15T10:32:00Z"
    }
  ]
}
```

---

### Actualizar Tipificación de Llamada

```http
PUT /api/crm/llamadas/nuevaTipificacion
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "provider_call_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "id_tipificacion_llamada": 5
}
```

---

### Subir Audio de Llamada

```http
POST /api/crm/llamadas/upload-audio
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `audio` | file | Archivo de audio (mp3, wav, etc.) |
| `id_llamada` | number | ID de la llamada en BD |
| `id_ultravox_call` | string | ID de sesión de Ultravox |
| `metadata_ultravox_call` | string | JSON con metadata de la llamada |
| `provider_call_id` | string | channelId de Ultravox |

---

## Estructura de Base de Datos

### Tabla: `llamada`

```sql
CREATE TABLE llamada (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_empresa INT NOT NULL,
  id_campania INT,
  id_base_numero INT,
  id_base_numero_detalle INT,
  id_campania_ejecucion INT,
  provider_call_id VARCHAR(100) UNIQUE,  -- channelId de Ultravox
  codigo_llamada VARCHAR(50),
  id_tipificacion_llamada INT,
  id_estado_llamada INT DEFAULT 1,
  archivo_llamada VARCHAR(500),           -- URL en S3
  id_ultravox_call VARCHAR(100),
  metadata_ultravox_call JSON,
  estado_registro TINYINT DEFAULT 1,
  fecha_registro DATETIME DEFAULT NOW(),
  usuario_registro INT,
  fecha_actualizacion DATETIME,
  usuario_actualizacion INT
);
```

### Tabla: `campania_ejecucion`

```sql
CREATE TABLE campania_ejecucion (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_empresa INT NOT NULL,
  id_campania INT NOT NULL,
  id_base_numero INT,
  fecha_programada DATETIME,
  fecha_inicio DATETIME,
  fecha_fin DATETIME,
  estado_ejecucion ENUM('pendiente','en_proceso','ejecutado','cancelado','fallido'),
  resultado JSON,
  mensaje_error TEXT,
  estado_registro TINYINT DEFAULT 1,
  fecha_registro DATETIME DEFAULT NOW(),
  usuario_registro INT
);
```

---

## Configuración

### Variables de Entorno

```env
ULTRAVOX_API_URL=https://bot.ai-you.io/api/calls/ultravox
```

### Constantes del Servicio

```javascript
const MAX_CONCURRENT = 200;      // Máximo de llamadas simultáneas
const POLL_INTERVAL = 10000;     // Intervalo de polling en ms (10 seg)
const TIMEOUT = 30000;           // Timeout por request en ms
```

---

## Código del Servicio

**Archivo:** `src/services/llamada/llamada.service.js`

```javascript
const axios = require('axios');

const ULTRAVOX_API_URL = process.env.ULTRAVOX_API_URL || 'https://bot.ai-you.io/api/calls/ultravox';
const MAX_CONCURRENT = 200;
const POLL_INTERVAL = 10000;

class LlamadaService {
    constructor() {
        this.client = axios.create({
            baseURL: ULTRAVOX_API_URL,
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        this.ejecucionesActivas = new Map();
    }

    // Obtener sesiones activas en Ultravox
    async getSesionesActivas() {
        const response = await this.client.get('/sessions');
        return response.data?.data || [];
    }

    // Realizar una llamada
    async realizarLlamada(body) {
        const response = await this.client.post('', body);
        return response.data;
    }

    // Formatear teléfono con código de país
    formatearTelefono(telefono) {
        const limpio = String(telefono).replace(/\D/g, '');
        return limpio.startsWith('51') ? limpio : `51${limpio}`;
    }

    // Procesar llamadas de forma asíncrona
    async procesarLlamadasAsync({ idEjecucion, idCampania, idsBaseNumero, idEmpresa, tipificaciones }) {
        // ... ver código completo en el archivo
    }
}

module.exports = new LlamadaService();
```

---

## Ejemplo Completo de Integración

```javascript
// 1. Ejecutar campaña
const response = await axios.post('/api/crm/campania-ejecuciones/ejecutar', {
  id_campania: 123,
  ids_base_numero: [1, 2, 3]
}, {
  headers: { Authorization: `Bearer ${token}` }
});

const idEjecucion = response.data.data.idEjecucion;

// 2. Monitorear estado (polling)
const checkStatus = async () => {
  const status = await axios.get(`/api/crm/campania-ejecuciones/${idEjecucion}`);
  console.log('Estado:', status.data.data.estado_ejecucion);

  if (status.data.data.estado_ejecucion === 'ejecutado') {
    console.log('Resultado:', status.data.data.resultado);
  }
};

// 3. Listar llamadas generadas
const llamadas = await axios.get(`/api/crm/llamadas/ejecucion/${idEjecucion}`);
console.log('Total llamadas:', llamadas.data.data.length);
```

---

## Notas Importantes

1. **Formato de teléfono:** Siempre enviar con código de país (`+51` para Perú)
2. **ID de voz:** El `voice` UUID debe ser válido en Ultravox
3. **Tipificaciones:** Se envían como árbol jerárquico con máximo 5 niveles
4. **Concurrencia:** El sistema mantiene máximo 200 llamadas activas
5. **Almacenamiento:** Los audios se guardan en AWS S3 (bucket: `aiyou-uploads`)
