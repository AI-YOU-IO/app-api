-- Migración: Renombrar tabla truncal a troncal y campo id_truncal a id_troncal
-- Fecha: 2026-04-17

-- 1. Eliminar el constraint FK de empresa
ALTER TABLE public.empresa DROP CONSTRAINT IF EXISTS fk_empresa_truncal;

-- 2. Eliminar el índice de empresa
DROP INDEX IF EXISTS idx_empresa_truncal;

-- 3. Renombrar la columna en empresa
ALTER TABLE public.empresa RENAME COLUMN id_truncal TO id_troncal;

-- 4. Eliminar el trigger de la tabla truncal
DROP TRIGGER IF EXISTS trg_truncal_update ON public.truncal;

-- 5. Renombrar la tabla truncal a troncal
ALTER TABLE public.truncal RENAME TO troncal;

-- 6. Renombrar constraints de la tabla troncal
ALTER TABLE public.troncal RENAME CONSTRAINT truncal_pkey TO troncal_pkey;
ALTER TABLE public.troncal RENAME CONSTRAINT truncal_codigo_key TO troncal_codigo_key;

-- 7. Recrear el trigger con el nuevo nombre
CREATE TRIGGER trg_troncal_update
BEFORE UPDATE ON public.troncal
FOR EACH ROW EXECUTE FUNCTION update_fecha_actualizacion();

-- 8. Recrear el índice en empresa
CREATE INDEX idx_empresa_troncal ON public.empresa(id_troncal);

-- 9. Recrear el constraint FK
ALTER TABLE public.empresa
ADD CONSTRAINT fk_empresa_troncal
FOREIGN KEY (id_troncal) REFERENCES public.troncal(id);

-- 10. Actualizar comentarios
COMMENT ON TABLE public.troncal IS 'Tabla de troncales para identificar el servidor de llamadas por país';
COMMENT ON COLUMN public.troncal.codigo IS 'Código único del troncal (svip_bitel, svip_costa, etc.)';
COMMENT ON COLUMN public.empresa.id_troncal IS 'FK a la tabla troncal para identificar el servidor de llamadas';
