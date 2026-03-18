-- Migración: Agregar estados de llamada de Asterisk
-- Fecha: 2026-03-18

-- Crear tabla estado_llamada_asterisk
CREATE TABLE IF NOT EXISTS estado_llamada_asterisk (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(100),
    color VARCHAR(20) DEFAULT '#6B7280',
    estado_registro INTEGER DEFAULT 1,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar estados
INSERT INTO estado_llamada_asterisk (codigo, nombre, descripcion, color) VALUES
('COMPLETED', 'Completada', 'Llamada exitosa (cause 16)', '#10B981'),
('NO_ANSWER', 'No Contesta', 'No contesta (cause 19)', '#F59E0B'),
('BUSY', 'Ocupado', 'Línea ocupada (cause 17)', '#EF4444'),
('FAILED', 'Fallida', 'Fallo de conexión (cause 34, 38, 41, 42)', '#DC2626'),
('REJECTED', 'Rechazada', 'Llamada rechazada (cause 21)', '#F97316'),
('INVALID', 'Inválido', 'Número inválido (cause 0, 28)', '#6B7280'),
('VOICEMAIL', 'Buzón de Voz', 'Buzón de voz detectado', '#8B5CF6'),
('CANCELLED', 'Cancelada', 'Cancelada antes de conectar', '#9CA3AF')
ON CONFLICT (codigo) DO NOTHING;

-- Agregar campo a tabla llamada (permite NULL)
ALTER TABLE llamada ADD COLUMN IF NOT EXISTS id_estado_llamada_asterisk INTEGER REFERENCES estado_llamada_asterisk(id);

-- Crear índice para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_llamada_estado_asterisk ON llamada(id_estado_llamada_asterisk);
