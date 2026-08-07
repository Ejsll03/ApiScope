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
  para la fase 5 (dashboard). Todos los comandos (`pnpm run build`,
  `pnpm run example`, `pnpm test`) se corren **desde `backend/`**.
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
    generate-test.ts              # pnpm run gen:test -- src/... : scaffolding de tests
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
pnpm run example
# GET  /health
# POST /users   (body con "password" se enmascara automático)
# GET  /boom    (demuestra logError manual)
# GET  /crash   (demuestra captura automática de error real vía res.locals.apiScopeError)
# GET  /logs    (dump crudo de todo lo que guardó MemoryStorage)

pnpm test              # corre la suite de Vitest (50 tests, ver "Fase 2" mas abajo)
pnpm run test:watch    # modo watch
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
pnpm run gen:test -- src/utils/timestamp
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

25 tests nuevos, 50 en total (`pnpm test`):
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

### CLI de migrations manual (`backend/scripts/migrate.ts` → `pnpm run migrate`)

RF-04.3 pide un comando para correr migrations a mano, independiente de
`storage.config.auto_migrate` (que por default es `false` — en producción se espera
correr `pnpm run migrate` como paso deliberado antes de levantar la app, no que la app
las aplique sola en cada arranque). Soporta `--config`/`--env` para apuntar a otro
`logger.config.json`/`.env`. Falla con mensaje claro y exit code 1 si la conexión no
funciona o si `storage.strategy` no es `"postgresql"`.

### Empaquetado: copia de `.sql` a `dist/`

`tsc` solo compila `.ts` — sin este paso, `dist/migrations/` quedaba sin el
`001_init.sql`, y `runMigrations()` (que busca sus migrations en `__dirname` por
default) no encontraba ninguna en el paquete publicado, sin tirar error, aplicando el
schema vacío en silencio. Se agregó `backend/scripts/copy-migrations.ts` y quedó
encadenado en `pnpm run build` (`tsc -p tsconfig.json && tsx scripts/copy-migrations.ts`).
Verificado manualmente: `dist/migrations/001_init.sql` existe después de `pnpm run build`.

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

18 tests nuevos, 68 en total (`pnpm test`):
- `tests/unit/migrations/runMigrations.test.ts` (5): orden de aplicación, no repetir
  migrations ya registradas, aplicar solo las nuevas, `MigrationError` + sin registro
  de versión cuando el SQL es inválido, validación de conexión antes de arrancar.
- `tests/unit/storage/PostgresStorage.test.ts` (13): `auto_migrate` true/false en
  `init()`, validación de conexión, round-trip completo de `RequestLogRecord` y
  `ManualLogRecord`, mezcla de ambas tablas en `getRecords`, y los mismos 6
  comportamientos de batching que SQLite.

### Pendiente / fuera de alcance de esta fase

- Reconexión automática de `pg.Pool` ante pérdida de conexión: se apoya en el
  comportamiento default del pool (reemplaza clientes muertos bajo demanda) más el
  listener de `error` que evita que tumbe el proceso — no se agregó lógica de retry
  propia encima.

### Verificación posterior contra Postgres real (Docker)

Ya con Docker Desktop instalado en la máquina, se agregó `docker-compose.yml` (raíz
del repo, servicio `postgres:16-alpine`), `backend/examples/express-basic/logger.config.postgres.json`
y el script `pnpm run example:postgres` (`backend/package.json`) para levantar el demo
contra un Postgres real en vez de pg-mem. `examples/express-basic/server.ts` ahora
acepta el nombre del archivo de config como `process.argv[2]` y carga `.env` desde
`backend/.env` vía `envPath`.

**Puerto 5433, no 5432**: esta máquina tiene un servicio nativo de Windows
(`postgresql-x64-17`) ya escuchando en el 5432 — el primer intento de conectar desde
la app fallaba con `28P01` (password auth failed) porque la conexión se iba a ese
Postgres nativo, no al contenedor. Mapear el contenedor a `5433:5432` en
`docker-compose.yml` (y `"port": 5433` en `logger.config.postgres.json`, que es
literal porque JSON no soporta `${VAR}` como número) lo resolvió sin tocar el
servicio nativo. Si se vuelve a levantar en otra máquina sin ese conflicto, el
puerto igual puede quedar en 5433 — no hay downside.

