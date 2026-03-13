-- Migración: Crear tabla de voces
-- Fecha: 2026-03-12
-- Descripción: Tabla para almacenar el catálogo de voces disponibles

CREATE TABLE IF NOT EXISTS `voz` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nacionalidad` varchar(100) NOT NULL COMMENT 'País o región de la voz (ej: Perú, México, España)',
  `genero` enum('masculino','femenino') NOT NULL COMMENT 'Género de la voz',
  `voice_code` varchar(100) NOT NULL COMMENT 'Código identificador de la voz en el proveedor',
  `estado_registro` int DEFAULT '1' COMMENT '1=activo, 0=inactivo',
  `usuario_registro` varchar(100) DEFAULT NULL,
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `usuario_actualizacion` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_voice_code` (`voice_code`),
  KEY `idx_voz_nacionalidad` (`nacionalidad`),
  KEY `idx_voz_genero` (`genero`),
  KEY `idx_voz_estado` (`estado_registro`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Catálogo de voces disponibles para el sistema';

-- Insertar voces iniciales
INSERT INTO `voz` (`nacionalidad`, `genero`, `voice_code`, `usuario_registro`) VALUES
('Perú', 'femenino', '4bfe4b92-70ed-4fc2-a28e-da202adcbc63', 'sistema'),
('Colombia', 'femenino', 'b084d8f2-c9f9-491c-8059-d39dde80d58b', 'sistema');
