const logger = require("../../config/logger/loggerClient");

const url_token = "https://cobranzas-auna.oncosalud.pe/api/Autorizacion/CrearToken"
const url_cambio = "https://cobranzas-auna.oncosalud.pe/api/CambioTarjeta/CrearEnlace"
const url_pago = "https://cobranzas-auna.oncosalud.pe/api/PagoLinea/CrearEnlace"

class PagoService {
  async obtenerToken(alcance) {
    const response = await fetch(url_token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_id: process.env.CLIENTE_ID,
        cliente_secreto: process.env.CLIENTE_SECRETO,
        tipo_acceso: "client_call_credentials",
        alcance: alcance
      })
    });

    const result = await response.json();

    return result?.tipo_token + " " + result?.token_acceso
  }


  async generarLinkPago(grupo_familiar) {
    const token = await this.obtenerToken("PagoCuota/CrearEnlace");

    const response = await fetch(url_pago, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": token,
      },
      body: JSON.stringify({
        grupo_familiar: grupo_familiar,
        ope_origen: 36,
        ope_call: "93"
      })
    });

    if (response.ok) {
      const result = await response.json();

      return result.enlace;
    } else {
      return null
    }
  }

  async generarLinkCambio(grupo_familiar) {
    const token = await this.obtenerToken("CambioTarjeta/CrearEnlace");

    const response = await fetch(url_cambio, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": token,
      },
      body: JSON.stringify({
        grupo_familiar: grupo_familiar,
        ope_origen: 36,
        ope_call: "93"
      })
    });

    if (response.ok) {
      const result = await response.json();

      return result.enlace;
    }
  }
}

module.exports = new PagoService();