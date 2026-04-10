const toolDefinitions = [
    {
        type: "function",
        function: {
            name: "obtenerLinkPago",
            description: "Genera y obtiene un enlace de pago en línea para que el cliente pueda realizar el pago de su cuota",
            parameters: {
                type: "object",
                properties: {
                    grupo_familiar: {
                        type: "string",
                        description: "Codigo necesario para generar el enlace"
                    }
                },
                required: ["grupo_familiar"]
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
                properties: {
                    grupo_familiar: {
                        type: "string",
                        description: "Codigo necesario para generar el enlace"
                    }
                },
                required: ["grupo_familiar"]
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
    }
];

module.exports = { toolDefinitions };
