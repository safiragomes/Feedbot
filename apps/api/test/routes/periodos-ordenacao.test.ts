import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";

describe("GET /periodos - desempate de ordenação", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();

  afterAll(async () => {
    await app.close();
  });

  it("desempata por criadoEm quando dois períodos têm o mesmo dataInicio", async () => {
    const dataInicio = new Date("2026-08-03T00:00:00Z");
    const comum = {
      dataInicio,
      dataFim: new Date("2026-12-01T00:00:00Z"),
      dataReferenciaRodizio: dataInicio,
    };
    // Cria em sequência (não em paralelo) pra garantir criadoEm distinto e previsível.
    const maisAntigo = await prisma.periodo.create({
      data: { nome: `Periodo mais antigo ${sufixo}`, ...comum },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const maisRecente = await prisma.periodo.create({
      data: { nome: `Periodo mais recente ${sufixo}`, ...comum },
    });
    const periodoIds = [maisAntigo.id, maisRecente.id];

    const chefe = await prisma.monitor.create({
      data: {
        nome: "Chefe ordenacao",
        whatsappNumero: `+55${sufixo}9`,
        isChefe: true,
        periodoId: maisAntigo.id,
      },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: chefe.id,
        email: `chefe-ordenacao-${sufixo}@teste.dev`,
        senhaHash: await hashPassword("senha-de-teste-1234"),
      },
    });
    await prisma.sessaoChefe.create({
      data: {
        contaChefeId: conta.id,
        tokenHash: await hashToken(token),
        expiraEm: new Date(Date.now() + 60_000),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/periodos",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const periodos = response.json() as { id: string; nome: string }[];
    const indiceAntigo = periodos.findIndex((p) => p.id === maisAntigo.id);
    const indiceRecente = periodos.findIndex((p) => p.id === maisRecente.id);
    // O criado por último (maisRecente) deve vir antes na lista — é o que o painel
    // escolhe como padrão no login (periodosResp[0]).
    expect(indiceRecente).toBeLessThan(indiceAntigo);

    await prisma.sessaoChefe.deleteMany({ where: { contaChefeId: conta.id } });
    await prisma.contaChefe.delete({ where: { id: conta.id } });
    await prisma.monitor.delete({ where: { id: chefe.id } });
    await prisma.periodo.deleteMany({ where: { id: { in: periodoIds } } });
  });
});
