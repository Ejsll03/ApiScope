# ApiScope — Progreso del proyecto

Paquete de logging/monitoreo autoalojado para REST APIs (Node.js + TypeScript),
según `requerimientos-logger.md`. El usuario está aprendiendo TypeScript, así
que cada fase se construye y explica de forma incremental — **no generar
todas las fases de una vez**, avanzar una fase por vez y validar con el
usuario.

## Estado: Fase 1 completa ✅ (profundizada tras revisión contra CLAUDE.md)

### Profundización posterior a la primera pasada de fase 1

Con la fase 1 ya funcional, se hizo una segunda pasada para alinear el
código con las reglas de `CLAUDE.md` (que tienen prioridad sobre lo que
diga este documento) y para separar backend/frontend en el mismo repo:

- **Estructura del repo**: todo lo que antes vivía en la raíz (`src/`,
  `examples/`, `package.json`, `tsconfig.json`, etc.) ahora vive en
  `backend/`. Se creó `frontend/` (por ahora solo un `README.md`) reservada
  para la fase 5 (dashboard). Todos los comandos (`npm run build`,
  `npm run example`, `npm test`) se corren **desde `backend/`**.
- **`capture.sensitive_body_fields` (nuevo campo de config)**: antes,
  `src/utils/mask.ts` tenía hardcodeado qué campos de body se enmascaran
  siempre (`password`, `passwd`, `secret`, `token`). CLAUDE.md exige que
  "los campos a tomar en cuenta y los que se omiten por seguridad" se
  especifiquen por config, igual que ya pasaba con `sensitive_headers`. Se
  agregó `capture.sensitive_body_fields: string[]` (mismo default de antes,
  ahora reemplazable) y `maskBody()` pasó a recibir la lista como
  parámetro en vez de usar una constante interna.
- **Validaciones fail-fast adicionales** en `loadConfig.ts` (cerrando el
  pendiente que ya estaba anotado más abajo, contra la tabla de
  "Validaciones Requeridas" de RF-06):
  - `storage.strategy = "postgresql"` sin `connection_string` y sin
    `database`+`user` → `ConfigValidationError` al arrancar.
  - `storage.strategy = "sqlite"` con `database_path` vacío →
    `ConfigValidationError`.
  - `monitoring.page_size > monitoring.max_page_size` → `ConfigValidationError`.
  - `capture.max_body_size_kb <= 0` → `ConfigValidationError`.
- **Vitest introducido antes de fase 6**: CLAUDE.md pide TDD con Vitest
  ("escribir siempre la suite antes de la implementación"), así que se
  instaló Vitest ahora y se escribieron tests primero para lo que se tocó
  en esta pasada (`tests/unit/utils/mask.test.ts`, `tests/unit/config/loadConfig.test.ts`
  — 15 tests, todos en verde, ver "Ubicación de los tests" más abajo). **No** se
  persiguió el 70% de cobertura
  total todavía: esa meta formal (storage/middleware/config/utils
  completos) sigue siendo el alcance de la fase 6; acá solo se demuestra
  el patrón TDD en el código nuevo.

### 🐛 Bug real encontrado y arreglado: `RequestLogRecord` perdía headers/body de la request

Al escribir tests **reales** (no `it.todo`) para `captureMiddleware` con `tests/unit/middleware/captureMiddleware.test.ts`,
se encontró que `RequestData` y `ResponseData` (en `src/types.ts`) declaraban ambas un
campo `headers` y un campo `body`. Como `RequestLogRecord extends RequestData, ResponseData`
y el middleware arma el registro final con
`{...requestData, headers: responseHeaders, body: responseBody, ...}`, los headers y el
body de la **request** se pisaban siempre con los de la **response** — y como el default
de RF-06 es `capture.response_body: false`, en la práctica el body de la request
capturado (y enmascarado) se descartaba siempre, silenciosamente. El demo daba la
falsa impresión de que funcionaba porque `examples/express-basic/logger.config.json`
tiene `response_body: true` y el endpoint `/users` hace eco del body recibido.

Esto contradecía RF-02 (pide headers/body de request Y de response, son datos
distintos) y no coincidía con el schema del PRD (sección 4.2/4.3), que ya modela
`request_headers`/`response_headers` y `request_body`/`response_body` como columnas
separadas.

