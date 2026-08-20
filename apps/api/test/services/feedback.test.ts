import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { calcularSemana } from "../../src/domain/semana.js";
import { criarFeedback } from "../../src/services/feedback.js";

describe("criarFeedback", () => {
  const sufixo = Date.now();
  const dataReferenciaRodizio = new Date("2026-08-03T00:00:00Z");

  let periodoId: string;
  let grupoId: string;
  let listaId: string;
  let duplaId: string;
  let monitorId: string;
  let alunoId: string;
  let alunoDeOutraDuplaId: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste feedback ${sufixo}`,
        dataInicio: dataReferenciaRodizio,
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio,
      },
    });
    periodoId = periodo.id;

    const turma = await prisma.turma.create({
      data: { periodoId, nome: "Turma teste", nomeAbaPlanilha: "Turma teste" },
    });

    const chefe = await prisma.monitor.create({
      data: { nome: "Chefe teste", whatsappNumero: `+55${sufixo}0`, isChefe: true, periodoId },
    });

    const grupo = await prisma.grupoRevisao.create({
      data: { periodoId, chefeId: chefe.id, nome: "Grupo teste" },
    });
    grupoId = grupo.id;

    const dupla = await prisma.dupla.create({
      data: { grupoRevisaoId: grupo.id, label: "Dupla 1" },
    });
    duplaId = dupla.id;
    const outraDupla = await prisma.dupla.create({
      data: { grupoRevisaoId: grupo.id, label: "Dupla 2" },
    });

    const monitor = await prisma.monitor.create({
      data: { nome: "Monitor teste", whatsappNumero: `+55${sufixo}1`, periodoId, duplaId },
    });
    monitorId = monitor.id;

    const aluno = await prisma.aluno.create({
      data: { nome: "Aluno teste", matricula: `TESTE-${sufixo}-1`, turmaId: turma.id, duplaId },
    });
    alunoId = aluno.id;

    const alunoDeOutraDupla = await prisma.aluno.create({
      data: {
        nome: "Aluno outra dupla",
        matricula: `TESTE-${sufixo}-2`,
        turmaId: turma.id,
        duplaId: outraDupla.id,
      },
    });
    alunoDeOutraDuplaId = alunoDeOutraDupla.id;

    const lista = await prisma.lista.create({
      data: {
        periodoId,
        nome: "Lista teste",
        qtdQuestoesTotal: 6,
        prazoEntregaFeedback: new Date("2026-09-01T00:00:00Z"),
      },
    });
    listaId = lista.id;
  });

  afterAll(async () => {
    await prisma.feedback.deleteMany({ where: { listaId } });
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.lista.deleteMany({ where: { periodoId } });
    await prisma.dupla.updateMany({ where: { grupoRevisaoId: grupoId }, data: { monitorSemanaAId: null, monitorSemanaBId: null } });
    await prisma.monitor.updateMany({ where: { periodoId }, data: { duplaId: null } });
    await prisma.dupla.deleteMany({ where: { grupoRevisaoId: grupoId } });
    await prisma.grupoRevisao.deleteMany({ where: { periodoId } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("cria o feedback com a semana calculada e as questões relacionadas, deduplicando números repetidos", async () => {
    const feedback = await criarFeedback(prisma, {
      alunoId,
      monitorId,
      listaId,
      qtdQuestoesPontuadas: 5,
      questoesIa: [1, 3, 1],
      questoesProibicao: [2],
    });

    const semanaEsperada = calcularSemana({ hoje: new Date(), dataReferenciaRodizio, semanaOverride: null });
    expect(feedback.semana).toBe(semanaEsperada);
    expect(feedback.usouIa).toBe(true);
    expect(feedback.plagiou).toBe(false);
    expect(feedback.usouProibicao).toBe(true);
    expect(feedback.sincronizadoPlanilha).toBe(false);

    const questoesIa = await prisma.feedbackQuestaoIA.findMany({ where: { feedbackId: feedback.id } });
    expect(questoesIa.map((item) => item.numeroQuestao).sort()).toEqual([1, 3]);
  });

  it("registra o aluno envolvido em cada questão de plágio", async () => {
    const feedback = await criarFeedback(prisma, {
      alunoId,
      monitorId,
      listaId,
      qtdQuestoesPontuadas: 4,
      questoesPlagio: [
        { numeroQuestao: 2, alunoEnvolvidoId: alunoDeOutraDuplaId },
        { numeroQuestao: 4, alunoEnvolvidoId: alunoDeOutraDuplaId },
      ],
    });

    expect(feedback.plagiou).toBe(true);
    const questoesPlagio = await prisma.feedbackQuestaoPlagio.findMany({
      where: { feedbackId: feedback.id },
    });
    expect(questoesPlagio).toHaveLength(2);
    expect(questoesPlagio.every((item) => item.alunoEnvolvidoId === alunoDeOutraDuplaId)).toBe(true);
  });

  it("recusa quando o aluno não pertence à dupla do monitor", async () => {
    await expect(
      criarFeedback(prisma, {
        alunoId: alunoDeOutraDuplaId,
        monitorId,
        listaId,
        qtdQuestoesPontuadas: 3,
      }),
    ).rejects.toThrow("Monitor só pode registrar feedback da própria dupla");
  });

  it("recusa quantidade de questões corretas fora do intervalo da lista", async () => {
    await expect(
      criarFeedback(prisma, {
        alunoId,
        monitorId,
        listaId,
        qtdQuestoesPontuadas: 99,
      }),
    ).rejects.toThrow("Quantidade de questões corretas inválida");
  });

  it("recusa número de questão fora do intervalo da lista", async () => {
    await expect(
      criarFeedback(prisma, {
        alunoId,
        monitorId,
        listaId,
        qtdQuestoesPontuadas: 3,
        questoesIa: [99],
      }),
    ).rejects.toThrow("Número de questão inválido");
  });

  it("recusa aluno como envolvido em plágio de si mesmo", async () => {
    await expect(
      criarFeedback(prisma, {
        alunoId,
        monitorId,
        listaId,
        qtdQuestoesPontuadas: 3,
        questoesPlagio: [{ numeroQuestao: 1, alunoEnvolvidoId: alunoId }],
      }),
    ).rejects.toThrow("Aluno não pode ser envolvido em plágio próprio");
  });
});
