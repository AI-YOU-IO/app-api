-- Migración: Tabla de Ubicaciones Jerárquicas (Estado/Provincia/Ciudad)
-- Fecha: 2026-04-11

-- Tabla única con estructura jerárquica para 3 niveles de ubicación
CREATE TABLE IF NOT EXISTS ubicacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    nivel TINYINT NOT NULL COMMENT '1=Estado, 2=Provincia, 3=Ciudad',
    id_padre INT NULL,
    codigo VARCHAR(10) NULL COMMENT 'Código opcional (ej: ISO 3166-2)',
    estado_registro TINYINT DEFAULT 1,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ubicacion_padre FOREIGN KEY (id_padre)
        REFERENCES ubicacion(id) ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX idx_ubicacion_nivel (nivel),
    INDEX idx_ubicacion_padre (id_padre),
    INDEX idx_ubicacion_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agregar campo ciudad_id a la tabla sucursal (referencia al nivel 3)
ALTER TABLE sucursal
ADD COLUMN ciudad_id INT NULL AFTER email,
ADD CONSTRAINT fk_sucursal_ciudad FOREIGN KEY (ciudad_id)
    REFERENCES ubicacion(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos de ejemplo (Perú)
-- Nivel 1: Estados/Departamentos
INSERT INTO ubicacion (nombre, nivel, id_padre, codigo) VALUES
('Lima', 1, NULL, 'PE-LIM'),
('Arequipa', 1, NULL, 'PE-ARE'),
('Cusco', 1, NULL, 'PE-CUS');

-- Nivel 2: Provincias (dependen del Estado)
INSERT INTO ubicacion (nombre, nivel, id_padre) VALUES
('Lima', 2, 1),           -- Provincia Lima (Estado Lima)
('Huaral', 2, 1),         -- Provincia Huaral (Estado Lima)
('Cañete', 2, 1),         -- Provincia Cañete (Estado Lima)
('Arequipa', 2, 2),       -- Provincia Arequipa (Estado Arequipa)
('Caylloma', 2, 2),       -- Provincia Caylloma (Estado Arequipa)
('Cusco', 2, 3),          -- Provincia Cusco (Estado Cusco)
('Urubamba', 2, 3);       -- Provincia Urubamba (Estado Cusco)

-- Nivel 3: Ciudades/Distritos (dependen de la Provincia)
INSERT INTO ubicacion (nombre, nivel, id_padre) VALUES
('Lima Cercado', 3, 4),   -- Lima Cercado (Provincia Lima)
('Miraflores', 3, 4),     -- Miraflores (Provincia Lima)
('San Isidro', 3, 4),     -- San Isidro (Provincia Lima)
('Surco', 3, 4),          -- Surco (Provincia Lima)
('Huaral', 3, 5),         -- Huaral (Provincia Huaral)
('San Martín de Porres', 3, 5),
('San Vicente de Cañete', 3, 6),
('Arequipa Cercado', 3, 7),
('Cayma', 3, 7),
('Yanahuara', 3, 7),
('Chivay', 3, 8),
('Cusco Cercado', 3, 9),
('San Sebastián', 3, 9),
('Wanchaq', 3, 9),
('Urubamba', 3, 10),
('Ollantaytambo', 3, 10);