Verificado end-to-end (`docker compose up -d` + `pnpm run example:postgres` +
`curl`, más consultas directas con `docker exec ... psql` para confirmar que no era
solo lectura de vuelta vía la app):

- Migrations (`001_init.sql`) se aplican solas al arrancar (`auto_migrate: true`) —
  `schema_migrations` queda con la fila `1 | init`.
- `POST /users` con `password` en el body: `requests.request_body` y
  `.response_body` (columnas `JSONB`) guardan `***MASKED***` en Postgres, no el
  valor real.
- `/boom` y `/crash`: `manual_logs` y `requests.stack_trace`/`error_message` se
  persisten correctamente.
- `/api/monitoring/metrics`, `/requests?has_error=true` y paginación por cursor
  (`next_cursor` avanza, `has_more` correcto) funcionan contra el storage real, no
  solo contra pg-mem.

`backend/.env` (gitignorado) se creó localmente con los valores de
`docker-compose.yml`/`.env.example` para poder correr `pnpm run example:postgres`.

## Estado: Fase 4 completa ✅ — API de monitoreo (RF-03)

`src/monitoring/` nuevo: `GET /metrics`, `GET /requests` (con filtros + cursor
bidireccional real) y `GET /requests/:id`, montables via `apiscope.monitoringRouter()`
(mismo patron que `apiscope.middleware()` -- el consumidor decide donde montarlo:
`app.use(apiscope.config.monitoring.endpoint, apiscope.monitoringRouter())`).

### `prevCursor` real: se agrego `direction` a `QueryOptions`

Las fases 1/2 dejaban `prevCursor` deliberadamente `null` ("se resuelve en la fase 4").
El PRD no especifica como se *consume* `prev_cursor` en el request (solo que la
response debe incluirlo), asi que se diseño lo siguiente: `QueryOptions.direction`
(`"after"` default | `"before"`) decide si `cursor` se interpreta como "seguir desde
aca" (lo que genera `nextCursor`, anchor = ultimo item de la pagina) o "traer la
pagina anterior a este punto" (lo que genera `prevCursor`, anchor = primer item de la
pagina). Son simetricos: pedir `cursor: prevCursor, direction: "before"` reproduce
exactamente la pagina anterior, con sus propios `nextCursor`/`prevCursor` identicos a
como se vieron la primera vez -- verificado con un test de ida y vuelta en
`pagination.test.ts` y otro end-to-end via HTTP en `router.test.ts`. A nivel HTTP,
`direction` es un query param opcional adicional (`GET /requests?cursor=X&direction=before`);
el PRD no lo prohibe, solo no lo menciona.

### Filtros de RF-03 en `QueryOptions` + `filterLogRecords()`

Se agregaron `type`, `method`, `statusCode`, `pathContains`, `from`/`to`,
`latencyMin`/`latencyMax`, `hasError` a `QueryOptions`. La logica de filtrado vive en
`filterLogRecords()` (`storage/pagination.ts`), llamada por las tres estrategias
**antes** de `paginate()` -- filtrar despues de paginar habria dado `totalCount`/
`hasMore` incorrectos (calculados sobre la tabla completa en vez del subconjunto
filtrado). Los filtros especificos de request (method/statusCode/etc.) excluyen
automaticamente los `ManualLogRecord` porque esos campos no existen ahi.
`hasError` usa el mismo umbral que ya definia RF-02: `statusCode >= 400`.

### `getAllRequestLogs()`: nuevo metodo en `StorageStrategy`

El calculo de metricas (promedios, percentiles, top endpoints) necesita **todo** el
conjunto de requests, no una pagina -- se agrego `getAllRequestLogs(): Promise<RequestLogRecord[]>`
a la interface, implementado en Memory/SQLite/Postgres reutilizando cada uno su forma
existente de leer la tabla completa. Separado de `getRecords()` a proposito: mezclar
"traer todo" con la paginacion normal invitaria a bugs de quien olvide pasar un limit.

