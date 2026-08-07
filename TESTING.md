# Pruebas

ApiScope usa Vitest para las pruebas de lógica del backend. El repositorio
incluye pruebas unitarias para config, middleware, storage y utilidades.

## Pruebas actuales del backend

Ejecuta la suite desde `backend/`:

```bash
pnpm test
```

Ejecuta con cobertura:

```bash
pnpm run test:coverage
```

Modo vigilancia:

```bash
pnpm run test:watch
```

## Qué se cubre hoy

- Parseo y validación de la configuración.
- Middleware de captura de requests.
- Lógica de paginación y persistencia del storage.
- Enmascarado y otras utilidades.

## Estrategia de pruebas de la UI

El requerimiento del proyecto pide Playwright Component Testing para la UI de
monitoreo. El repositorio actual guarda la UI en `frontend/`, pero todavía no
incluye una configuración de Playwright CT ni archivos `*.spec.*`.

La división de pruebas prevista es:

- Vitest para lógica pura y comportamiento del backend.
- Playwright Component Testing para los componentes del panel en navegador.

## Distribución recomendada de archivos

- Pruebas unitarias del backend: `backend/tests/unit/**/*.test.ts`.
- Pruebas de componentes de UI: `frontend/src/**/*.spec.jsx`.

## Notas para mantenimiento

- Prefiere probar el comportamiento a través de APIs públicas, no detalles
  internos de implementación.
- Para storage, favorece pruebas de round-trip y validación de paginación por
  cursor.
- Para la API de monitoreo, verifica la forma serializada del JSON, no solo
  los registros internos crudos.