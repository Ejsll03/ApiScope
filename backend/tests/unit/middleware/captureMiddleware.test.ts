import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CAPTURE_CONFIG } from "../../../src/config/defaults";
import type { CaptureConfig } from "../../../src/config/types";
import { captureMiddleware } from "../../../src/middleware/captureMiddleware";
import type { CursorPage, QueryOptions, StorageStrategy } from "../../../src/storage/types";
import type { LogRecord, ManualLogRecord, RequestLogRecord } from "../../../src/types";

function buildConfig(overrides: Partial<CaptureConfig> = {}): CaptureConfig {
  return { ...DEFAULT_CAPTURE_CONFIG, ...overrides };
}

/**
 * Fake StorageStrategy que graba los RequestLogRecord recibidos. saveRequestLog
 * empuja de forma sincrona (antes del primer await) para que quien llame a
 * waitForRecords() no dependa de timing de I/O real.
 */
function createRecordingStorage(): StorageStrategy & {
  records: RequestLogRecord[];
  waitForRecords(count: number): Promise<void>;
} {
  const records: RequestLogRecord[] = [];
  let pendingChecks: Array<() => void> = [];

  return {
    records,
    async init() {},
    async saveRequestLog(record: RequestLogRecord) {
      records.push(record);
      const toNotify = pendingChecks;
      pendingChecks = [];
      toNotify.forEach((check) => check());
    },
    async saveManualLog(_record: ManualLogRecord) {},
    async getRecords(_options?: QueryOptions): Promise<CursorPage<LogRecord>> {
      return { data: [], pagination: { hasMore: false, nextCursor: null, prevCursor: null, totalCount: 0 } };
    },
    async getRecordById() {
      return null;
    },
    async close() {},
    waitForRecords(count: number): Promise<void> {
      if (records.length >= count) return Promise.resolve();
      return new Promise((resolve) => {
        pendingChecks.push(function check() {
          if (records.length >= count) resolve();
          else pendingChecks.push(check);
        });
      });
    },
  };
}

