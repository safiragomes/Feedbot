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
  let monitorSemanaBId: string;
  let alunoId: string;
  let alunoParaPlagioId: string;
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
    const monitorB = await prisma.monitor.create({
      data: { nome: "Monitor semana B", whatsappNumero: `+55${sufixo}2`, periodoId, duplaId },
    });
    monitorSemanaBId = monitorB.id;

    const aluno = await prisma.aluno.create({
      data: {
        nome: "Aluno teste",
        matricula: `TESTE-${sufixo}-1`,
        turmaId: turma.id,
        duplaId,
        // A lista de teste é a única/primeira do período → posição 1 → semana A, então
        // o monitor de teste precisa ser o monitor de semana A deste aluno; o outro
        // monitor da dupla (monitorB) vira semana B automaticamente (derivado).
        monitorSemanaAId: monitor.id,
      },
    });
    alunoId = aluno.id;

    // Aluno separado (mesma dupla/monitor) só pra não colidir com o Feedback já criado
    // por "alunoId" no teste de criação — Feedback agora é único por (alunoId, listaId).
    const alunoPlagio = await prisma.aluno.create({
      data: {
        nome: "Aluno para plágio",
        matricula: `TESTE-${sufixo}-3`,
        turmaId: turma.id,
        duplaId,
        monitorSemanaAId: monitor.id,
      },
    });
    alunoParaPlagioId = alunoPlagio.id;

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
        ordem: 1,
      },
    });
    listaId = lista.id;
  });

  afterAll(async () => {
    await prisma.feedback.deleteMany({ where: { listaId } });
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.lista.deleteMany({ where: { periodoId } });
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

    expect(feedback.semana).toBe(calcularSemana({ posicaoLista: 1 }));
    expect(feedback.usouIa).toBe(true);
    expect(feedback.plagiou).toBe(false);
    expect(feedback.usouProibicao).toBe(true);
    expect(feedback.sincronizadoPlanilha).toBe(false);

    const questoesIa = await prisma.feedbackQuestaoIA.findMany({
      where: { feedbackId: feedback.id },
    });
    expect(questoesIa.map((item) => item.numeroQuestao).sort()).toEqual([1, 3]);
  });

  it("recusa registrar feedback duplicado para o mesmo aluno e lista", async () => {
    await expect(
      criarFeedback(prisma, {
        alunoId,
        monitorId,
        listaId,
        qtdQuestoesPontuadas: 3,
      }),
    ).rejects.toThrow("Já existe feedback registrado para este aluno nesta lista");

    const registros = await prisma.feedback.findMany({ where: { alunoId, listaId } });
    expect(registros).toHaveLength(1);
  });

  it("registra o aluno envolvido em cada questão de plágio", async () => {
    const feedback = await criarFeedback(prisma, {
      alunoId: alunoParaPlagioId,
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
    expect(questoesPlagio.every((item) => item.alunoEnvolvidoId === alunoDeOutraDuplaId)).toBe(
      true,
    );
  });

  it("recusa quando o monitor não é o responsável pela semana deste aluno", async () => {
    await expect(
      criarFeedback(prisma, {
        alunoId: alunoDeOutraDuplaId,
        monitorId,
        listaId,
        qtdQuestoesPontuadas: 3,
      }),
    ).rejects.toThrow("responsabilidade de outro monitor");
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

  it("recusa quando o monitor não é o responsável pela semana desta lista", async () => {
    await expect(
      criarFeedback(prisma, {
        alunoId,
        monitorId: monitorSemanaBId,
        listaId,
        qtdQuestoesPontuadas: 3,
      }),
    ).rejects.toThrow("responsabilidade de outro monitor");
  });

  it("recusa lista pertencente a outro período", async () => {
    const outroPeriodo = await prisma.periodo.create({
      data: {
        nome: `Outro período feedback ${sufixo}`,
        dataInicio: dataReferenciaRodizio,
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio,
      },
    });
    const outraLista = await prisma.lista.create({
      data: { periodoId: outroPeriodo.id, nome: "Lista externa", qtdQuestoesTotal: 6, ordem: 1 },
    });
    await expect(
      criarFeedback(prisma, {
        alunoId,
        monitorId,
        listaId: outraLista.id,
        qtdQuestoesPontuadas: 3,
      }),
    ).rejects.toThrow("Aluno e lista devem pertencer ao mesmo período");
    await prisma.lista.delete({ where: { id: outraLista.id } });
    await prisma.periodo.delete({ where: { id: outroPeriodo.id } });
  });

  it("recusa registro feito por monitor inativo", async () => {
    await prisma.monitor.update({ where: { id: monitorId }, data: { status: "INATIVO" } });
    await expect(
      criarFeedback(prisma, {
        alunoId: alunoDeOutraDuplaId,
        monitorId,
        listaId,
        qtdQuestoesPontuadas: 3,
      }),
    ).rejects.toThrow("Monitor inativo não pode registrar feedback");
    await prisma.monitor.update({ where: { id: monitorId }, data: { status: "ATIVO" } });
  });
});

describe("criarFeedback - dupla com um único monitor (chefe sem parceiro)", () => {
  const sufixo = Date.now();
  const dataReferenciaRodizio = new Date("2026-08-03T00:00:00Z");

  let periodoId: string;
  let grupoId: string;
  let listaSemanaAId: string;
  let listaSemanaBId: string;
  let monitorId: string;
  let alunoId: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste monitor solo ${sufixo}`,
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
      data: { nome: "Chefe teste solo", whatsappNumero: `+55${sufixo}0`, isChefe: true, periodoId },
    });

    const grupo = await prisma.grupoRevisao.create({
      data: { periodoId, chefeId: chefe.id, nome: "Grupo teste solo" },
    });
    grupoId = grupo.id;

    const dupla = await prisma.dupla.create({
      data: { grupoRevisaoId: grupo.id, label: "Dupla solo" },
    });

    // Dupla com um único monitor — sem "o outro monitor" para cobrir a semana B.
    const monitor = await prisma.monitor.create({
      data: { nome: "Monitor solo", whatsappNumero: `+55${sufixo}1`, periodoId, duplaId: dupla.id },
    });
    monitorId = monitor.id;

    const aluno = await prisma.aluno.create({
      data: {
        nome: "Aluno do monitor solo",
        matricula: `TESTE-SOLO-${sufixo}`,
        turmaId: turma.id,
        duplaId: dupla.id,
        monitorSemanaAId: monitor.id,
      },
    });
    alunoId = aluno.id;

    const listaSemanaA = await prisma.lista.create({
      data: {
        periodoId,
        nome: "Lista 1 (semana A)",
        qtdQuestoesTotal: 6,
        ordem: 1,
      },
    });
    listaSemanaAId = listaSemanaA.id;
    const listaSemanaB = await prisma.lista.create({
      data: {
        periodoId,
        nome: "Lista 2 (semana B)",
        qtdQuestoesTotal: 6,
        ordem: 2,
      },
    });
    listaSemanaBId = listaSemanaB.id;
  });

  afterAll(async () => {
    await prisma.feedback.deleteMany({
      where: { listaId: { in: [listaSemanaAId, listaSemanaBId] } },
    });
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.lista.deleteMany({ where: { periodoId } });
    await prisma.dupla.deleteMany({ where: { grupoRevisaoId: grupoId } });
    await prisma.grupoRevisao.deleteMany({ where: { periodoId } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("permite que o único monitor da dupla registre feedback tanto na semana A quanto na semana B", async () => {
    const feedbackA = await criarFeedback(prisma, {
      alunoId,
      monitorId,
      listaId: listaSemanaAId,
      qtdQuestoesPontuadas: 5,
    });
    expect(feedbackA.semana).toBe("A");

    const feedbackB = await criarFeedback(prisma, {
      alunoId,
      monitorId,
      listaId: listaSemanaBId,
      qtdQuestoesPontuadas: 4,
    });
    expect(feedbackB.semana).toBe("B");
  });
});
