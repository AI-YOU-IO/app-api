const logger = require("../../config/logger/loggerClient");
const { pool } = require("../../config/dbConnection");

const url_token = "https://cobranzas-auna.oncosalud.pe/api/Autorizacion/CrearToken"
const url_cambio = "https://cobranzas-auna.oncosalud.pe/api/CambioTarjeta/CrearEnlace"
const url_pago = "https://cobranzas-auna.oncosalud.pe/api/PagoLinea/CrearEnlace"

// Rate limiter: máximo 50 requests por 60 segundos (margen de seguridad sobre el límite de 60)
const RATE_LIMIT = 50;
const RATE_WINDOW_MS = 60_000;

class PagoService {
  constructor() {
    // Cache de tokens: { alcance: { token, expiresAt } }
    this.tokenCache = new Map();
    // Cola de requests pendientes
    this.queue = [];
    this.processing = false;
    // Timestamps de requests realizadas en la ventana actual
    this.requestTimestamps = [];
  }

  // --- Rate Limiter con cola ---

  _cleanOldTimestamps() {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < RATE_WINDOW_MS);
  }

  _enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      this._cleanOldTimestamps();

      if (this.requestTimestamps.length >= RATE_LIMIT) {
        // Esperar hasta que el request más antiguo salga de la ventana
        const oldest = this.requestTimestamps[0];
        const waitMs = RATE_WINDOW_MS - (Date.now() - oldest) + 100;
        logger.info(`[pago.service.js] Rate limit alcanzado, esperando ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      const { fn, resolve, reject } = this.queue.shift();
      this.requestTimestamps.push(Date.now());

      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    this.processing = false;
  }

  // --- Fetch con retry en 429 ---

  async _fetchWithRetry(url, options, maxRetries = 3) {
    return this._enqueue(async () => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, options);

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 30_000);
          logger.warn(`[pago.service.js] 429 recibido (intento ${attempt}/${maxRetries}), esperando ${waitMs}ms`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, waitMs));
            // Registrar el retry como nueva request en la ventana
            this.requestTimestamps.push(Date.now());
            continue;
          }
        }

        return response;
      }
    });
  }

  // --- Cache de token ---

  async obtenerToken(alcance) {
    const cached = this.tokenCache.get(alcance);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const response = await this._fetchWithRetry(url_token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_id: process.env.CLIENTE_ID,
        cliente_secreto: process.env.CLIENTE_SECRETO,
        tipo_acceso: "client_call_credentials",
        alcance: alcance
      })
    });

    const text = await response.text();
    if (!text) {
      logger.error(`[pago.service.js] obtenerToken: respuesta vacía - status=${response.status}, alcance=${alcance}`);
      throw new Error(`API token respondió vacío (status ${response.status})`);
    }
    try {
      const result = JSON.parse(text);
      const token = result?.tipo_token + " " + result?.token_acceso;

      // Cachear con margen de 5 segundos antes de expirar
      const expiresAt = new Date(Date.now() + 55_000);
      this.tokenCache.set(alcance, { token, expiresAt: expiresAt.getTime() });

      // Guardar en BD
      try {
        await pool.execute(
          `INSERT INTO token (token, tipo, fecha_expiracion, id_empresa) VALUES ($1, $2, $3, $4)`,
          [token, alcance, expiresAt, 4]
        );
      } catch (dbErr) {
        logger.error(`[pago.service.js] Error al guardar token en BD: ${dbErr.message}`);
      }

      return token;
    } catch (e) {
      logger.error(`[pago.service.js] obtenerToken: JSON inválido - status=${response.status}, body=${text.substring(0, 300)}`);
      throw new Error(`API token JSON inválido (status ${response.status})`);
    }
  }


  async generarLinkPago(grupo_familiar, telefono,  chatId = null, idPersona = null) {
    const token = await this.obtenerToken("PagoCuota/CrearEnlace");

    logger.info('[Request] generarLinkPago', {
      body: { grupo_familiar, telefono, ope_origen: 36, ope_call: "93" }
    });

    const response = await this._fetchWithRetry(url_pago, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": token,
      },
      body: JSON.stringify({
        grupo_familiar: grupo_familiar,
        telefono: telefono,
        ope_origen: 36,
        ope_call: "93"
      })
    });

    const textPago = await response.text();
    if (!response.ok || !textPago) {
      logger.error(`[pago.service.js] generarLinkPago: fallo - status=${response.status}, grupo_familiar=${grupo_familiar}, telefono=${telefono}, body=${(textPago || 'vacío').substring(0, 300)}`);
      return null;
    }
    try {
      const result = JSON.parse(textPago);
      const enlace = result.enlace;
      logger.info('[Response] generarLinkPago', { enlace });

      if (enlace && chatId) {
        try {
          await pool.execute(
            `INSERT INTO link_pago (id_chat, id_persona, id_empresa, link) VALUES ($1, $2, $3, $4)`,
            [chatId, idPersona, 4, enlace]
          );
        } catch (dbErr) {
          logger.error(`[pago.service.js] Error al guardar link_pago en BD: ${dbErr.message}`);
        }
      }

      return enlace;
    } catch (e) {
      logger.error(`[pago.service.js] generarLinkPago: JSON inválido - status=${response.status}, grupo_familiar=${grupo_familiar}, body=${textPago.substring(0, 300)}`);
      return null;
    }
  }

  async generarLinkCambio(grupo_familiar, telefono, chatId = null, idPersona = null) {
    const token = await this.obtenerToken("CambioTarjeta/CrearEnlace");

    logger.info('[Request] generarLinkCambio', {
      body: { grupo_familiar, telefono, ope_origen: 36, ope_call: "93" }
    });

    const response = await this._fetchWithRetry(url_cambio, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": token,
      },
      body: JSON.stringify({
        grupo_familiar: grupo_familiar,
        telefono: telefono,
        ope_origen: 36,
        ope_call: "93"
      })
    });

    const textCambio = await response.text();
    if (!response.ok || !textCambio) {
      logger.error(`[pago.service.js] generarLinkCambio: fallo - status=${response.status}, grupo_familiar=${grupo_familiar}, telefono=${telefono}, body=${(textCambio || 'vacío').substring(0, 300)}`);
      return null;
    }
    try {
      const result = JSON.parse(textCambio);
      const enlace = result.enlace;
      logger.info('[Response] generarLinkCambio', { enlace });

      if (enlace && chatId) {
        try {
          await pool.execute(
            `INSERT INTO link_pago (id_chat, id_persona, id_empresa, link) VALUES ($1, $2, $3, $4)`,
            [chatId, idPersona, 4, enlace]
          );
        } catch (dbErr) {
          logger.error(`[pago.service.js] Error al guardar link_pago en BD: ${dbErr.message}`);
        }
      }

      return enlace;
    } catch (e) {
      logger.error(`[pago.service.js] generarLinkCambio: JSON inválido - status=${response.status}, grupo_familiar=${grupo_familiar}, body=${textCambio.substring(0, 300)}`);
      return null;
    }
  }
}

module.exports = new PagoService();
