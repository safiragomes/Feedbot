import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";

describe("Prazo efetivo em GET /feedbacks", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();
  let periodoId: string | undefined;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste feedbacks prazo ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;
    const chefe = await prisma.monitor.create({
      data: { nome: "Chefe teste grupos de prazo", isChefe: true, periodoId },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: chefe.id,
        email: `chefe-grupos-prazo-${sufixo}@teste.dev`,
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
  });

  afterAll(async () => {
    await app.close();
    if (!periodoId) return;
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.grupoPrazo.deleteMany({ where: { periodoId } });
    await prisma.lista.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("retorna prazo do grupo, depois exceção individual, turma e ausência sem expor prazos internos", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Grupo de prazo" },
    });
    const turma = await prisma.turma.create({
      data: { periodoId: periodoId!, nome: "Turma", nomeAbaPlanilha: "Turma" },
    });
    const aluno = await prisma.aluno.create({
      data: {
        nome: "Aluno teste",
        matricula: `FEEDBACK-PRAZO-${sufixo}`,
        turmaId: turma.id,
        grupoPrazoId: grupo.id,
      },
    });
    const lista = await prisma.lista.create({
      data: { periodoId: periodoId!, nome: "Lista", ordem: 1, qtdQuestoesTotal: 6 },
    });
    const feedback = await prisma.feedback.create({
      data: {
        alunoId: aluno.id,
        listaId: lista.id,
        monitorNome: "Monitor teste",
        semana: "A",
        qtdQuestoesPontuadas: 4,
      },
    });
    await prisma.prazoLista.create({
      data: {
        listaId: lista.id,
        turmaId: turma.id,
        prazoEntregaFeedback: new Date("2026-09-15T00:00:00Z"),
      },
    });
    await prisma.prazoGrupoLista.create({
      data: {
        listaId: lista.id,
        grupoPrazoId: grupo.id,
        prazoEntregaFeedback: new Date("2026-09-20T00:00:00Z"),
      },
    });
    async function verificarPrazo(esperado: string | null) {
      const resposta = await app.inject({
        method: "GET",
        url: `/feedbacks?periodoId=${periodoId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(resposta.statusCode).toBe(200);
      const itens = resposta.json() as {
        id: string;
        prazoEntregaFeedback: string | null;
        lista: Record<string, unknown>;
      }[];
      expect(itens).toHaveLength(1);
      expect(itens[0]?.id).toBe(feedback.id);
      expect(itens[0]?.prazoEntregaFeedback).toBe(esperado);
      expect(itens[0]?.lista).not.toHaveProperty("prazosGrupo");
      expect(itens[0]?.lista).not.toHaveProperty("prazos");
    }
    await verificarPrazo("2026-09-20T00:00:00.000Z");
    await prisma.prazoAlunoLista.create({
      data: {
        alunoId: aluno.id,
        listaId: lista.id,
        prazoEntregaFeedback: new Date("2026-09-25T00:00:00Z"),
      },
    });
    await verificarPrazo("2026-09-25T00:00:00.000Z");
    await prisma.prazoAlunoLista.deleteMany({ where: { alunoId: aluno.id } });
    await prisma.grupoPrazo.delete({ where: { id: grupo.id } });
    await verificarPrazo("2026-09-15T00:00:00.000Z");
    await prisma.prazoLista.deleteMany({ where: { listaId: lista.id } });
    await verificarPrazo(null);
  });
});
