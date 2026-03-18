-- Agregar campo 'activo' para activar/desactivar bases temporalmente en una campaña
ALTER TABLE campania_base_numero
ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=activo, 0=desactivado temporalmente'
AFTER id_base_numero;

-- Crear índice para filtrar por activo
CREATE INDEX idx_cb_activo ON campania_base_numero(activo);
