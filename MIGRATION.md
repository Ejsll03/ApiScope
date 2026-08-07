# Guía de migración

Este documento queda reservado para futuras migraciones de API. En el estado
actual del repositorio no hay un método público marcado como deprecado.

## Estado actual

La API pública del logger expone directamente los métodos:

- `logInfo()`
- `logWarning()`
- `logError()`
- `logDebug()`

## Nota

Si en una versión posterior se introduce una API heredada o una deprecación,
este archivo debe documentar el cambio con antes/después y el motivo técnico.