-- Migración: Insertar datos iniciales de voces
-- Fecha: 2026-03-13
-- Descripción: Agregar voces de diferentes nacionalidades para el sistema

INSERT IGNORE INTO `voz` (`nacionalidad`, `genero`, `voice_code`, `estado_registro`) VALUES
('Perú', 'femenino', 'es-PE-CamilaNeural', 1),
('Perú', 'masculino', 'es-PE-AlexNeural', 1),
('México', 'femenino', 'es-MX-DaliaNeural', 1),
('México', 'masculino', 'es-MX-JorgeNeural', 1),
('España', 'femenino', 'es-ES-ElviraNeural', 1),
('España', 'masculino', 'es-ES-AlvaroNeural', 1),
('Colombia', 'femenino', 'es-CO-SalomeNeural', 1),
('Colombia', 'masculino', 'es-CO-GonzaloNeural', 1),
('Argentina', 'femenino', 'es-AR-ElenaNeural', 1),
('Argentina', 'masculino', 'es-AR-TomasNeural', 1),
('Chile', 'femenino', 'es-CL-CatalinaNeural', 1),
('Chile', 'masculino', 'es-CL-LorenzoNeural', 1);