### Snake_case en el limite HTTP (`src/monitoring/serializers.ts`)

Mismo criterio que `logger.config.json` (snake_case en JSON, camelCase en TS interno),
extendido ahora a las responses HTTP: `full_url`, `status_code`, `latency_ms`,
`request_headers`/`response_headers`, `has_more`/`next_cursor`/`prev_cursor`/
`total_count`, etc. — nombres elegidos para coincidir con las columnas ya usadas en los
schemas de SQLite/Postgres (secciones 4.2/4.3), no con las tablas RF-02 (que llaman
"headers" ambiguamente a ambos, el bug que ya se corrigio en la profundizacion de
fase 1). El mapeo es **explicito por campo, no un transform recursivo generico**: los
serializers no tocan las claves de `request_body`/`response_body`/`metadata`/
`request_query` (datos opacos del consumidor) ni las de `request_headers`/
`response_headers` (nombres reales de headers HTTP) -- un transform ciego los
hubiera reescrito por error. Verificado con un test que a proposito usa claves
camelCase (`userName`, `userId`) *dentro* de un body/metadata de prueba y confirma
que sobreviven intactas.

### Auth HTTP Basic (`src/monitoring/basicAuth.ts`)

Comparacion de usuario/password contra SHA-256 de cada valor + `crypto.timingSafeEqual`
(no se puede comparar strings de largo distinto directo con timing-safe compare, y
comparar por longitud/contenido normal es vulnerable a timing attacks). Si
`monitoring.auth.enabled` es `false`, el monitor queda de acceso publico (tal como
especifica RF-03) -- no se implemento el formulario de login/sesion por cookie que el
PRD ofrece como alternativa; eso se evalua en la fase 5 junto con el dashboard, que es
donde un formulario HTML realmente tiene sentido.

### Cache de metricas (`src/monitoring/metricsCache.ts`)

TTL simple respetando `monitoring.cache_metrics`/`cache_duration_seconds`: el estado
cacheado vive en el closure que crea el router (una instancia por `ApiScope`, no
global). Si `cache_metrics` es `false`, recalcula en cada request.

### Tests (TDD)

36 tests nuevos, 125 en total (`pnpm test`):
- `pagination.test.ts` (+13): direction/prevCursor bidireccional, `filterLogRecords`
  (cada filtro por separado + combinados).
- `MemoryStorage.test.ts` (4, archivo nuevo — cobertura minima acotada a esta fase,
  el resto de MemoryStorage sigue siendo alcance de fase 6): filtros en `getRecords`,
  `getAllRequestLogs`.
- `SqliteStorage.test.ts`/`PostgresStorage.test.ts` (+1 c/u): filtros + `getAllRequestLogs`.
- `monitoring/metrics.test.ts` (11): totales, buckets de status, tasa/minuto,
  percentiles, errores por endpoint, top endpoints/mas lentos, `getSystemInfo`.
- `monitoring/basicAuth.test.ts` (6): habilitado/deshabilitado, credenciales
  correctas/incorrectas/ausentes/malformadas.
- `monitoring/metricsCache.test.ts` (3): cache hit/miss/expiracion (con fake timers).
- `monitoring/serializers.test.ts` (6): mapeo snake_case sin tocar datos opacos.
- `monitoring/router.test.ts` (10, integracion con Express real + fetch, mismo patron
  que `captureMiddleware.test.ts`): `monitoring.enabled`, auth, metricas, filtros,
  navegacion adelante/atras por cursor end-to-end via HTTP, detalle de request,
  404 para ids inexistentes o que pertenecen a un manual log.

Verificado tambien a mano end-to-end contra el demo (`pnpm run example` +
`curl`): password enmascarado en `/users`, error real capturado en `/boom`,
metricas y listado con filtros funcionando en `/api/monitoring/*`.

### Pendiente / fuera de alcance de esta fase

