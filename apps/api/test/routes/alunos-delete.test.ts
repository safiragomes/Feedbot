import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";
import { criarFeedback } from "../../src/services/feedback.js";

describe("DELETE /alunos/:id", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();

  let periodoId: string;
  let alunoRemovidoId: string;
  let alunoOutroId: string;
  let feedbackDoRemovidoId: string;
  let feedbackDoOutroId: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste exclusao aluno ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;

    const turma = await prisma.turma.create({
      data: { periodoId, nome: "Turma teste", nomeAbaPlanilha: "Turma teste" },
    });

    const chefe = await prisma.monitor.create({
      data: { nome: "Chefe teste", whatsappNumero: `+55${sufixo}0`, isChefe: true, periodoId },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: chefe.id,
        email: `chefe-${sufixo}@teste.dev`,
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

    const grupo = await prisma.grupoRevisao.create({
      data: { periodoId, chefeId: chefe.id, nome: "Grupo teste" },
    });
    const dupla = await prisma.dupla.create({
      data: { grupoRevisaoId: grupo.id, label: "Dupla 1" },
    });

    const monitor = await prisma.monitor.create({
      data: { nome: "Monitor teste", whatsappNumero: `+55${sufixo}1`, periodoId },
    });

    const alunoRemovido = await prisma.aluno.create({
      data: {
        nome: "Aluno a remover",
        matricula: `TESTE-${sufixo}-1`,
        turmaId: turma.id,
        duplaId: dupla.id,
        monitorSemanaAId: monitor.id,
      },
    });
    alunoRemovidoId = alunoRemovido.id;
    const alunoOutro = await prisma.aluno.create({
      data: {
        nome: "Outro aluno",
        matricula: `TESTE-${sufixo}-2`,
        turmaId: turma.id,
        duplaId: dupla.id,
        monitorSemanaAId: monitor.id,
      },
    });
    alunoOutroId = alunoOutro.id;

    const lista = await prisma.lista.create({
      data: {
        periodoId,
        nome: "Lista teste",
        qtdQuestoesTotal: 6,
        ordem: 1,
      },
    });

    // Feedback do próprio aluno: deve ser apagado em cascata junto com o aluno.
    const feedbackDoRemovido = await criarFeedback(prisma, {
      alunoId: alunoRemovidoId,
      monitorId: monitor.id,
      listaId: lista.id,
      qtdQuestoesPontuadas: 4,
      questoesPlagio: [{ numeroQuestao: 1, alunoEnvolvidoId: alunoOutroId }],
    });
    feedbackDoRemovidoId = feedbackDoRemovido.id;

    // Feedback de outro aluno que aponta o primeiro como envolvido em plágio: o
    // feedback em si deve permanecer, só a menção ao aluno removido some (cascade
    // em FeedbackQuestaoPlagio.alunoEnvolvidoId).
    const feedbackDoOutro = await criarFeedback(prisma, {
      alunoId: alunoOutroId,
      monitorId: monitor.id,
      listaId: lista.id,
      qtdQuestoesPontuadas: 3,
      questoesPlagio: [{ numeroQuestao: 2, alunoEnvolvidoId: alunoRemovidoId }],
    });
    feedbackDoOutroId = feedbackDoOutro.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.feedback.deleteMany({ where: { lista: { periodoId } } });
    await prisma.lista.deleteMany({ where: { periodoId } });
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.dupla.deleteMany({ where: { grupoRevisao: { periodoId } } });
    await prisma.grupoRevisao.deleteMany({ where: { periodoId } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("exclui o aluno e apaga em cascata o feedback dele, preservando o de terceiros", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/alunos/${alunoRemovidoId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(204);

    expect(await prisma.aluno.findUnique({ where: { id: alunoRemovidoId } })).toBeNull();
    expect(await prisma.feedback.findUnique({ where: { id: feedbackDoRemovidoId } })).toBeNull();

    const feedbackDoOutro = await prisma.feedback.findUnique({
      where: { id: feedbackDoOutroId },
      include: { questoesPlagio: true },
    });
    expect(feedbackDoOutro).not.toBeNull();
    expect(feedbackDoOutro?.questoesPlagio).toHaveLength(0);
  });
});

describe("POST /alunos/excluir-lote", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();

  let periodoId: string;
  let alunoIds: string[];

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste exclusao lote ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;

    const turma = await prisma.turma.create({
      data: { periodoId, nome: "Turma teste", nomeAbaPlanilha: "Turma teste" },
    });

    const chefe = await prisma.monitor.create({
      data: { nome: "Chefe teste", whatsappNumero: `+55${sufixo}0`, isChefe: true, periodoId },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: chefe.id,
        email: `chefe-lote-${sufixo}@teste.dev`,
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

    const alunos = await prisma.$transaction(
      Array.from({ length: 20 }).map((_, i) =>
        prisma.aluno.create({
          data: { nome: `Aluno lote ${i}`, matricula: `LOTE-${sufixo}-${i}`, turmaId: turma.id },
        }),
      ),
    );
    alunoIds = alunos.map((a) => a.id);
  });

  afterAll(async () => {
    await app.close();
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("rejeita lote vazio ou maior que 500", async () => {
    const vazio = await app.inject({
      method: "POST",
      url: "/alunos/excluir-lote",
      headers: { authorization: `Bearer ${token}`, "x-feedbot-client": "web" },
      payload: { ids: [] },
    });
    expect(vazio.statusCode).toBe(400);

    const grandeDemais = await app.inject({
      method: "POST",
      url: "/alunos/excluir-lote",
      headers: { authorization: `Bearer ${token}`, "x-feedbot-client": "web" },
      payload: { ids: Array.from({ length: 501 }, (_, i) => `id-${i}`) },
    });
    expect(grandeDemais.statusCode).toBe(400);
  });

  it("exclui um lote misto — alguns com feedback registrado, outros não — numa única chamada", async () => {
    const monitor = await prisma.monitor.create({
      data: { nome: "Monitor lote misto", whatsappNumero: `+55${sufixo}2`, periodoId },
    });
    const lista = await prisma.lista.create({
      data: { periodoId, nome: "Lista lote misto", qtdQuestoesTotal: 6, ordem: 2 },
    });
    const turma = await prisma.turma.findFirstOrThrow({ where: { periodoId } });
    const comFeedback = await prisma.aluno.create({
      data: { nome: "Com feedback", matricula: `MISTO-${sufixo}-1`, turmaId: turma.id },
    });
    const semFeedback = await prisma.aluno.create({
      data: { nome: "Sem feedback", matricula: `MISTO-${sufixo}-2`, turmaId: turma.id },
    });
    const feedback = await criarFeedback(prisma, {
      alunoId: comFeedback.id,
      monitorId: monitor.id,
      listaId: lista.id,
      qtdQuestoesPontuadas: 3,
    });

    const response = await app.inject({
      method: "POST",
      url: "/alunos/excluir-lote",
      headers: { authorization: `Bearer ${token}`, "x-feedbot-client": "web" },
      payload: { ids: [comFeedback.id, semFeedback.id] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ excluidos: 2 });

    expect(
      await prisma.aluno.count({ where: { id: { in: [comFeedback.id, semFeedback.id] } } }),
    ).toBe(0);
    // O feedback do aluno excluído cai em cascata junto — não sobra órfão.
    expect(await prisma.feedback.findUnique({ where: { id: feedback.id } })).toBeNull();
  });

  it("exclui todos os alunos do lote numa única chamada", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/alunos/excluir-lote",
      headers: { authorization: `Bearer ${token}`, "x-feedbot-client": "web" },
      payload: { ids: alunoIds },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ excluidos: alunoIds.length });

    const restantes = await prisma.aluno.count({ where: { id: { in: alunoIds } } });
    expect(restantes).toBe(0);
  });

  it("ignora ids inexistentes sem erro, contando só o que existia", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/alunos/excluir-lote",
      headers: { authorization: `Bearer ${token}`, "x-feedbot-client": "web" },
      payload: { ids: ["id-que-nao-existe-1", "id-que-nao-existe-2"] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ excluidos: 0 });
  });
});
