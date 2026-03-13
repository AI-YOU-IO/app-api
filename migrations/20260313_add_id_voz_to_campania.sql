-- Migración: Agregar id_voz a tabla campania
-- Fecha: 2026-03-13
-- Descripción: Agregar campo id_voz para relacionar campania con la voz del agente

-- Agregar campo id_voz si no existe
ALTER TABLE `campania` ADD COLUMN IF NOT EXISTS `id_voz` int DEFAULT NULL COMMENT 'FK a tabla voz para seleccionar la voz del agente' AFTER `id_formato`;

-- Agregar índice
CREATE INDEX IF NOT EXISTS `fk_campania_voz` ON `campania` (`id_voz`);

-- Agregar FK (verificar si no existe primero)
SET @exist_fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'campania'
               AND CONSTRAINT_NAME = 'fk_campania_voz');

SET @query_fk := IF(@exist_fk = 0,
    'ALTER TABLE `campania` ADD CONSTRAINT `fk_campania_voz` FOREIGN KEY (`id_voz`) REFERENCES `voz` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1');
PREPARE stmt_fk FROM @query_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;
