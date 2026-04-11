-- Alter: Agregar 3 campos de ubicación a tabla sucursal
-- Fecha: 2026-04-11
-- Campos: estado, provincia, ciudad (texto descriptivo)

ALTER TABLE sucursal
ADD COLUMN estado VARCHAR(100) NULL AFTER email,
ADD COLUMN provincia VARCHAR(100) NULL AFTER estado,
ADD COLUMN ciudad VARCHAR(100) NULL AFTER provincia;
