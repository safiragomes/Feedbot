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

  it("rejeita a sessão de um chefe inativo", async () => {
    const prisma = {
      sessaoChefe: {
        findUnique: async () => ({
          expiraEm: new Date(Date.now() + 60_000),
          contaChefeId: "conta-1",
          contaChefe: {
            email: "chefe@teste.dev",
            monitorId: "monitor-1",
            monitor: { isChefe: true, status: "INATIVO" },
          },
        }),
      },
    } as unknown as PrismaClient;
    const app = buildApp({ prisma });
    const response = await app.inject({
      method: "GET",
      url: "/periodos",
      headers: { authorization: "Bearer token-valido" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("aceita sessão por cookie HttpOnly nas consultas", async () => {
    const prisma = {
      sessaoChefe: {
        findUnique: async () => ({
          expiraEm: new Date(Date.now() + 60_000),
          contaChefeId: "conta-1",
          contaChefe: {
            email: "chefe@teste.dev",
            monitorId: "monitor-1",
            monitor: { nome: "Chefe Teste", isChefe: true, status: "ATIVO" },
          },
        }),
      },
    } as unknown as PrismaClient;
    const app = buildApp({ prisma });
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: "feedbot_session=token-cookie" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().chefe.id).toBe("monitor-1");
    await app.close();
  });

  it("bloqueia alteração por cookie sem a proteção CSRF", async () => {
    const app = buildApp({ prisma: {} as PrismaClient });
    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: "feedbot_session=token-cookie" },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejeita senha excessivamente grande antes de consultar o banco", async () => {
    const app = buildApp({ prisma: {} as PrismaClient });
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "chefe@teste.dev", senha: "x".repeat(257) },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
