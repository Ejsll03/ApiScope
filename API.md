# API

Este documento describe la superficie HTTP expuesta por el router de
monitoreo.

Por defecto el router se monta en `GET /api/monitoring`, pero la ruta base es
configurable mediante `monitoring.endpoint`.

## Autenticación

Si `monitoring.auth.enabled` es `true`, el router usa HTTP Basic Auth.
Las requests sin credenciales válidas retornan `401`.

## `GET /api/monitoring`

Devuelve la SPA embebida como HTML.

Si falta el bundle del panel, el endpoint devuelve `503` con una sugerencia de
compilación.

## `GET /api/monitoring/metrics`

Devuelve métricas agregadas en JSON.

### Forma de la respuesta

```json
{
  "requests": {
    "total": 1234,
    "by_method": { "GET": 900, "POST": 334 },
    "by_status": { "2xx": 1180, "4xx": 40, "5xx": 14 },
    "rate_per_minute": 18.2
  },
  "performance": {
    "latency_avg_ms": 12.4,
    "latency_min_ms": 1,
    "latency_max_ms": 240,
    "p50_ms": 9,
    "p95_ms": 30,
    "p99_ms": 120
  },
  "errors": {
    "total_4xx": 40,
    "total_5xx": 14,
    "by_endpoint": {
      "/users": 8
    }
  },
  "system": {
    "uptime_seconds": 3600,
    "version": "0.1.0",
    "memory": {
      "rss": 12345678,
      "heap_used": 2345678,
      "heap_total": 3456789
    }
  },
  "top_endpoints": [],
  "slowest_endpoints": [],
  "timeline": []
}
```

## `GET /api/monitoring/requests`

Devuelve una lista paginada por cursor de requests y logs manuales.

### Parámetros de consulta

- `cursor`: cadena opaca de cursor.
- `limit`: cantidad de registros por página, por defecto `50`, máximo `200`.
- `order`: `asc` o `desc`, por defecto `desc`.
- `direction`: `after` o `before`.
- `type`: `request`, `manual` o `all`.
- `method`: lista separada por comas, por ejemplo `GET,POST`.
- `status_code`: lista separada por comas de status codes numéricos.
- `path`: búsqueda por subcadena en el path.
- `from`: cota inferior ISO 8601.
- `to`: cota superior ISO 8601.
- `latency_min`: latencia mínima en ms.
- `latency_max`: latencia máxima en ms.
- `has_error`: `true` o `false`.

### Forma de la respuesta

```json
{
  "data": [],
  "pagination": {
    "has_more": false,
    "next_cursor": null,
    "prev_cursor": null,
    "total_count": 0
  }
}
```

### Notas

- Sin `type`, el endpoint devuelve solo request logs.
- `type=manual` devuelve solo logs manuales.
- `type=all` mezcla ambas familias de registros.

## `GET /api/monitoring/requests/:id`

Devuelve un registro por id.

El endpoint acepta tanto request logs automáticos como logs manuales.

## Campos del request log

Los registros de request se serializan con snake_case en la frontera HTTP:

- `id`
- `type`
- `timestamp`
- `method`
- `full_url`
- `path`
- `request_headers`
- `request_query`
- `request_body`
- `client_ip`
- `user_agent`
- `request_id`
- `status_code`
- `response_headers`
- `response_body`
- `latency_ms`
- `response_size_bytes`
- `error_message`
- `stack_trace`

## Campos del log manual

- `id`
- `type`
- `timestamp`
- `level`
- `message`
- `stack_trace`
- `metadata`
- `context`

## Superficie del middleware

El router de monitoreo no es el middleware de captura. Para registrar
requests, monta el middleware devuelto por `apiscope.middleware()` en la app
de Express.

Ejemplo:

```ts
app.use(express.json());
app.use(apiscope.middleware());
app.use(apiscope.config.monitoring.endpoint, apiscope.monitoringRouter());
```