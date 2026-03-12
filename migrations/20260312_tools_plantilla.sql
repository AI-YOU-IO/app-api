-- =====================================================
-- MIGRACIÓN: Actualización tabla plantilla
-- Fecha: 2026-03-12
-- Descripción: Agrega campo prompt único
-- =====================================================

-- =====================================================
-- 1. AGREGAR CAMPO PROMPT A PLANTILLA
-- =====================================================
ALTER TABLE plantilla
    ADD COLUMN IF NOT EXISTS prompt LONGTEXT COMMENT 'Prompt completo del agente de voz';

-- =====================================================
-- 2. ELIMINAR CAMPOS DE PROMPT MÚLTIPLES (SI EXISTEN)
-- =====================================================
-- Ejecutar solo si existen las columnas
SET @dbname = DATABASE();
SET @tablename = 'plantilla';

-- Verificar y eliminar prompt_sistema
SET @columnExists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'prompt_sistema');
SET @query = IF(@columnExists > 0, 'ALTER TABLE plantilla DROP COLUMN prompt_sistema', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y eliminar prompt_inicio
SET @columnExists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'prompt_inicio');
SET @query = IF(@columnExists > 0, 'ALTER TABLE plantilla DROP COLUMN prompt_inicio', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y eliminar prompt_flujo
SET @columnExists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'prompt_flujo');
SET @query = IF(@columnExists > 0, 'ALTER TABLE plantilla DROP COLUMN prompt_flujo', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificar y eliminar prompt_cierre
SET @columnExists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = 'prompt_cierre');
SET @query = IF(@columnExists > 0, 'ALTER TABLE plantilla DROP COLUMN prompt_cierre', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================
SELECT 'Migración completada exitosamente' AS resultado;
