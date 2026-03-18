-- Migración: Recrear tabla configuracion_campania_llamada con columnas individuales por día
-- Formato horario: "HH:MM-HH:MM" o NULL si el día está inactivo

DROP TABLE IF EXISTS configuracion_campania_llamada;

CREATE TABLE configuracion_campania_llamada (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_campania INT NOT NULL,
    max_intentos INT DEFAULT 3,
    intervalo_reintento INT DEFAULT 60 COMMENT 'Minutos entre reintentos',
    lunes_horario VARCHAR(11) DEFAULT NULL COMMENT 'Formato: HH:MM-HH:MM',
    martes_horario VARCHAR(11) DEFAULT NULL COMMENT 'Formato: HH:MM-HH:MM',
    miercoles_horario VARCHAR(11) DEFAULT NULL COMMENT 'Formato: HH:MM-HH:MM',
    jueves_horario VARCHAR(11) DEFAULT NULL COMMENT 'Formato: HH:MM-HH:MM',
    viernes_horario VARCHAR(11) DEFAULT NULL COMMENT 'Formato: HH:MM-HH:MM',
    sabado_horario VARCHAR(11) DEFAULT NULL COMMENT 'Formato: HH:MM-HH:MM',
    domingo_horario VARCHAR(11) DEFAULT NULL COMMENT 'Formato: HH:MM-HH:MM',
    estado_registro TINYINT DEFAULT 1,
    usuario_registro INT DEFAULT NULL,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_actualizacion INT DEFAULT NULL,
    fecha_actualizacion DATETIME DEFAULT NULL,
    UNIQUE KEY uk_campania (id_campania),
    INDEX idx_estado (estado_registro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