**Fix aplicado**: `RequestData` ahora expone `requestHeaders`/`requestBody` y
`ResponseData` expone `responseHeaders`/`responseBody` — nombres distintos a
propósito para que el spread no pueda volver a pisarlos entre sí. Se actualizó
`captureMiddleware.ts` (`buildRequestData` y el armado final del record). No hubo
más consumidores del campo viejo `.headers`/`.body` (`MemoryStorage`, `index.ts` y el
ejemplo solo pasan/leen el registro completo, no esos campos puntuales). Verificado
con el ejemplo: `POST /users` con `password` en el body ahora guarda **ambos**,
`requestBody.password` y `responseBody.password`, enmascarados de forma independiente.

### Qué existe hoy

```
backend/
  src/
    types.ts                    # LogRecord, RequestLogRecord, ManualLogRecord (union discriminada por "type")
    config/
      types.ts                  # Raw* (JSON snake_case) vs Config resuelta (camelCase)
      defaults.ts                # defaults por sección/estrategia
      resolveEnvVars.ts          # sustituye "${VAR}" recursivamente, falla al arranque si falta
      loadConfig.ts               # lee logger.config.json + .env, valida, aplica defaults
    storage/
      types.ts                   # StorageStrategy (interface), QueryOptions, CursorPage<T>
      cursor.ts                   # encode/decode de cursores (base64url de {timestamp, id})
      pagination.ts                # paginate(): orden+cursor+limit, compartido por Memory y Sqlite
      MemoryStorage.ts            # RF-04.1: array FIFO acotado + cleanup periódico
      SqliteStorage.ts            # RF-04.2: schema/indices PRD 4.2 + batching de escrituras
      StorageFactory.ts           # createStorage(config, performanceConfig) — switch por strategy
    logging/
      Logger.ts                   # logInfo/logWarning/logError/logDebug (RF-05)
    middleware/
      captureMiddleware.ts        # middleware Express de captura automática (RF-02)
    utils/
      ids.ts, timestamp.ts, mask.ts, bodySize.ts, callsite.ts
    index.ts                      # clase ApiScope: junta config + storage + logger + middleware()
  tests/unit/
    config/loadConfig.test.ts     # tests de las validaciones fail-fast (Vitest)
    utils/mask.test.ts            # tests de maskHeaders/maskBody (Vitest)
    middleware/captureMiddleware.test.ts  # integracion con Express real (Vitest)
    storage/pagination.test.ts    # orden/cursor/limit compartido (Vitest)
    storage/SqliteStorage.test.ts # schema, round-trip, batching (Vitest)
  examples/express-basic/
    server.ts                     # demo funcional: /health /users /boom /crash /logs
    logger.config.json
  scripts/
    generate-test.ts              # npm run gen:test -- src/... : scaffolding de tests
  vitest.config.mts

frontend/
  README.md                       # placeholder, reservado para la fase 5 (dashboard)
```

### Decisiones de diseño a recordar

- **snake_case en JSON, camelCase en TS**: `logger.config.json` respeta exactamente los
  nombres de campo del PRD (`max_records`, `sensitive_headers`, etc.). `loadConfig.ts` los
  mapea a la config interna en camelCase. Si se agregan campos nuevos al PRD, hay que
  tocar `RawApiScopeConfig` (snake_case) y el `Config` resuelto (camelCase) en
  `src/config/types.ts`, más el mapeo en `loadConfig.ts`.
- **`StorageStrategy` es la única interface que el resto del código conoce.** Middleware y
  Logger reciben un `StorageStrategy`, nunca `MemoryStorage` directamente. Las fases 2 y 3
  solo necesitan: crear `SqliteStorage`/`PostgresStorage` implementando esa interface y
  registrarlas en `StorageFactory.ts` (ahora mismo esas dos ramas lanzan
  "todavía no implementada").
- **Paginación por cursor**: `MemoryStorage.getRecords()` ya implementa cursor+limit+order
  completos. `prevCursor` queda **deliberadamente `null`** por ahora — se resuelve en la
  fase 4 cuando se construyan los endpoints HTTP reales de `/api/monitoring/requests`.
- **Captura de errores reales**: si la app monta un error-handling middleware de Express
  que hace `res.locals.apiScopeError = err` antes de responder, el middleware de captura
  usa `err.message`/`err.stack` para `errorMessage`/`stackTrace`. Sin eso, cae a
  `res.statusMessage` (texto genérico tipo "Internal Server Error"). Ver `/crash` en el
  ejemplo.
