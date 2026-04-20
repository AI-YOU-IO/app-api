const genericaTools = [
  {
    toolName: "queryCorpus",
    parameterOverrides: {
      corpus_id: "0d68b754-32d0-4c9d-966c-0e17aaeab8e5",
      max_results: 3
    }
  },
  {
    temporaryTool: {
      modelToolName: "obtenerPlanesDisponibles",
      description: "Obtiene los planes disponibles",
      timeout: "5s",
      http: {
        baseUrlPattern: `https://portabilidad-bitel.ai-you.io/api/crm/tools/catalogo`,
        httpMethod: "GET"
      }
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
      description: "Busca sucursales cercanas al cliente. La búsqueda compara ÚNICAMENTE contra departamento, provincia y distrito (NO contra dirección ni nombre). Formato requerido del término: 'departamento-provincia-distrito' (ej: 'lima-lima-san isidro', 'arequipa-arequipa-cerro colorado'). Devuelve máximo 3 sucursales y un objeto meta con match_nivel (distrito|provincia|departamento|aproximado|ninguno) y un mensaje explicativo.",
      timeout: "5s",
      http: {
        baseUrlPattern: "https://portabilidad-bitel.ai-you.io/api/crm/tools/llamadas/buscarSucursal",
        httpMethod: "POST"
      },
      staticParameters: [
        {
          name: "id_empresa",
          location: "PARAMETER_LOCATION_BODY",
          value: 8
        }
      ],
      dynamicParameters: [
        {
          name: "termino",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Término de búsqueda en formato 'departamento-provincia-distrito' (ej: 'lima-lima-comas', 'arequipa-arequipa-cerro colorado'). Si el cliente no da los 3 niveles, deja vacía la parte faltante manteniendo los guiones (ej: 'lima-lima-' o '--comas').",
          },
          required: true,
        },
      ]
    }
  },
  {
    temporaryTool: {
      modelToolName: "obtenerFechaHora",
      description: "Obtiene la fecha y hora actual del país objetivo. Útil para saber el día de la semana, fecha actual y hora local del cliente para coordinar agendamientos, recordatorios o validar horarios. El input es el nombre del país (ej: 'Peru', 'Colombia', 'Mexico') o su código ISO de 2 letras (ej: 'PE', 'CO', 'MX').",
      timeout: "5s",
      http: {
        baseUrlPattern: "https://portabilidad-bitel.ai-you.io/api/crm/tools/utilidades/fechaHora",
        httpMethod: "POST"
      },
      dynamicParameters: [
        {
          name: "pais",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Nombre del país objetivo (ej: 'Peru', 'Colombia', 'Mexico') o código ISO de 2 letras (ej: 'PE', 'CO', 'MX').",
          },
          required: true,
        },
      ]
    }
  },
];

export default genericaTools;
