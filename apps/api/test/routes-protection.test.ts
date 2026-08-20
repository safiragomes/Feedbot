import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { buildApp } from "../src/app.js";

describe("rotas da API de gestão", () => {
  it("monta as rotas e exige uma sessão de chefe", async () => {
    const app = buildApp({ prisma: {} as PrismaClient });

    const response = await app.inject({ method: "GET", url: "/periodos" });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Sessão de chefe obrigatória");
    await app.close();
  });

  it("não permite inicializar uma conta sem o segredo configurado", async () => {
    const app = buildApp({ prisma: {} as PrismaClient });

    const response = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { segredo: "incorreto" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
