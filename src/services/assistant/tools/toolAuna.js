const toolDefinitions = [
    {
        type: "function",
        function: {
            name: "obtenerLinkPago",
            description: "Genera y obtiene un enlace de pago en línea para que el cliente pueda realizar el pago de su cuota",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "obtenerLinkCambio",
            description: "Genera y obtiene un enlace para que el cliente pueda realizar el cambio de tarjeta",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "tipificarConversacion",
            description: "Actualiza el estado de tipificacion de la persona con un ID",
            parameters: {
                type: "object",
                properties: {
                    id_tipificacion: {
                        type: "integer",
                        description: "Id de la tipificacion correspondiente"
                    }
                },
                required: ["id_tipificacion"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "agregarListaNegra",
            description: "ÚNICAMENTE cuando el cliente expresa de forma definitiva e irrevocable que no desea ser contactado. NO usar ante quejas simples, molestias pasajeras o comentarios negativos.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "derivarAsesor",
            description: "Deriva el caso a un asesor humano cuando el cliente solicita algo fuera del alcance del bot o pide hablar con una persona.",
            parameters: {
                type: "object",
                properties: {
                    motivo: {
                        type: "string",
                        description: "Resumen libre de lo que el cliente necesita, para contexto del asesor"
                    }
                },
                required: ["motivo"]
            }
        }
    }
];

module.exports = { toolDefinitions };
