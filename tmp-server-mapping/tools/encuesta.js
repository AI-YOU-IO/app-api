const encuestaTools = [
  {
    temporaryTool: {
      modelToolName: "guardarEncuesta",
      description: "Guardas los datos recompilados de la encuesta realizada",
      dynamicParameters: [
        {
          name: "nombre_contacto",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Nombre completo de la persona encuestada"
          },
          required: true,
        },
        {
          name: "participacion_encuesta",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Aceptacion para participar la encuesta"
          },
          required: false,
        },
        {
          name: "p1_piensa_votar",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Resultado de la pregunta p1"
          },
          required: true,
        },
        {
          name: "p2_intencion_voto",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Reusltado de la pregunta p2"
          },
          required: true,
        },
        {
          name: "p2_observaciones",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Observaciones de la pregunta p2"
          },
          required: true,
        },
        {
          name: "p3a_sabe_como_votar",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Reusltado de la pregunta p3a"
          },
          required: true,
        },
        {
          name: "p3a_refuerzo_pedagogico",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Necesidad de refuerzo para la pregunta p3a"
          },
          required: true,
        },
        {
          name: "p3b_conoce_candidato",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Resultado de la pregunta p3b"
          },
          required: true,
        },
        {
          name: "p4_autoriza_whatsapp",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Resultado de la pregunta p4"
          },
          required: true,
        },
        {
          name: "whatsapp_contacto",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Numero de contacto de whatsapp"
          },
          required: true,
        },
        {
          name: "notas_adicionales",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "string",
            description: "Notas adicionales a la encuesta"
          },
          required: true,
        },
        {
          name: "id_encuesta_base_numero",
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: "int",
            description: "ID del numero a encuestar"
          },
          required: true,
        },
      ],
      http: {
        baseUrlPattern: `https://portabilidad-bitel.ai-you.io/api/crm/tools/encuesta`,
        httpMethod: "POST"
      }
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
];

export default encuestaTools;