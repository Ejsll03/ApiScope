# Registro de cambios

Acá vamos anotando los cambios importantes del proyecto. El formato sigue Keep
a Changelog y el versionado sigue SemVer.

## [Unreleased]

### Añadido

- Documentación raíz para instalación, configuración, arquitectura, API,
  pruebas y migración.

### Cambiado

- Se ajustó la documentación raíz para que refleje el estado actual del
    repositorio.

## [0.1.0]

### Añadido

- Punto de entrada central `ApiScope` para Express.
- Middleware automático de captura de request y response.
- API de logging manual con niveles info, warning, error y debug.
- Estrategias de almacenamiento en memoria, SQLite y PostgreSQL.
- Endpoints de monitoreo con paginación por cursor para métricas y requests.
- Panel embebido servido desde `/api/monitoring`.
- Cargador de configuración JSON con sustitución de variables de entorno.

### Cambiado

- Las respuestas de monitoreo usan un contrato HTTP estable en snake_case.

### Corregido

- Los campos del payload de request y response se almacenan por separado.

## Historial sin fechación confirmada

No se anotan fechas de versiones anteriores porque todavía no están confirmadas
por tags o releases del repositorio.