let server: ReturnType<Express["listen"]> | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function startApp(app: Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

describe("captureMiddleware", () => {
  it("captura una request exitosa con method, path, status y latencia", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(captureMiddleware(storage, buildConfig()));
    app.get("/health", (_req, res) => res.json({ ok: true }));

    const baseUrl = await startApp(app);
    const res = await fetch(`${baseUrl}/health`);
    await res.text();
    await storage.waitForRecords(1);

    expect(storage.records).toHaveLength(1);
    const record = storage.records[0];
    expect(record.type).toBe("request");
    expect(record.method).toBe("GET");
    expect(record.path).toBe("/health");
    expect(record.statusCode).toBe(200);
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof record.id).toBe("string");
    expect(record.requestId).toBe(record.id);
  });

  it("no captura requests con metodo excluido", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(captureMiddleware(storage, buildConfig({ excludedMethods: ["GET"] })));
    app.get("/health", (_req, res) => res.json({ ok: true }));

    const baseUrl = await startApp(app);
    const res = await fetch(`${baseUrl}/health`);
    await res.text();

    expect(res.status).toBe(200);
    expect(storage.records).toHaveLength(0);
  });

  it("no captura requests bajo un path excluido", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(captureMiddleware(storage, buildConfig({ excludedPaths: ["/internal"] })));
    app.get("/internal/ping", (_req, res) => res.json({ ok: true }));

    const baseUrl = await startApp(app);
    const res = await fetch(`${baseUrl}/internal/ping`);
    await res.text();

    expect(res.status).toBe(200);
    expect(storage.records).toHaveLength(0);
  });

  it("captura requestHeaders y responseHeaders por separado, sin pisarse entre si", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(
      captureMiddleware(
        storage,
        buildConfig({ sensitiveHeaders: ["authorization"], maskSensitiveData: true })
      )
    );
    app.get("/health", (_req, res) => res.set("x-reply", "pong").json({ ok: true }));

    const baseUrl = await startApp(app);
    await fetch(`${baseUrl}/health`, { headers: { authorization: "Bearer secret-token" } });
    await storage.waitForRecords(1);

    const record = storage.records[0];
    // El header sensible de la REQUEST se enmascara y se conserva en requestHeaders...
    expect(record.requestHeaders.authorization).toBe("***MASKED***");
    // ...y no contamina ni es reemplazado por los headers de la RESPONSE.
    expect(record.responseHeaders["x-reply"]).toBe("pong");
    expect(record.responseHeaders.authorization).toBeUndefined();
  });

  it("no enmascara headers de la request cuando maskSensitiveData es false", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(
      captureMiddleware(
        storage,
        buildConfig({ sensitiveHeaders: ["authorization"], maskSensitiveData: false })
      )
    );
    app.get("/health", (_req, res) => res.json({ ok: true }));

    const baseUrl = await startApp(app);
    await fetch(`${baseUrl}/health`, { headers: { authorization: "Bearer secret-token" } });
    await storage.waitForRecords(1);

    expect(storage.records[0].requestHeaders.authorization).toBe("Bearer secret-token");
  });

  it("captura y enmascara el body de la REQUEST aunque no se capture el de la response", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(express.json());
    app.use(
      captureMiddleware(
        storage,
        buildConfig({ sensitiveBodyFields: ["password"], requestBody: true, responseBody: false })
      )
    );
    app.post("/users", (req, res) => res.status(201).json(req.body));

    const baseUrl = await startApp(app);
    await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "erick", password: "hunter2" }),
    });
    await storage.waitForRecords(1);

    const record = storage.records[0];
    const requestBody = record.requestBody as Record<string, unknown>;
    expect(requestBody.username).toBe("erick");
    expect(requestBody.password).toBe("***MASKED***");
    // responseBody sigue sin capturarse porque config.responseBody es false.
    expect(record.responseBody).toBeUndefined();
  });

  it("no captura requestBody cuando capture.requestBody es false", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(express.json());
    app.use(captureMiddleware(storage, buildConfig({ requestBody: false })));
    app.post("/users", (req, res) => res.status(201).json(req.body));

    const baseUrl = await startApp(app);
    await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "erick" }),
    });
    await storage.waitForRecords(1);

    expect(storage.records[0].requestBody).toBeUndefined();
  });

  it("captura el responseBody enmascarado cuando capture.responseBody es true", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(express.json());
    app.use(
      captureMiddleware(storage, buildConfig({ sensitiveBodyFields: ["password"], responseBody: true }))
    );
    app.post("/users", (req, res) => res.status(201).json(req.body));

    const baseUrl = await startApp(app);
    await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "erick", password: "hunter2" }),
    });
    await storage.waitForRecords(1);

    const responseBody = storage.records[0].responseBody as Record<string, unknown>;
    expect(responseBody.password).toBe("***MASKED***");
  });

  it("captura errorMessage y stackTrace reales via res.locals.apiScopeError", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(captureMiddleware(storage, buildConfig()));
    app.get("/boom", (_req, _res, next) => next(new Error("algo se rompio")));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.locals.apiScopeError = err;
      res.status(500).json({ error: "internal" });
    });

    const baseUrl = await startApp(app);
    await fetch(`${baseUrl}/boom`);
    await storage.waitForRecords(1);

    const record = storage.records[0];
    expect(record.statusCode).toBe(500);
    expect(record.errorMessage).toBe("algo se rompio");
    expect(record.stackTrace).toContain("algo se rompio");
  });

  it("no incluye errorMessage para responses exitosas (status < 400)", async () => {
    const storage = createRecordingStorage();
    const app = express();
    app.use(captureMiddleware(storage, buildConfig()));
    app.get("/health", (_req, res) => res.json({ ok: true }));

    const baseUrl = await startApp(app);
    await fetch(`${baseUrl}/health`);
    await storage.waitForRecords(1);

    expect(storage.records[0].errorMessage).toBeUndefined();
  });
});
