import express, { type Express } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { MonitoringAuthConfig } from "../../../src/config/types";
import { basicAuthMiddleware } from "../../../src/monitoring/basicAuth";

/**
 * fetch() -- incluso el `fetch` global de Node -- manda `Sec-Fetch-Mode`
 * porque es parte del spec Fetch, no una particularidad de navegadores.
 * Para simular un cliente real "no-navegador" (curl, Postman) hace falta
 * bajar a `http.request`, que no agrega ese header.
 */
function rawGet(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      })
      .on("error", reject);
  });
}

function authConfig(overrides: Partial<MonitoringAuthConfig> = {}): MonitoringAuthConfig {
  return {
    enabled: true,
    type: "basic",
    username: "admin",
    password: "s3cret",
    sessionTimeoutHours: 1,
    ...overrides,
  };
}

function basicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
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

function buildApp(auth: MonitoringAuthConfig): Express {
  const app = express();
  app.use(basicAuthMiddleware(auth));
  app.get("/protected", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("basicAuthMiddleware", () => {
  it("deja pasar sin pedir credenciales cuando auth.enabled es false", async () => {
    const baseUrl = await startApp(buildApp(authConfig({ enabled: false })));
    const res = await fetch(`${baseUrl}/protected`);
    expect(res.status).toBe(200);
  });

  it("responde 401 + WWW-Authenticate para clientes no-navegador (curl, Postman, etc.)", async () => {
    const baseUrl = await startApp(buildApp(authConfig()));
    const res = await rawGet(`${baseUrl}/protected`);
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toMatch(/Basic/);
  });

  it("responde 401 SIN WWW-Authenticate cuando el request trae Sec-Fetch-Mode (fetch/XHR de un navegador)", async () => {
    // Chrome intercepta cualquier 401 con WWW-Authenticate: Basic a nivel
    // de red -- incluso para fetch()/XHR, no solo para navegacion -- e
    // intenta mostrar su propio dialogo nativo de credenciales. La SPA de
    // ApiScope implementa su propio LoginForm y nunca depende del dialogo
    // nativo, asi que ese header rompe el flujo: el fetch de useAuth.js
    // se queda colgado esperando un dialogo que nunca aparece (headless)
    // o que tapa el LoginForm (navegador real). Los navegadores -- y el
    // `fetch` global de Node, que sigue el mismo spec -- mandan
    // `Sec-Fetch-Mode` en todo fetch/XHR; un cliente crudo como curl no.
    const baseUrl = await startApp(buildApp(authConfig()));
    const res = await fetch(`${baseUrl}/protected`, { headers: { "sec-fetch-mode": "cors" } });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });

  it("responde 401 con credenciales incorrectas", async () => {
    const baseUrl = await startApp(buildApp(authConfig()));
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { authorization: basicHeader("admin", "wrong-password") },
    });
    expect(res.status).toBe(401);
  });

  it("responde 401 con un usuario que no existe", async () => {
    const baseUrl = await startApp(buildApp(authConfig()));
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { authorization: basicHeader("nadie", "s3cret") },
    });
    expect(res.status).toBe(401);
  });

  it("responde 401 con un header Authorization malformado (no Basic)", async () => {
    const baseUrl = await startApp(buildApp(authConfig()));
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { authorization: "Bearer algun-token" },
    });
    expect(res.status).toBe(401);
  });

  it("deja pasar con credenciales correctas", async () => {
    const baseUrl = await startApp(buildApp(authConfig()));
    const res = await fetch(`${baseUrl}/protected`, {
      headers: { authorization: basicHeader("admin", "s3cret") },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
