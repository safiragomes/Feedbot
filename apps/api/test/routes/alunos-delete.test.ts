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

    // Feedback do próprio aluno que será preservado ao bloquear a exclusão.
    const feedbackDoRemovido = await criarFeedback(prisma, {
      alunoId: alunoRemovidoId,
      monitorId: monitor.id,
      listaId: lista.id,
      qtdQuestoesPontuadas: 4,
      questoesPlagio: [{ numeroQuestao: 1, alunoEnvolvidoId: alunoOutroId }],
    });
    feedbackDoRemovidoId = feedbackDoRemovido.id;

    // Feedback de outro aluno que aponta o primeiro como envolvido também deve permanecer.
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

  it("bloqueia a exclusão do aluno e preserva todo o histórico", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/alunos/${alunoRemovidoId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("anonimização");

    expect(await prisma.aluno.findUnique({ where: { id: alunoRemovidoId } })).not.toBeNull();
    expect(
      await prisma.feedback.findUnique({ where: { id: feedbackDoRemovidoId } }),
    ).not.toBeNull();

    const feedbackDoOutro = await prisma.feedback.findUnique({
      where: { id: feedbackDoOutroId },
      include: { questoesPlagio: true },
    });
    expect(feedbackDoOutro).not.toBeNull();
    expect(feedbackDoOutro?.questoesPlagio).toHaveLength(1);
  });
});
