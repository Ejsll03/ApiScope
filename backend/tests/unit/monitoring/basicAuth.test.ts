import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { MonitoringAuthConfig } from "../../../src/config/types";
import { basicAuthMiddleware } from "../../../src/monitoring/basicAuth";

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

  it("responde 401 + WWW-Authenticate cuando no hay header Authorization", async () => {
    const baseUrl = await startApp(buildApp(authConfig()));
    const res = await fetch(`${baseUrl}/protected`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/Basic/);
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