- Formulario de login + sesion por cookie (alternativa a Basic Auth que ofrece el PRD)
  queda para la fase 5, junto con el dashboard.
- Los filtros de RF-03 se aplican en memoria (post-fetch completo de la tabla), no via
  `WHERE` en SQL -- consistente con como ya funcionaba `getRecords()` desde la fase 1
  (siempre trae todo y pagina en memoria), pero no es lo mas eficiente para datasets
  grandes en SQLite/Postgres. Optimizarlo con push-down a SQL queda fuera de alcance
  por ahora.
- `Errores Recientes` (lista cronológica de últimos errores con detalles) es un
  componente del dashboard (seccion "Dashboard de Métricas"), no de la API de
  métricas -- se resuelve en fase 5 reutilizando `/requests?has_error=true`.

## Cierre de gaps de RF-06 — validación de `logger.config.json`

Revisión completa del backend contra `requerimientos-logger.md` (fases 1-4 confirmadas
sólidas). Se eligió cerrar primero los gaps concretos de RF-06 en
`backend/src/config/loadConfig.ts`, verificados leyendo el código real:

- **Tipos de datos ahora se validan de verdad**: antes, `numberOr`/`boolOr`/`stringOr`
  caían al default en silencio si el JSON traía un tipo incorrecto (ej.
  `"max_records": "5000"` no tronaba, usaba `5000` sin avisar). Se reemplazaron por
  `requireNumber`/`requireBoolean`/`requireString`/`requireStringArray`/`requireEnum`
  (todas al final de `loadConfig.ts`), que distinguen "campo ausente" (usa el default)
  de "campo presente con tipo incorrecto" (`ConfigValidationError` con el fieldPath y
  el valor recibido). Aplica también a los 4 arrays de `capture`
  (`excluded_paths`/`excluded_methods`/`sensitive_headers`/`sensitive_body_fields`).