- **Call site del logging manual** (`context.file/line/function`): en vez de contar frames
  del stack a mano (frágil, se rompe con cada wrapper nuevo), `getCallerCallSite()` en
  `src/utils/callsite.ts` salta cualquier frame cuya ruta empiece dentro de la carpeta del
  propio paquete (`src/` en dev, `dist/` una vez publicado) y devuelve el primer frame
  externo. Esto ya se rompió una vez por contar mal (`ApiScope.logInfo` → `Logger.write`
  → `Logger.logInfo` → user code) y se corrigió con este enfoque.
- **`express` es `peerDependency`**, no dependency normal — el consumidor del paquete ya
  trae su propio Express. Se instaló también como `devDependency` para compilar/correr el
  ejemplo dentro de este repo.
- **TypeScript 7 (`tsgo`, el compilador reescrito en Go)** está instalado (`^7.0.2`). Ya no
  acepta `moduleResolution: "Node"` (alias de `node10`, removido) — el `tsconfig.json` no
  especifica `moduleResolution` y deja que el default acompañe a `module: "CommonJS"`.
- Versión inicial en `package.json`: `0.1.0` (desarrollo activo, aún no 1.0.0).

### Cómo correr la demo

Todos los comandos se corren parados dentro de `backend/`:

```
cd backend
npm run example
# GET  /health
# POST /users   (body con "password" se enmascara automático)
# GET  /boom    (demuestra logError manual)
# GET  /crash   (demuestra captura automática de error real vía res.locals.apiScopeError)
# GET  /logs    (dump crudo de todo lo que guardó MemoryStorage)

npm test              # corre la suite de Vitest (50 tests, ver "Fase 2" mas abajo)
npm run test:watch    # modo watch
```

### Pendiente dentro de la fase 1 (menor, no bloqueante)

- Hay tests para `mask.ts`, `loadConfig.ts` y `captureMiddleware.ts` (25 tests), pero
  **no** cobertura del resto de fase 1 (`MemoryStorage`, `Logger`, el resto de
  `utils/`) — eso sigue siendo el alcance formal de la fase 6 (RF-07, ≥70% en
  storage/middleware/config/utils).
- Las validaciones de `capture`/`monitoring` ya cubren las dependencias y rangos más
  importantes de la tabla "Validaciones Requeridas" del PRD (RF-06): postgresql sin
  credenciales, sqlite sin `database_path`, `page_size` > `max_page_size`,
  `max_body_size_kb` ≤ 0. Quedan afuera validaciones de tipo/enum más exhaustivas
  (ej. formato de `connection_string`, rangos de `pool_size`/`timeout_ms`) — revisar en
  fase 6 junto con el resto de hardening.

### Ubicación de los tests: `backend/tests/unit/`

Los tests **sí se suben al repositorio** (RF-07 y la sección de entregables 6.7 de
`requerimientos-logger.md` lo exigen explícitamente — hubo una vuelta atrás sobre esto:
primero se probó gitignorarlos, pero eso rompía ese requisito, así que se revirtió).

En vez de co-ubicarlos junto al código fuente (`<archivo>.test.ts` al lado de
`<archivo>.ts`, la otra opción que permite RF-07), se optó por la alternativa que
también lista el PRD: una carpeta `tests/unit/` separada, que refleja la misma
estructura de `src/`. Ejemplo actual:

```
backend/
  src/
    utils/mask.ts
    config/loadConfig.ts
  tests/
    unit/
      utils/mask.test.ts          # importa "../../../src/utils/mask"
      config/loadConfig.test.ts   # importa "../../../src/config/loadConfig"
```

Para generar la plantilla de un test nuevo en la ubicación correcta:

```
cd backend
npm run gen:test -- src/utils/timestamp
# crea tests/unit/utils/timestamp.test.ts con un describe/it.todo de arranque
# y el import relativo ya resuelto hacia src/utils/timestamp
```

El script (`backend/scripts/generate-test.ts`) espera una ruta dentro de `src/`, no
pisa un test ya existente, y avisa (sin fallar) si el archivo fuente correspondiente
todavía no existe.

## Estado: Fase 2 completa ✅ — Storage SQLite (`better-sqlite3`)

`SqliteStorage` (`backend/src/storage/SqliteStorage.ts`) implementa `StorageStrategy`
igual que `MemoryStorage` — el resto del código (middleware, `Logger`, `index.ts`) no
sabe ni le importa cuál de las dos está detrás.

### Qué se agregó

