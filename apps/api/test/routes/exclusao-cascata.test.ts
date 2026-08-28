import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";
import { criarFeedback } from "../../src/services/feedback.js";

describe("DELETE /grupos-revisao/:id", () => {
  const sufixo = Date.now();
  const app = buildApp({ prisma });
  const token = newSessionToken();

  let periodoId: string;
  let grupoId: string;
  let duplaId: string;
  let monitorId: string;
  let alunoId: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste exclusao grupo ${sufixo}`,
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
      data: { monitorId: chefe.id, email: `chefe-${sufixo}@teste.dev`, senhaHash: await hashPassword("senha-de-teste-1234") },
    });
    await prisma.sessaoChefe.create({
      data: { contaChefeId: conta.id, tokenHash: await hashToken(token), expiraEm: new Date(Date.now() + 60_000) },
    });

    const grupo = await prisma.grupoRevisao.create({
      data: { periodoId, chefeId: chefe.id, nome: "Grupo a remover" },
    });
    grupoId = grupo.id;

    const dupla = await prisma.dupla.create({ data: { grupoRevisaoId: grupo.id, label: "Dupla 1" } });
    duplaId = dupla.id;

    const monitor = await prisma.monitor.create({
      data: { nome: "Monitor da dupla", whatsappNumero: `+55${sufixo}1`, periodoId, duplaId: dupla.id },
    });
    monitorId = monitor.id;

    const aluno = await prisma.aluno.create({
      data: {
        nome: "Aluno da dupla",
        matricula: `TESTE-${sufixo}-1`,
        turmaId: turma.id,
        duplaId: dupla.id,
        monitorSemanaAId: monitor.id,
      },
    });
    alunoId = aluno.id;

    // Simula um aluno que registrou feedback numa dupla e depois foi movido pra outra
    // — Feedback.duplaId é um retrato de quando o feedback foi criado, não acompanha
    // Aluno.duplaId depois. A dupla original (com o feedback "órfão" apontando pra
    // ela) precisa continuar cascateando quando o grupo inteiro é apagado.
    const outraDupla = await prisma.dupla.create({ data: { grupoRevisaoId: grupo.id, label: "Dupla 2" } });
    const alunoMovido = await prisma.aluno.create({
      data: {
        nome: "Aluno que trocou de dupla",
        matricula: `TESTE-${sufixo}-2`,
        turmaId: turma.id,
        duplaId: dupla.id,
        monitorSemanaAId: monitor.id,
      },
    });
    const lista = await prisma.lista.create({
      data: {
        periodoId,
        nome: "Lista teste",
        qtdQuestoesTotal: 6,
        ordem: 1,
      },
    });
    await criarFeedback(prisma, {
      alunoId: alunoMovido.id,
      monitorId: monitor.id,
      listaId: lista.id,
      qtdQuestoesPontuadas: 4,
    });
    await prisma.aluno.update({ where: { id: alunoMovido.id }, data: { duplaId: outraDupla.id, monitorSemanaAId: null } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.feedback.deleteMany({ where: { lista: { periodoId } } });
    await prisma.lista.deleteMany({ where: { periodoId } });
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("apaga o grupo em cascata (duplas e alunos), mas só desvincula os monitores em vez de apagá-los", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/grupos-revisao/${grupoId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(204);

    expect(await prisma.grupoRevisao.findUnique({ where: { id: grupoId } })).toBeNull();
    expect(await prisma.dupla.findUnique({ where: { id: duplaId } })).toBeNull();
    expect(await prisma.aluno.findUnique({ where: { id: alunoId } })).toBeNull();

    const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor).not.toBeNull();
    expect(monitor?.duplaId).toBeNull();

    // O feedback "órfão" que ainda apontava pra dupla original (de antes do aluno ter
    // sido movido pra outra dupla do mesmo grupo) também precisa ter sumido.
    expect(await prisma.feedback.count({ where: { duplaId } })).toBe(0);
  });
});

describe("DELETE /monitores/:id", () => {
  const sufixo = Date.now();
  const app = buildApp({ prisma });
  const token = newSessionToken();

  let periodoId: string;
  let monitorRemovidoId: string;
  let alunoId: string;
  let feedbackId: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste exclusao monitor ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;

    const turma = await prisma.turma.create({
      data: { periodoId, nome: "Turma teste", nomeAbaPlanilha: "Turma teste" },
    });

    const chefeSessao = await prisma.monitor.create({
      data: { nome: "Chefe da sessão", whatsappNumero: `+55${sufixo}0`, isChefe: true, periodoId },
    });
    const conta = await prisma.contaChefe.create({
      data: { monitorId: chefeSessao.id, email: `chefe-${sufixo}@teste.dev`, senhaHash: await hashPassword("senha-de-teste-1234") },
    });
    await prisma.sessaoChefe.create({
      data: { contaChefeId: conta.id, tokenHash: await hashToken(token), expiraEm: new Date(Date.now() + 60_000) },
    });

    const grupo = await prisma.grupoRevisao.create({
      data: { periodoId, chefeId: chefeSessao.id, nome: "Grupo teste" },
    });
    const dupla = await prisma.dupla.create({ data: { grupoRevisaoId: grupo.id, label: "Dupla 1" } });

    // Monitor a remover: também é chefe, com conta/login própria (deve cascatear
    // junto), e já tem feedback registrado (o que antes bloqueava a exclusão).
    const monitorRemovido = await prisma.monitor.create({
      data: { nome: "Monitor a remover", whatsappNumero: `+55${sufixo}1`, isChefe: true, periodoId, duplaId: dupla.id },
    });
    monitorRemovidoId = monitorRemovido.id;
    await prisma.contaChefe.create({
      data: {
        monitorId: monitorRemovido.id,
        email: `monitor-removido-${sufixo}@teste.dev`,
        senhaHash: await hashPassword("senha-de-teste-1234"),
      },
    });

    const aluno = await prisma.aluno.create({
      data: {
        nome: "Aluno do monitor removido",
        matricula: `TESTE-${sufixo}-1`,
        turmaId: turma.id,
        duplaId: dupla.id,
        monitorSemanaAId: monitorRemovido.id,
      },
    });
    alunoId = aluno.id;

    const lista = await prisma.lista.create({
      data: {
        periodoId,
        nome: "Lista teste",
        qtdQuestoesTotal: 6,
        ordem: 1,
      },
    });
    const feedback = await criarFeedback(prisma, {
      alunoId,
      monitorId: monitorRemovido.id,
      listaId: lista.id,
      qtdQuestoesPontuadas: 4,
    });
    feedbackId = feedback.id;
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

  it("apaga o monitor mesmo com feedback e login de chefe, em cascata — sem oferecer anonimizar", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/monitores/${monitorRemovidoId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(204);

    expect(await prisma.monitor.findUnique({ where: { id: monitorRemovidoId } })).toBeNull();
    expect(await prisma.feedback.findUnique({ where: { id: feedbackId } })).toBeNull();
    expect(await prisma.contaChefe.findFirst({ where: { monitorId: monitorRemovidoId } })).toBeNull();

    // O aluno continua existindo — só perde a atribuição de monitor da semana A.
    const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
    expect(aluno).not.toBeNull();
    expect(aluno?.monitorSemanaAId).toBeNull();
  });

  it("a rota de anonimizar monitor não existe mais", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/privacidade/monitores/algum-id`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(404);
  });
});
