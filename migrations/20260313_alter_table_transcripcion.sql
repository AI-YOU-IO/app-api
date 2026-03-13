-- Migración: Modificar tabla transcripcion
-- Fecha: 2026-03-13
-- Descripción: Agregar campo ordinal, quitar audio_enlace y UNIQUE KEY para permitir múltiples registros por llamada

-- Agregar campo ordinal si no existe
ALTER TABLE `transcripcion` ADD COLUMN IF NOT EXISTS `ordinal` int DEFAULT NULL COMMENT 'Orden del mensaje en la conversación (desde Ultravox)' AFTER `texto`;

-- Eliminar campo audio_enlace si existe
SET @exist_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'transcripcion'
               AND COLUMN_NAME = 'audio_enlace');

SET @query_col := IF(@exist_col > 0, 'ALTER TABLE `transcripcion` DROP COLUMN `audio_enlace`', 'SELECT 1');
PREPARE stmt_col FROM @query_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

-- Quitar UNIQUE KEY si existe (para permitir múltiples registros por llamada)
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'transcripcion'
               AND INDEX_NAME = 'uq_trans_llamada_turno');

SET @query := IF(@exist > 0, 'ALTER TABLE `transcripcion` DROP INDEX `uq_trans_llamada_turno`', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Agregar índices si no existen
CREATE INDEX IF NOT EXISTS `idx_trans_llamada` ON `transcripcion` (`id_llamada`);
CREATE INDEX IF NOT EXISTS `idx_trans_llamada_ordinal` ON `transcripcion` (`id_llamada`, `ordinal`);
