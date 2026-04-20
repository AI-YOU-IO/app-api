const aunaTools = [
  {
    temporaryTool: {
      modelToolName: "obtenerLinkPago",
      description: "Obtienes el enlace de link de pago para enviarselo al cliente",
      timeout: "10s",
      http: {
        baseUrlPattern: "https://portabilidad-bitel.ai-you.io/api/crm/tools/link-pago",
        httpMethod: "POST"
      },
      dynamicParameters: [
        {
          name: "grupo_familiar",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Codigo importante para generar el enlace solicitado.",
          },
          required: true,
        },
        {
          name: "telefono",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Número telefónico de la persona.",
          },
          required: true,
        },
      ]
    }
  },
  {
    temporaryTool: {
      modelToolName: "obtenerLinkCambio",
      description: "Obtienes el enlace de link de cambio de tarjeta para enviarselo al cliente",
      timeout: "10s",
      http: {
        baseUrlPattern: "https://portabilidad-bitel.ai-you.io/api/crm/tools/link-cambio",
        httpMethod: "POST"
      },
      dynamicParameters: [
        {
          name: "grupo_familiar",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Codigo importante para generar el enlace solicitado.",
          },
          required: true,
        },
        {
          name: "telefono",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Número telefónico de la persona.",
          },
          required: true,
        },
      ]
    }
  },
  {
    temporaryTool: {
      modelToolName: "enviarLinkPorWhatsapp",
      description: "Envia el link genredado al número del cliente por medio de Whatsapp",
      timeout: "10s",
      http: {
        baseUrlPattern: "https://portabilidad-bitel.ai-you.io/api/crm/tools/plantillas-whatsapp/enviar",
        httpMethod: "POST"
      },
      dynamicParameters: [
        {
          name: "phone",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Número de celular del cliente a enviar el mensaje Whatsapp",
          },
          required: true,
        },
        {
          name: "template_name",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Mensaje a enviar. Aqui se envia el enlace generado sea pago o cambio de tarjeta",
          },
          required: true,
        },
        {
          name: "id_empresa",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "Id de la empresa que pertenece la persona",
          },
          required: true,
        },
      ]
    }
  },
  {
    temporaryTool: {
      modelToolName: "tipificarLlamada",
      description: "Cambia la tipificacion de la persona con un id",
      http: {
        baseUrlPattern: "https://portabilidad-bitel.ai-you.io/api/crm/tools/llamadas/nuevaTipificacion",
        httpMethod: "PUT"
      },
      dynamicParameters: [
        {
          name: "id_tipificacion_llamada",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "ID de la tificación correspondiente a registrar a la persona",
          },
          required: true,
        },
        {
          name: "provider_call_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "ID de la llamada a tipificar",
          },
          required: true,
        },
      ]
    }
  },
  {
    temporaryTool: {
      modelToolName: "buscarSucursal",
      description: "Busca sucursales disponibles según un término de búsqueda",
      timeout: "5s",
      http: {
        baseUrlPattern: "https://portabilidad-bitel.ai-you.io/api/crm/llamadas/buscarSucursal",
        httpMethod: "POST"
      },
      dynamicParameters: [
        {
          name: "termino",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Término de búsqueda para encontrar la sucursal",
          },
          required: true,
        },
        {
          name: "id_empresa",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "ID de la empresa para buscar sucursales",
          },
          required: true,
        },
      ]
    }
  },
]

export default aunaTools;