- **Schema e índices** (sección 4.2 del PRD): tabla `requests` con las columnas
  exactas del PRD, más `stack_trace` — **desviación deliberada**: el PRD la omite en
  la tabla 4.2 pero RF-02 exige capturar el stack trace de errores 5xx
  (`RequestLogRecord.stackTrace`), así que sin esa columna se perdería ese dato al
  persistir. Los 5 índices de la sección 4.2 se crean junto con la tabla
  (`CREATE INDEX IF NOT EXISTS`).
- **Tabla `manual_logs`** (diseño propio, no está en el PRD): la sección 4.2 solo
  especifica el schema de `requests`; RF-05 deja abierto si los logs manuales van en
  tabla separada o con campo discriminador — se eligió tabla separada, coherente con
  que `ManualLogRecord` y `RequestLogRecord` tienen forma distinta.
  `getRecords`/`getRecordById` consultan ambas tablas y las mezclan.
- **`capture.sensitive_headers`/`sensitive_body_fields` siguen aplicando igual**: el
  enmascarado ocurre en `captureMiddleware` antes de llegar al storage, así que
  `SqliteStorage` simplemente persiste lo que ya le llega enmascarado — no hay lógica
  de seguridad duplicada acá.
- **Sección `performance` nueva en la config** (RF-06, antes no implementada):
  `async_logging`, `batch_size`, `batch_interval_ms`, `max_queue_size`, con fail-fast
  (`batch_size`/`batch_interval_ms`/`max_queue_size` > 0, `batch_size` ≤
  `max_queue_size`). `MemoryStorage` la ignora (ya escribe en RAM sin I/O);
  `SqliteStorage` la usa para batchear escrituras.
