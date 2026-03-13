-- Migración: Crear tabla de estados de llamada
-- Fecha: 2026-03-12
-- Descripción: Catálogo de estados para las llamadas

CREATE TABLE IF NOT EXISTS `estado_llamada` (
  `id` int NOT NULL,
  `nombre` varchar(50) NOT NULL COMMENT 'Nombre del estado de la llamada',
  `descripcion` varchar(200) DEFAULT NULL COMMENT 'Descripción del estado',
  `color` varchar(50) DEFAULT NULL COMMENT 'Color para mostrar en UI',
  `estado_registro` int DEFAULT '1' COMMENT '1=activo, 0=inactivo',
  `fecha_registro` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Catálogo de estados de llamada';

-- Insertar estados iniciales (IDs basados en valores hardcodeados en frontend/encuestas)
INSERT INTO `estado_llamada` (`id`, `nombre`, `descripcion`, `color`) VALUES
(0, 'Pendiente', 'Llamada pendiente de ejecutar', 'amarillo'),
(1, 'Ejecutando', 'Llamada en curso', 'azul'),
(2, 'Buzón', 'La llamada fue al buzón de voz', 'naranja'),
(3, 'Completado', 'Llamada finalizada correctamente', 'verde');