- **Rangos nuevos**: `storage.config.port` (1-65535), `pool_size`/`timeout_ms`
  (postgres), `max_records`/`cleanup_interval_minutes`/`cleanup_older_than_hours`
  (memory), `monitoring.auto_refresh_interval` (5-300, tal como dice el PRD: "Desde 5
  segundos hasta 5 minutos"), `monitoring.auth.session_timeout_hours` (≥1),
  `monitoring.cache_duration_seconds` (≥0) — todos vía el helper `requireRange`.
- **Enums reales**: `journal_mode` inválido ahora falla al arranque (antes caía al
  default en silencio); `monitoring.auth.type` ya no está hardcodeado a `"basic"` —
  se valida contra `["basic"]` con `requireEnum` (sigue siendo el único tipo soportado
  por RF-03, pero ahora un valor distinto avisa en vez de ignorarse).
- **Formato**: `storage.config.connection_string` debe matchear
  `/^postgres(ql)?:\/\//`; `monitoring.endpoint` debe empezar con `/`.
- **Sección `retention` nueva** (antes no existía en absoluto en `RawApiScopeConfig`):
  se agregó `RawRetentionSection`/`RetentionConfig` (`config/types.ts`),
  `DEFAULT_RETENTION_CONFIG` (`config/defaults.ts`) y `buildRetentionConfig()`
  (`loadConfig.ts`), con la misma dependencia cruzada que ya existía para
  `auth.username`↔`password`: `archive_before_delete: true` sin `archive_path` falla.
  **Deliberadamente fuera de alcance**: la lógica de limpieza automática que lea esta
  sección y borre registros viejos de `SqliteStorage`/`PostgresStorage` — sigue
  pendiente (ver nota de "Retention" en la fase 2 más arriba). Por ahora `retention`
  solo se parsea, valida y expone en `ApiScopeConfig`, ningún storage la lee todavía.

**Tests**: 25 casos nuevos en `tests/unit/config/loadConfig.test.ts` (tipo incorrecto,
rango inválido, enum inválido, formato inválido, retention con sus defaults/custom/
dependencia, y un caso "camino feliz" que toca todos los campos nuevos a la vez) — TDD,
escritos antes de tocar `loadConfig.ts`. Suite completa: **148 tests, todos en verde**
(antes 125). Verificado también que `examples/express-basic/logger.config.json` (el que
usa `pnpm run example`) sigue cargando sin romperse con las validaciones más estrictas.

**Nota de entorno (superada, ver migración a pnpm más abajo)**: en esta máquina, con
`npm`, `npm install` normal fallaba compilando `better-sqlite3` desde código fuente
(node-gyp buscaba Visual Studio Build Tools, no instalados) porque Node subió a
v24.18.0 y no había binario prebuilt para esa versión todavía. `npm install
--ignore-scripts` lo resolvía como workaround. Con la migración a pnpm (ver más abajo)
esto dejó de ser un problema: `better-sqlite3` subió de `13.0.2` a `13.0.3`, que ya
trae un prebuild real para `win32-x64` (`node_modules/.pnpm/better-sqlite3@13.0.3/
node_modules/better-sqlite3/prebuilds/win32-x64.node`), sin depender de compilar nada.

## Migración de npm a pnpm

A pedido del usuario, el gestor de paquetes del backend pasó de `npm` a `pnpm`
(`pnpm --version` → `11.11.0` en esta máquina). Cambios:

- Se borraron `backend/node_modules` y `backend/package-lock.json`; `pnpm install`
  generó `backend/pnpm-lock.yaml` (nuevo archivo a commitear en vez del lockfile de npm).
- **pnpm 10+ bloquea scripts de instalación (`postinstall`) por default** (protección
  de supply-chain: un `pnpm install` normal ya no ejecuta código arbitrario de
  dependencias sin permiso explícito). El proyecto necesita que corran los de
  `better-sqlite3` (compila/selecciona el binario nativo de SQLite) y `esbuild`
  (binario nativo que usa Vitest para transformar TS). En vez de aprobarlos
  interactivamente con `pnpm approve-builds` (que exigiría un paso manual por
  desarrollador, y rompería RF-01 -- "instalación con un único comando"), se declararon
  de forma reproducible en `backend/pnpm-workspace.yaml`:
  ```yaml
  allowBuilds:
    better-sqlite3: true
    esbuild: true
  onlyBuiltDependencies:
    - better-sqlite3
    - esbuild
  ```
  Con esto, `pnpm install` a secas (sin flags) ya construye lo necesario y deja el
  resto de las dependencies sin ejecutar scripts, que es el comportamiento seguro por
  default que pnpm 10+ busca.
- Todos los comandos del proyecto pasan a usar `pnpm run <script>` (o `pnpm test`, que
  al igual que en npm no necesita `run`) en vez de `npm run <script>`/`npm test`.
  Referencias actualizadas en comentarios de código
  (`examples/express-basic/server.ts`, `scripts/generate-test.ts`,
  `scripts/migrate.ts`, `src/storage/PostgresStorage.ts`) y en este documento.
- Verificado: `pnpm install` limpio + `pnpm exec vitest run` → **148/148 tests en
  verde** (incluyendo `SqliteStorage`, que depende del binario nativo), y `pnpm exec
  tsc --noEmit` sin errores. `pnpm run test:coverage` sigue fallando porque falta
  instalar `@vitest/coverage-v8` -- gap preexistente de RF-07, no relacionado con la
  migración (ver fase 6 pendiente).

## Próximas fases (en orden, una por vez)

1. **Fase 5 — Dashboard web**: SPA embebida en un solo HTML (< 500KB), componentizada,
   Chart.js vía CDN, tabla con filtros, vista de detalle, auto-refresh.
2. **Fase 6 — Testing, versionado, docs, deprecación**: Vitest (cobertura ≥70% en
   storage/middleware/config/utils), Playwright Component Testing para la UI,
   CHANGELOG.md (Keep a Changelog), MIGRATION.md con una deprecación real (RF-09),
   README/CONFIGURATION/ARCHITECTURE/API.md, publicación del paquete.

Los tasks de este mismo tipo (fases) ya están creados en el task tracker de la
sesión — al retomar, marcar la fase correspondiente `in_progress` antes de empezar.
