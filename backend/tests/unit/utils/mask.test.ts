import { describe, expect, it } from "vitest";
import { maskBody, maskHeaders } from "../../../src/utils/mask";

describe("maskHeaders", () => {
  it("enmascara headers listados en sensitiveHeaderNames, sin importar mayusculas", () => {
    const result = maskHeaders(
      { Authorization: "Bearer xyz", "X-Custom": "keep-me" },
      ["authorization"]
    );

    expect(result.Authorization).toBe("***MASKED***");
    expect(result["X-Custom"]).toBe("keep-me");
  });

  it("no enmascara nada si la lista de headers sensibles esta vacia", () => {
    const result = maskHeaders({ cookie: "session=abc" }, []);
    expect(result.cookie).toBe("session=abc");
  });
});

describe("maskBody", () => {
  it("enmascara los campos indicados en sensitiveFieldNames (case-insensitive)", () => {
    const result = maskBody(
      { username: "erick", Password: "hunter2" },
      ["password"]
    ) as Record<string, unknown>;

    expect(result.username).toBe("erick");
    expect(result.Password).toBe("***MASKED***");
  });

  it("no enmascara campos que no esten en la lista configurada", () => {
    const result = maskBody({ token: "abc123" }, []) as Record<string, unknown>;
    expect(result.token).toBe("abc123");
  });

  it("respeta una lista custom, distinta de los defaults tradicionales", () => {
    const result = maskBody(
      { password: "hunter2", pin: "1234" },
      ["pin"]
    ) as Record<string, unknown>;

    // "password" ya no esta en la lista configurada -> no se enmascara.
    expect(result.password).toBe("hunter2");
    expect(result.pin).toBe("***MASKED***");
  });

  it("enmascara recursivamente dentro de objetos y arrays anidados", () => {
    const result = maskBody(
      { user: { credentials: { secret: "shh" } }, list: [{ token: "t1" }] },
      ["secret", "token"]
    ) as any;

    expect(result.user.credentials.secret).toBe("***MASKED***");
    expect(result.list[0].token).toBe("***MASKED***");
  });

  it("deja pasar valores primitivos sin modificar", () => {
    expect(maskBody("hello", ["password"])).toBe("hello");
    expect(maskBody(42, ["password"])).toBe(42);
    expect(maskBody(null, ["password"])).toBe(null);
  });
});
