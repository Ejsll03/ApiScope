-- Schema inicial de PostgreSQL (RF-04, seccion 4.3 del PRD).
-- Se agrega `stack_trace` a `requests`, igual que en el schema de SQLite:
-- el PRD la omite en la tabla 4.3 pero RF-02 exige capturar el stack trace
-- de errores 5xx (RequestLogRecord.stackTrace).
--
-- `id` es UUID PRIMARY KEY sin DEFAULT gen_random_uuid(): la app siempre
-- genera el id en src/utils/ids.ts antes del INSERT (igual que en SQLite),
-- asi que un default a nivel de columna nunca se usaria -- y evita depender
-- de la extension pgcrypto (no disponible por default en todo servidor
-- Postgres administrado).
--
-- `latency_ms` es DOUBLE PRECISION, no INTEGER como dice la tabla 4.3 del
-- PRD: captureMiddleware.ts la calcula con process.hrtime.bigint() y la
-- redondea a 2 decimales (sub-milisegundo), asi que un INTEGER truncaria
-- precision real. Misma desviacion deliberada que ya existe en el schema
-- de SQLite.
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  full_url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms DOUBLE PRECISION NOT NULL,
  client_ip VARCHAR(45),
  user_agent TEXT,
  request_headers JSONB,
  request_query JSONB,
  request_body JSONB,
  response_headers JSONB,
  response_body JSONB,
  response_size_bytes INTEGER,
  error_message TEXT,
  stack_trace TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_path ON requests (path);
CREATE INDEX IF NOT EXISTS idx_requests_status_code ON requests (status_code);
CREATE INDEX IF NOT EXISTS idx_requests_method ON requests (method);
CREATE INDEX IF NOT EXISTS idx_requests_latency ON requests (latency_ms);
CREATE INDEX IF NOT EXISTS idx_requests_headers ON requests USING GIN (request_headers);

-- Tabla `manual_logs` (diseno propio, no esta en el PRD): mismo criterio
-- que en SqliteStorage -- tabla separada porque RequestLogRecord y
-- ManualLogRecord tienen forma distinta.
CREATE TABLE IF NOT EXISTS manual_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  level VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  metadata JSONB,
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_logs_timestamp ON manual_logs (timestamp DESC);