- **Batching de escrituras** (RF-04.2: "Transacciones | Uso de transacciones para
  inserciones batch"): `saveRequestLog`/`saveManualLog` encolan en memoria; el batch
  se vuelca en una única transacción de `better-sqlite3` cuando se llega a
  `batch_size`, cuando vence `batch_interval_ms` (timer), o de inmediato si
  `async_logging` es `false`. Si la cola llegara a superar `max_queue_size`, se fuerza
  un flush antes de encolar el nuevo registro (RNF-02: manejo de queue overflow, sin
  perder datos). `getRecords`, `getRecordById` y `close()` siempre flushean primero,
  así una lectura nunca devuelve un estado desactualizado por culpa del batching.
- **Paginación por cursor compartida**: la lógica de orden + cursor + límite que antes
  vivía solo en `MemoryStorage.getRecords()` se movió a
  `src/storage/pagination.ts` (`paginate()`), reutilizada por ambos storages.
  `MemoryStorage` quedó más corto y sin duplicar código.
- `better-sqlite3` es `dependency` (lo necesita quien elija `strategy: "sqlite"`) y
  `@types/better-sqlite3` es `devDependency`. Instala sin problemas en Windows (trae
  binario prebuilt, no hace falta Visual Studio Build Tools).

### Tests (TDD, igual que en la profundización de fase 1)

25 tests nuevos, 50 en total (`npm test`):
- `tests/unit/storage/pagination.test.ts` (8): orden asc/desc, clamp de `limit`,
  `hasMore`/`nextCursor`, avance por cursor, `prevCursor` siempre `null`.
- `tests/unit/storage/SqliteStorage.test.ts` (11): creación de schema/índices,
  round-trip completo de `RequestLogRecord` y `ManualLogRecord`, mezcla de ambas
  tablas en `getRecords`, y los 4 comportamientos de batching (no escribe hasta
  `batch_size`, flush por `batch_interval_ms`, `async_logging: false` escribe de
  inmediato, flush forzado por `max_queue_size`) verificados abriendo una segunda
  conexión de solo lectura al mismo archivo `.db` para espiar el estado real en disco
  sin pasar por el flush automático de `getRecords`.
- 6 tests nuevos en `tests/unit/config/loadConfig.test.ts` para las validaciones de
  `performance`.

Verificado también a mano end-to-end (Express real + `SqliteStorage`, `batch_size: 1`):
el body de la request llega enmascarado y persistido correctamente en el archivo `.db`.

### Pendiente / fuera de alcance de esta fase

- Sin retención/limpieza automática para SQLite (la sección "Retention" genérica de
  RF-06 —`cleanup_older_than_days`, `archive_before_delete`, etc.— no está
  implementada para ningún storage todavía; ver también el pendiente ya anotado en
  fase 1).
- `.gitignore` ahora también cubre `*.db-wal`/`*.db-shm` (sidecars de journal WAL),
  además de `*.db`/`*.db-journal` que ya estaban.

## Estado: Fase 3 completa ✅ — Storage PostgreSQL (`pg`) + sistema de migrations

`PostgresStorage` (`backend/src/storage/PostgresStorage.ts`) implementa `StorageStrategy`
con el mismo contrato que Memory y SQLite. Se agregó ademas un sistema de migrations
propio (`backend/src/migrations/`), reutilizable fuera de `PostgresStorage` via el
comando CLI.

### Decision de testing: pg-mem en vez de un Postgres real

No hay Docker ni un servidor PostgreSQL disponible en esta maquina. `CLAUDE.md` exige
TDD con Vitest probando comportamiento real (no implementación), y así se testeó
`SqliteStorage` (contra un archivo `.db` real). Se evaluó con el usuario entre mockear
`pg.Pool`, pedirle que levante Postgres, o usar **pg-mem** (emulador del motor SQL de
Postgres en memoria, via `db.adapters.createPg()` que devuelve una clase `Pool`
API-compatible con el paquete `pg` real) — se eligió **pg-mem** para no perder la
filosofía de "comportamiento real, no mocks".

Limitaciones de pg-mem encontradas y como se resolvieron (relevantes si se vuelve a
tocar este código):
- No soporta re-ejecutar el mismo `CREATE TABLE IF NOT EXISTS` una vez que la tabla ya
  existe (tira un error de "AST coverage"). `ensureMigrationsTable()` en
  `runMigrations.ts` hace un `SELECT` a `information_schema.tables` primero y solo
  emite el `CREATE TABLE` si hace falta, en vez de confiar en el `IF NOT EXISTS`.
- El `ROLLBACK` de una transaccion con DDL (`CREATE TABLE`) no revierte el cambio de
  schema en pg-mem (limitación conocida del emulador, no de Postgres real). Por eso el
  test de "migration invalida" no verifica que la tabla desaparezca — verifica algo que
  sí depende de nuestro código: que la version nunca se registra en
  `schema_migrations` cuando el SQL falla (el `INSERT` de registro corre *después* del
  SQL de la migration, dentro de la misma transacción, así que si el SQL falla nunca se
  llega a insertar esa fila, sea cual sea el motor).
- `pg` (y pg-mem) parsean columnas `TIMESTAMP WITH TIME ZONE` como objetos `Date`, no
  strings — `PostgresStorage` los convierte de vuelta a ISO 8601 (`toIso()`) al leer,
  para no romper el contrato de `RequestData.timestamp: string` que usa el resto del
  paquete.
- Los objetos JS pasados como parámetro a una columna `JSONB` se serializan y
  deserializan automáticamente (tanto en `pg` real como en pg-mem) — a diferencia de
  `SqliteStorage`, acá no hace falta `JSON.stringify`/`JSON.parse` manual.

### Sistema de migrations (`backend/src/migrations/`)

- `001_init.sql`: schema de la sección 4.3 del PRD (tabla `requests` con columnas
  JSONB, los 5 índices B-tree más el índice GIN sobre `request_headers`, y la tabla
  `manual_logs` — mismo diseño propio que en SQLite, tabla separada por tener forma
  distinta a `RequestLogRecord`).
- `runMigrations.ts`: lee los `.sql` numerados (`NNN_nombre.sql`) del directorio,
  valida la conexión antes de tocar nada (`validateConnection`), y aplica cada
  migration pendiente en su propia transacción junto con el `INSERT` que la registra en
  `schema_migrations` — si el SQL falla, la transacción entera se revierte
  (RF-04.3: "Rollback: capacidad de rollback en caso de error").
- **Desviaciones deliberadas del schema 4.3 del PRD** (mismo criterio que las ya
  documentadas para SQLite):
  - `id UUID PRIMARY KEY` **sin** `DEFAULT gen_random_uuid()`: la app siempre genera el
    id en `src/utils/ids.ts` antes del `INSERT`, así que ese default nunca se usaría —
    y evita depender de la extensión `pgcrypto`, no disponible por default en todo
    servidor Postgres administrado.
  - `latency_ms` es `DOUBLE PRECISION`, no `INTEGER` como dice la tabla 4.3:
    `captureMiddleware.ts` la calcula con `process.hrtime.bigint()` redondeada a 2
    decimales (sub-milisegundo), así que un `INTEGER` truncaría precisión real.

### CLI de migrations manual (`backend/scripts/migrate.ts` → `npm run migrate`)

RF-04.3 pide un comando para correr migrations a mano, independiente de
`storage.config.auto_migrate` (que por default es `false` — en producción se espera
correr `npm run migrate` como paso deliberado antes de levantar la app, no que la app
las aplique sola en cada arranque). Soporta `--config`/`--env` para apuntar a otro
`logger.config.json`/`.env`. Falla con mensaje claro y exit code 1 si la conexión no
funciona o si `storage.strategy` no es `"postgresql"`.

### Empaquetado: copia de `.sql` a `dist/`

`tsc` solo compila `.ts` — sin este paso, `dist/migrations/` quedaba sin el
`001_init.sql`, y `runMigrations()` (que busca sus migrations en `__dirname` por
default) no encontraba ninguna en el paquete publicado, sin tirar error, aplicando el
schema vacío en silencio. Se agregó `backend/scripts/copy-migrations.ts` y quedó
encadenado en `npm run build` (`tsc -p tsconfig.json && tsx scripts/copy-migrations.ts`).
Verificado manualmente: `dist/migrations/001_init.sql` existe después de `npm run build`.

### `PostgresStorage.ts`: mismo patrón de batching que SQLite, adaptado a `pg`

Pool de conexiones (`pg.Pool`) con `pool.on("error", ...)` para que un error async del
pool (ej. se cae una conexión idle) no tumbe el proceso (RNF-02). Cola en memoria +
flush por transacción, igual criterio que `SqliteStorage` (`batch_size`,
`batch_interval_ms`, `async_logging: false`, `max_queue_size` con flush forzado por
overflow) pero con `client.query("BEGIN"/"COMMIT"/"ROLLBACK")` explícito en vez de la
API síncrona de transacciones de `better-sqlite3`. Acepta tanto `connection_string`
(Opción A) como host/port/database/user/password (Opción B) — `buildPoolConfig()`
elige según cuál esté presente, ya validado como obligatorio-uno-u-otro en
`loadConfig.ts` desde la profundización de fase 1.

### Tests (TDD)

18 tests nuevos, 68 en total (`npm test`):
- `tests/unit/migrations/runMigrations.test.ts` (5): orden de aplicación, no repetir
  migrations ya registradas, aplicar solo las nuevas, `MigrationError` + sin registro
  de versión cuando el SQL es inválido, validación de conexión antes de arrancar.
- `tests/unit/storage/PostgresStorage.test.ts` (13): `auto_migrate` true/false en
  `init()`, validación de conexión, round-trip completo de `RequestLogRecord` y
  `ManualLogRecord`, mezcla de ambas tablas en `getRecords`, y los mismos 6
  comportamientos de batching que SQLite.

### Pendiente / fuera de alcance de esta fase

- Sin verificación manual contra un Postgres real (no disponible en esta máquina) —
  toda la cobertura automatizada corre contra pg-mem. Antes de producción, correr
  `npm run migrate` y la demo contra un Postgres real al menos una vez.
- Reconexión automática de `pg.Pool` ante pérdida de conexión: se apoya en el
  comportamiento default del pool (reemplaza clientes muertos bajo demanda) más el
  listener de `error` que evita que tumbe el proceso — no se agregó lógica de retry
  propia encima.

## Próximas fases (en orden, una por vez)

1. **Fase 4 — API de monitoreo**: endpoints `/api/monitoring/metrics` y
   `/api/monitoring/requests` (con filtros + cursor real, incluyendo `prevCursor`),
   `/api/monitoring/requests/:id`, cache de métricas, autenticación básica.
2. **Fase 5 — Dashboard web**: SPA embebida en un solo HTML (< 500KB), componentizada,
   Chart.js vía CDN, tabla con filtros, vista de detalle, auto-refresh.
3. **Fase 6 — Testing, versionado, docs, deprecación**: Vitest (cobertura ≥70% en
   storage/middleware/config/utils), Playwright Component Testing para la UI,
   CHANGELOG.md (Keep a Changelog), MIGRATION.md con una deprecación real (RF-09),
   README/CONFIGURATION/ARCHITECTURE/API.md, publicación del paquete.

Los tasks de este mismo tipo (fases) ya están creados en el task tracker de la
sesión — al retomar, marcar la fase correspondiente `in_progress` antes de empezar.
