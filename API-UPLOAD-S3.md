# API de Upload de Audios de Llamadas a S3

## Descripción General

Este documento describe el endpoint para subir audios de llamadas al bucket S3 de la plataforma. Los archivos se organizan con la siguiente estructura:

```
app/{id_empresa}/llamadas/{fecha}/{audio}
```

---

## Configuración Requerida

### Variables de Entorno (.env)

```env
AWS_ACCESS_KEY_ID=AKIAYUTEHVRE3WRAGFXX
AWS_SECRET_ACCESS_KEY=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
AWS_REGION=us-east-1
S3_BUCKET=aiyou-uploads
S3_PLATFORM_FOLDER=app
```

---

## Endpoint de Upload

### Subir Audio de Llamada

| Campo | Valor |
|-------|-------|
| **Método** | `POST` |
| **Endpoint** | `/api/crm/llamadas/upload-audio` |
| **Content-Type** | `multipart/form-data` |
| **Autenticación** | Bearer Token |

**Parámetros (form-data):**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `audio` | file | Sí | Archivo de audio (mp3, wav, ogg, m4a, webm) |
| `id_llamada` | number | Sí | ID de la llamada en la tabla `llamada` |
| `id_ultravox_call` | string | No | ID de Ultravox de la llamada |
| `metadata_ultravox_call` | json/string | No | Metadata de Ultravox (JSON o string) |
| `provider_call_id` | string | No | ID del proveedor de la llamada |

**Ejemplo cURL:**

```bash
curl -X POST http://localhost:3020/api/crm/llamadas/upload-audio \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@/ruta/local/grabacion.mp3" \
  -F "id_llamada=123" \
  -F "id_ultravox_call=ultravox_789" \
  -F "metadata_ultravox_call={\"duration\":120,\"status\":\"completed\"}" \
  -F "provider_call_id=provider_abc123"
```

**Respuesta Exitosa (200):**

```json
{
  "msg": "Audio subido exitosamente",
  "data": {
    "id_llamada": 123,
    "archivo_llamada": "https://aiyou-uploads.s3.us-east-1.amazonaws.com/app/1/llamadas/2026-03-12/llamadas_20260312153045.mp3",
    "id_ultravox_call": "ultravox_789",
    "provider_call_id": "provider_abc123"
  }
}
```

**Ruta S3 generada:**
```
https://aiyou-uploads.s3.us-east-1.amazonaws.com/app/1/llamadas/2026-03-12/llamadas_20260312153045.mp3
```

---

## Campos Actualizados en Base de Datos

El endpoint actualiza los siguientes campos en la tabla `llamada`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `archivo_llamada` | varchar | URL del audio en S3 |
| `id_ultravox_call` | varchar | ID de Ultravox de la llamada |
| `metadata_ultravox_call` | json | Metadata de Ultravox (almacenado como JSON) |

La llamada se identifica por `provider_call_id`.

---

## Estructura de Ruta S3

### Formato

```
app/{id_empresa}/llamadas/{fecha}/{filename}
```

### Componentes

| Componente | Descripción | Ejemplo |
|------------|-------------|---------|
| `app` | Carpeta raíz de la plataforma | `app` |
| `id_empresa` | ID de la empresa del usuario | `1`, `2`, `general` |
| `llamadas` | Carpeta de audios de llamadas | `llamadas` |
| `fecha` | Fecha de subida (YYYY-MM-DD) | `2026-03-12` |
| `filename` | Nombre generado | `llamadas_20260312153045.mp3` |

### Ejemplos de Rutas

```
app/1/llamadas/2026-03-12/llamadas_20260312153045.mp3
app/2/llamadas/2026-03-12/llamadas_20260312160030.wav
app/1/llamadas/2026-03-13/llamadas_20260313090015.ogg
```

---

## Restricciones de Archivo

### Audios (Llamadas)

| Restricción | Valor |
|-------------|-------|
| Tamaño máximo | 50 MB |
| Tipos permitidos | `mp3`, `wav`, `ogg`, `m4a`, `webm` |

---

## Respuestas de Error

### Error de Tipo de Archivo (400)

```json
{
  "success": false,
  "message": "Solo se permiten archivos de audio (mp3, wav, ogg, m4a, webm)"
}
```

### Error de Tamaño (400)

```json
{
  "success": false,
  "message": "El archivo excede el tamaño máximo permitido (50MB)"
}
```

### Error de Autenticación (401)

```json
{
  "success": false,
  "message": "Token no proporcionado o inválido"
}
```

### Error Sin Archivo (400)

```json
{
  "success": false,
  "message": "No se proporcionó ningún archivo de audio"
}
```

---

## Servicio S3 (Backend)

### Ubicación
`src/services/s3.service.js`

### Métodos

| Método | Descripción |
|--------|-------------|
| `uploadFile(file, folder, idEmpresa)` | Sube archivo y retorna URL |
| `deleteFile(fileUrl)` | Elimina archivo por URL |

### Uso en Controllers

```javascript
const s3Service = require('../../services/s3.service.js');

// Subir audio de llamada
const audioUrl = await s3Service.uploadFile(req.file, 'llamadas', idEmpresa);

// Eliminar audio
await s3Service.deleteFile(oldAudioUrl);
```

---

## Notas

- El bucket S3 es: `aiyou-uploads`
- La región es: `us-east-1`
- Las URLs generadas son públicas
- El folder utilizado es: `llamadas`
- Si no se proporciona `id_empresa`, se usa `'general'` como fallback
- El nombre del archivo incluye timestamp para evitar colisiones
