# Configuración

ApiScope se configura con un archivo JSON y, para valores sensibles, con
variables de entorno en `.env`.

## Orden de prioridad

1. Variables del sistema.
2. Variables definidas en `.env`.
3. Defaults internos del paquete.

## Archivo principal

El archivo por defecto es `logger.config.json`.

### Estructura general

```json
{
  "storage": {
    "strategy": "memory",
    "config": {}
  },
  "capture": {},
  "monitoring": {},
  "performance": {},
  "retention": {}
}
```

## Almacenamiento

### Memoria

```json
{
  "storage": {
    "strategy": "memory",
    "config": {
      "max_records": 5000,
      "cleanup_enabled": true,
      "cleanup_interval_minutes": 10,
      "cleanup_older_than_hours": 24
    }
  }
}
```

### SQLite

```json
{
  "storage": {
    "strategy": "sqlite",
    "config": {
      "database_path": "./logs/api_logs.db",
      "auto_vacuum": true,
      "journal_mode": "WAL"
    }
  }
}
```

### PostgreSQL

Se soportan dos formas:

```json
{
  "storage": {
    "strategy": "postgresql",
    "config": {
      "connection_string": "postgresql://user:pass@localhost:5432/apiscope",
      "pool_size": 10,
      "timeout_ms": 5000,
      "ssl": false,
      "auto_migrate": true
    }
  }
}
```

O bien:

```json
{
  "storage": {
    "strategy": "postgresql",
    "config": {
      "host": "localhost",
      "port": 5432,
      "database": "apiscope",
      "user": "apiscope",
      "password": "secret",
      "pool_size": 10,
      "ssl": false
    }
  }
}
```

## Captura

```json
{
  "capture": {
    "request_headers": true,
    "request_body": true,
    "request_query": true,
    "response_headers": true,
    "response_body": false,
    "max_body_size_kb": 100,
    "excluded_paths": [],
    "excluded_methods": [],
    "sensitive_headers": ["authorization", "cookie"],
    "sensitive_body_fields": ["password", "passwd", "secret", "token"],
    "mask_sensitive_data": true
  }
}
```

`sensitive_body_fields` y `mask_sensitive_data` no solo aplican al body de
request/response capturado por el middleware: también se usan para
enmascarar `metadata` en los logs manuales (`logInfo`, `logWarning`,
`logError`, `logDebug`). Si le pasás datos de un body como metadata (por
ejemplo `apiscope.logInfo("Creando usuario", { body: req.body })`), los
campos listados aquí se enmascaran igual que en la captura automática.

## Monitoreo

```json
{
  "monitoring": {
    "endpoint": "/api/monitoring",
    "enabled": true,
    "cache_metrics": true,
    "cache_duration_seconds": 30,
    "page_size": 50,
    "max_page_size": 200,
    "auto_refresh_interval": 30,
    "auth": {
      "enabled": false,
      "type": "basic",
      "username": null,
      "password": null,
      "session_timeout_hours": 1
    }
  }
}
```

Si `auth.enabled` es `true`, se requieren `username` y `password`.

## Rendimiento

```json
{
  "performance": {
    "async_logging": true,
    "batch_size": 50,
    "batch_interval_ms": 1000,
    "max_queue_size": 1000
  }
}
```

## Retención

```json
{
  "retention": {
    "enabled": false,
    "max_records": 10000,
    "cleanup_interval_minutes": 30,
    "cleanup_older_than_days": 7,
    "archive_before_delete": false,
    "archive_path": null
  }
}
```

## Variables de entorno

Cualquier valor de texto en el JSON puede usar `${VAR_NAME}`.

Ejemplo:

```json
{
  "storage": {
    "strategy": "postgresql",
    "config": {
      "host": "${LOGGER_DB_HOST}",
      "database": "${LOGGER_DB_NAME}",
      "user": "${LOGGER_DB_USER}",
      "password": "${LOGGER_DB_PASSWORD}"
    }
  }
}
```

## Reglas de validación

- `storage.strategy` debe ser `memory`, `sqlite` o `postgresql`.
- `capture.max_body_size_kb` debe ser mayor que 0.
- `monitoring.page_size` no puede superar `monitoring.max_page_size`.
- PostgreSQL necesita `connection_string` o `database` + `user`.
- `monitoring.auth.enabled = true` requiere usuario y contraseña.
- Un JSON inválido falla al arranque con un error descriptivo.

## Valores por defecto

Si no existe `logger.config.json`, ApiScope usa almacenamiento en memoria y
los valores por defecto de captura y monitoreo definidos en el paquete.