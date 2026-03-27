-- Migración: Crear tablas de análisis de sentimiento y speech analytics
-- Fecha: 2026-03-27
-- Descripción: Tablas para almacenar resultados de análisis LLM de llamadas y chats
-- BD: PostgreSQL

-- 1. analisis_llamada: Métricas calculadas por llamada o chat
CREATE TABLE IF NOT EXISTS analisis_llamada (
  id SERIAL PRIMARY KEY,
  id_llamada INTEGER REFERENCES llamada(id) ON DELETE SET NULL,
  id_chat INTEGER REFERENCES chat(id) ON DELETE SET NULL,
  total_tokens INTEGER,
  total_palabras INTEGER,
  tiempo_habla_seg INTEGER,
  tiempo_silencio_seg INTEGER,
  cumplimiento_protocolo REAL,          -- 0 a 100
  fcr BOOLEAN DEFAULT FALSE,            -- First Call Resolution
  resumen TEXT,
  id_empresa INTEGER NOT NULL REFERENCES empresa(id),
  estado_registro INTEGER DEFAULT 1,
  usuario_registro INTEGER,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analisis_llamada_id_llamada ON analisis_llamada(id_llamada);
CREATE INDEX IF NOT EXISTS idx_analisis_llamada_id_chat ON analisis_llamada(id_chat);
CREATE INDEX IF NOT EXISTS idx_analisis_llamada_id_empresa ON analisis_llamada(id_empresa);

-- 2. analisis_sentimiento: Resultado de sentimiento por llamada o chat
CREATE TABLE IF NOT EXISTS analisis_sentimiento (
  id SERIAL PRIMARY KEY,
  id_llamada INTEGER REFERENCES llamada(id) ON DELETE SET NULL,
  id_chat INTEGER REFERENCES chat(id) ON DELETE SET NULL,
  sentimiento VARCHAR(20) NOT NULL,     -- positivo, negativo, neutro
  score_sentimiento REAL,               -- -1 a 1
  emocion_principal VARCHAR(30),        -- frustracion, enojo, confusion, etc.
  score_emocion REAL,                   -- 0 a 1
  id_empresa INTEGER NOT NULL REFERENCES empresa(id),
  estado_registro INTEGER DEFAULT 1,
  usuario_registro INTEGER,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analisis_sentimiento_id_llamada ON analisis_sentimiento(id_llamada);
CREATE INDEX IF NOT EXISTS idx_analisis_sentimiento_id_chat ON analisis_sentimiento(id_chat);
CREATE INDEX IF NOT EXISTS idx_analisis_sentimiento_id_empresa ON analisis_sentimiento(id_empresa);
CREATE INDEX IF NOT EXISTS idx_analisis_sentimiento_sentimiento ON analisis_sentimiento(sentimiento);

-- 3. pregunta_frecuente_analisis: Preguntas, temas y palabras extraídas por LLM
CREATE TABLE IF NOT EXISTS pregunta_frecuente_analisis (
  id SERIAL PRIMARY KEY,
  id_llamada INTEGER REFERENCES llamada(id) ON DELETE SET NULL,
  id_chat INTEGER REFERENCES chat(id) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL,            -- pregunta, tema, palabra
  contenido VARCHAR(255) NOT NULL,
  frecuencia INTEGER DEFAULT 1,
  id_empresa INTEGER NOT NULL REFERENCES empresa(id),
  estado_registro INTEGER DEFAULT 1,
  usuario_registro INTEGER,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pfa_id_llamada ON pregunta_frecuente_analisis(id_llamada);
CREATE INDEX IF NOT EXISTS idx_pfa_id_chat ON pregunta_frecuente_analisis(id_chat);
CREATE INDEX IF NOT EXISTS idx_pfa_tipo ON pregunta_frecuente_analisis(tipo);
CREATE INDEX IF NOT EXISTS idx_pfa_id_empresa ON pregunta_frecuente_analisis(id_empresa);
