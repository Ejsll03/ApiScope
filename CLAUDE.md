# Reglas de Desarrollo del Logger Backend

## Principios de Arquitectura
- **Rendimiento crítico**: Todo el logging en middleware debe ser totalmente asíncrono y no bloqueante. Límite estricto de overhead: < 5ms.
- **Patrón Strategy**: Todo almacenamiento (Memory, SQLite, PostgreSQL) debe implementar una interfaz común `StorageStrategy`.
- **Fail-Fast**: La configuración JSON debe validar variables `.env` (`${VAR}`) al arrancar el proceso. Si falta una variable sensible, lanzar excepción inmediatamente.
- **Resiliencia**: Los errores del logger NUNCA deben tirar la aplicación principal (usar try-catch defensivo e interno).

## Requisitos de Testing (Vitest)
- Metodología TDD: Escribir siempre la suite de Vitest antes de la implementación.
- Cobertura mínima: 70% en componentes core (`storage`, `middleware`, `config`, `utils`).
- Evitar detalles de implementación en los tests; probar comportamiento y contratos públicos.

## Manejo de Deprecaciones
- Si se modifica o reemplaza un método, aplicar el patrón triple: JSDoc `@deprecated`, un único `console.warn` por sesión y entrada en `MIGRATION.md`.

# Politicas de seguridad
- El logger por medio de porpiedades se debe especificar que campos se van a tomar en cuenta y cuales se van a omitir por medios de seguridad. 
