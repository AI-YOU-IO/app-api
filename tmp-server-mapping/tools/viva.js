import dotenv from 'dotenv';
dotenv.config();

const token = process.env.JWT;
const sperantKey = process.env.SPERANT_KEY;

// Reutilizables
const bearerRequirements = {
  httpSecurityOptions: {
    options: [
      {
        requirements: {
          authKey: {
            httpAuth: {
              scheme: "Bearer"
            }
          }
        }
      }
    ]
  }
};

const sperantRequirements = {
  httpSecurityOptions: {
    options: [
      {
        requirements: {
          sperantAuth: {
            httpAuth: {
              scheme: ""
            }
          }
        }
      }
    ]
  }
};

const bearerAuth = { "authKey": token };
const sperantAuth = { "sperantAuth": sperantKey };

const vivaTools = [
  {
    temporaryTool: {
      modelToolName: "obtenerLead",
      description: "Obtiene la informacion del lead según el id",
      dynamicParameters: [
        {
          name: "id",
          location: "PARAMETER_LOCATION_PATH",
          schema: {
            type: "string",
            description: "Id del lead o cliente"
          },
          required: true,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/prospectos/{id}",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "crearClienteSperant",
      description: "Te permite crear un nuevo cliente en el CRM Sperant",
      dynamicParameters: [
        {
          name: "fname",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Nombres del prospecto"
          },
          required: true,
        },
        {
          name: "lname",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Apellidos del prospecto"
          },
          required: true,
        },
        {
          name: "phone",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Numero celular del prospecto"
          },
          required: true,
        },
        {
          name: "document",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "DNI del prospecto"
          },
          required: true,
        },
        {
          name: "project_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "sperant_id del proyecto que el prospecto seleccionó"
          },
          required: true,
        },
        {
          name: "extra_fields",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "object",
            description: "Campos extras para la creación",
            dynamicParameters: [
              {
                name: "perfilamiento",
                schema: {
                  type: "boolean",
                  description: "True o false si el prospecto acepta el perfilamiento",
                },
                required: true,
              }
            ]
          },
          required: true,
        },
      ],
      staticParameters: [
        {
          name: "input_channel_id",
          location: "PARAMETER_LOCATION_BODY",
          value: 13
        },
        {
          name: "source_id",
          location: "PARAMETER_LOCATION_BODY",
          value: 25
        },
        {
          name: "agent_id",
          location: "PARAMETER_LOCATION_BODY",
          value: 533
        },
        {
          name: "interest_type_id",
          location: "PARAMETER_LOCATION_BODY",
          value: 11
        },
        {
          name: "utm_source",
          location: "PARAMETER_LOCATION_BODY",
          value: "Agente IA"
        },
      ],
      http: {
        baseUrlPattern: "https://api.sperant.com/v3/clients",
        httpMethod: "POST",
      },
      requirements: sperantRequirements,
    },
    authTokens: sperantAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerPuntaje",
      description: "Obtiene la informacion del cliente en Sperant para registar el puntaje",
      dynamicParameters: [
        {
          name: "id",
          location: "PARAMETER_LOCATION_PATH",
          schema: {
            type: "integer",
            description: "sperant_id del prospecto"
          },
          required: true,
        },
      ],
      http: {
        baseUrlPattern: "https://api.sperant.com/v3/clients/{id}",
        httpMethod: "GET",
      },
      requirements: sperantRequirements,
    },
    authTokens: sperantAuth,
  },
  {
    temporaryTool: {
      modelToolName: "actualizarLead",
      description: "Te permite actualizar la informacion del lead para el sistema",
      dynamicParameters: [
        {
          name: "nombre_completo",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Nombre completo del nuevo lead"
          },
          required: false,
        },
        {
          name: "dni",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "DNI del nuevo lead"
          },
          required: false,
        },
        {
          name: "celular",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Numero celular del nuevo lead"
          },
          required: false,
        },
        {
          name: "direccion",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Direccion del nuevo lead"
          },
          required: false,
        },
        {
          name: "perfilamiento",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "Estado del perfilamiento 0 o 1"
          },
          required: false,
        },
        {
          name: "id_estado_prospecto",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "Estado del prospecto"
          },
          required: false,
        },
        {
          name: "sperant_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "integer",
            description: "ID del cliente registrado en el CRM Sperant"
          },
          required: false,
        },
        {
          name: "id",
          location: "PARAMETER_LOCATION_PATH",
          schema: {
            type: "string",
            description: "Id del prospecto a actualizar"
          },
          required: true
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/prospectos/{id}",
        httpMethod: "PUT"
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerProyectosDiponibles",
      description: "Obtiene una lista de proyectos disponibles por el distrito",
      dynamicParameters: [
        {
          name: "distrito",
          location: "PARAMETER_LOCATION_QUERY",
          schema: {
            type: "string",
            description: "Distrito para filtrar los proyectos"
          },
          required: true,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/proyectos/distrito",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "buscarProyectoPorNombre",
      description: "Busca proyectos disponibles por nombre del proyecto. Opcionalmente filtra por distrito.",
      dynamicParameters: [
        {
          name: "nombre",
          location: "PARAMETER_LOCATION_QUERY",
          schema: {
            type: "string",
            description: "Nombre o parte del nombre del proyecto a buscar"
          },
          required: true,
        },
        {
          name: "distrito",
          location: "PARAMETER_LOCATION_QUERY",
          schema: {
            type: "string",
            description: "Nombre del distrito para filtrar los proyectos (opcional)"
          },
          required: false,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/proyectos/nombre",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerProyecto",
      description: "Obtiene la informacion del proyecto según el id",
      dynamicParameters: [
        {
          name: "id",
          location: "PARAMETER_LOCATION_PATH",
          schema: {
            type: "string",
            description: "Id del proyecto seleccionado"
          },
          required: true,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/proyectos/{id}",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerUnidades",
      description: "Obtiene la lista de unidades según el id del proyecto",
      dynamicParameters: [
        {
          name: "id_proyecto",
          location: "PARAMETER_LOCATION_QUERY",
          schema: {
            type: "string",
            description: "Id del proyecto seleccionado"
          },
          required: true,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/tool/unidades",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerUnidadesPorDormitorio",
      description: "Obtiene la lista de unidades filtrado por la cantidad de dormitorios",
      dynamicParameters: [
        {
          name: "num",
          location: "PARAMETER_LOCATION_QUERY",
          schema: {
            type: "string",
            description: "Cantidad de dormitorios a buscar"
          },
          required: true,
        },
        {
          name: "id_proyecto",
          location: "PARAMETER_LOCATION_QUERY",
          schema: {
            type: "string",
            description: "Id del proyecto seleccionado"
          },
          required: true,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/tool/unidades/dormitorios",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerUnidad",
      description: "Obtiene el detalle de la unidades seleccionada",
      dynamicParameters: [
        {
          name: "id",
          location: "PARAMETER_LOCATION_PATH",
          schema: {
            type: "string",
            description: "Id del unidad seleccionado"
          },
          required: true,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/unidades/{id}",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "crearCitaSperant",
      description: "Crea la cita para el cliente o lead en el CRM Sperant",
      dynamicParameters: [
        {
          name: "name",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Nombre de la cita" },
          required: true,
        },
        {
          name: "datetime_start",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "Timestamp para el inicio de la cita en valor numerico" },
          required: true,
        },
        {
          name: "duration",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "Duracion de la cita en horas" },
          required: true,
        },
        {
          name: "place",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Lugar donde se realizará la cita" },
          required: false,
        },
        {
          name: "description",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Descripcion de la cita" },
          required: false,
        },
        {
          name: "client_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "sperant_id del lead o prospecto" },
          required: true,
        },
        {
          name: "project_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "sperant_id del proyecto seleccionado" },
          required: true,
        },
        {
          name: "unit_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "sperant_id de la unidad seleccionada" },
          required: true,
        },
        {
          name: "creator_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "sperant_id del usuario asignado al lead o prospecto" },
          required: true,
        },
      ],
      staticParameters: [
        {
          name: "event_type_id",
          location: "PARAMETER_LOCATION_BODY",
          value: 8,
        },
      ],
      http: {
        baseUrlPattern: "https://api.sperant.com/v3/events",
        httpMethod: "POST",
      },
      requirements: sperantRequirements,
    },
    authTokens: sperantAuth,
  },
  {
    temporaryTool: {
      modelToolName: "crearCita",
      description: "Crea la cita para el cliente o lead",
      dynamicParameters: [
        {
          name: "nombre",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Nombre de la cita" },
          required: true,
        },
        {
          name: "hora_inicio",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Timestamp para el inicio de la cita" },
          required: true,
        },
        {
          name: "hora_fin",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Timestamp para el fin de la cita" },
          required: true,
        },
        {
          name: "lugar",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Lugar donde se realizará la cita" },
          required: true,
        },
        {
          name: "id_prospecto",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID del lead" },
          required: true,
        },
        {
          name: "id_proyecto",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID del proyecto seleccionado" },
          required: true,
        },
        {
          name: "id_unidad",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID de la unidad seleccionada" },
          required: true,
        },
      ],
      staticParameters: [
        {
          name: "id_estado_cita",
          location: "PARAMETER_LOCATION_BODY",
          value: 1,
        },
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/citas",
        httpMethod: "POST",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerCita",
      description: "Obtiene la citas agendadas del lead",
      dynamicParameters: [
        {
          name: "id",
          location: "PARAMETER_LOCATION_PATH",
          schema: { type: "string", description: "Id del lead en consulta" },
          required: true,
        }
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/viva/citas/{id}",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerHorarioAtencion",
      description: "Obtiene los días de atención presencial. Devuelve los días de la semana y las horas de atención (0=domingo, 1=lunes ... 6=sábado)",
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/horario-atencion",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerDiasDescanso",
      description: "Obtiene los dias de descanso del asesor asigndado al prospecto o lead",
      dynamicParameters: [
        {
          name: "id_usuario",
          location: "PARAMETER_LOCATION_QUERY",
          schema: { type: "integer", description: "Id del usuario asignado al lead" },
          required: true,
        },
        {
          name: "fecha_descanso",
          location: "PARAMETER_LOCATION_QUERY",
          schema: { type: "string", description: "Fecha consultada por el lead" },
          required: true,
        },
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/dias-descanso",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "obtenerHorariosOcupados",
      description: "Obtiene las citas ya agendadas del asesor, con hora_inicio y hora_fin, para saber qué horarios ya están ocupados",
      dynamicParameters: [
        {
          name: "id_usuario",
          location: "PARAMETER_LOCATION_QUERY",
          schema: { type: "integer", description: "Id del usuario asignado al lead" },
          required: true,
        },
      ],
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/citas/horarios-ocupados",
        httpMethod: "GET",
      },
      requirements: bearerRequirements,
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "crearInteraccionSperant",
      description: "Crea una nueva interacción en el CRM Sperant",
      http: {
        baseUrlPattern: "https://api.sperant.com/v3/clients/{id}/interactions",
        httpMethod: "POST",
      },
      requirements: sperantRequirements,
      dynamicParameters: [
        {
          name: "id",
          location: "PARAMETER_LOCATION_PATH",
          schema: { type: "integer", description: "ID del prospecto o lead en Sperant" },
          required: true,
        },
        {
          name: "project_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "sperant_id del proyecto seleccionado" },
          required: true,
        },
        {
          name: "agent_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "sperant_id del usuario asignado al lead" },
          required: true,
        },
        {
          name: "satisfactory",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "boolean", description: "Indica si la interacción fue satisfactoria" },
          required: false,
        },
        {
          name: "unit_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "sperant_id de la unidad seleccionada" },
          required: true,
        },
        {
          name: "utm_content",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "UTM Content" },
          required: false,
        },
        {
          name: "utm_term",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "UTM Term" },
          required: false,
        },
        {
          name: "utm_campaign",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "UTM Campaign" },
          required: false,
        },
        {
          name: "utm_medium",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Medio como correo electrónico o costo por clic" },
          required: false,
        },
        {
          name: "observations",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Observación de la interacción" },
          required: false,
        },
        {
          name: "reason_resign_id",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID de Desistimiento" },
          required: false,
        },
      ],
      staticParameters: [
        { name: "interest_type_id", location: "PARAMETER_LOCATION_BODY", value: 11 },
        { name: "input_channel_id", location: "PARAMETER_LOCATION_BODY", value: 13 },
        { name: "source_id", location: "PARAMETER_LOCATION_BODY", value: 25 },
        { name: "interaction_type_id", location: "PARAMETER_LOCATION_BODY", value: 1 },
        { name: "utm_source", location: "PARAMETER_LOCATION_BODY", value: "Agente IA" },
      ]
    },
    authTokens: sperantAuth,
  },
  {
    temporaryTool: {
      modelToolName: "crearInteraccion",
      description: "Crea una nueva interacción",
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/interacciones",
        httpMethod: "POST",
      },
      requirements: bearerRequirements,
      dynamicParameters: [
        {
          name: "id_proyecto",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID del proyecto seleccionado" },
          required: true,
        },
        {
          name: "id_usuario",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID de usuario asignado al lead" },
          required: true,
        },
        {
          name: "satisfactorio",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "Indica si la interacción fue satisfactoria. 0 o 1" },
          required: false,
        },
        {
          name: "id_unidad",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID de la Unidad seleccionada" },
          required: false,
        },
        {
          name: "utm_content",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "UTM Content" },
          required: false,
        },
        {
          name: "utm_term",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "UTM Term" },
          required: false,
        },
        {
          name: "utm_campaign",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "UTM Campaign" },
          required: false,
        },
        {
          name: "utm_medium",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Medio como correo electrónico o costo por clic" },
          required: false,
        },
        {
          name: "utm_source",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Motor de búsqueda, nombre del boletín u otra fuente" },
          required: false,
        },
        {
          name: "observaciones",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "string", description: "Observación de la interacción" },
          required: false,
        },
        {
          name: "id_motivo_desistimiento",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID de Desistimiento" },
          required: false,
        },
        {
          name: "id_prospecto",
          location: "PARAMETER_LOCATION_BODY",
          schema: { type: "integer", description: "ID del lead o prospecto" },
          required: false,
        },
      ],
      staticParameters: [
        { name: "id_nivel_interes", location: "PARAMETER_LOCATION_BODY", value: 11 },
        { name: "id_canal_entrada", location: "PARAMETER_LOCATION_BODY", value: 13 },
        { name: "id_medio_captacion", location: "PARAMETER_LOCATION_BODY", value: 25 },
        { name: "id_tipo_interaccion", location: "PARAMETER_LOCATION_BODY", value: 1 },
      ]
    },
    authTokens: bearerAuth,
  },
  {
    temporaryTool: {
      modelToolName: "buscarFaqs",
      description: "Busca en la base de conocimiento las preguntas frecuentes y objeciones más relevantes para responder la consulta del cliente. Úsala siempre que el cliente haga una pregunta o exprese una objeción antes de responder.",
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/faqs/search",
        httpMethod: "GET",
      },
      dynamicParameters: [
        {
          name: "query",
          location: "PARAMETER_LOCATION_QUERY",
          schema: { type: "string", description: "La pregunta u objeción del cliente, en sus propias palabras" },
          required: true,
        }
      ]
    }
  },
  {
    temporaryTool: {
      modelToolName: "buscarSucursal",
      description: "Busca sucursales disponibles según un término de búsqueda",
      timeout: "5s",
      http: {
        baseUrlPattern: "https://viva-api.ai-you.io/api/crm/llamadas/buscarSucursal",
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
];

export default vivaTools;