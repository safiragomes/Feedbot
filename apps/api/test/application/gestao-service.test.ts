import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { prisma } from "../../src/db/client.js";
import { criarFeedback } from "../../src/services/feedback.js";
import {
  atualizarMonitor,
  excluirDupla,
  excluirGrupoRevisao,
  excluirMonitor,
  excluirPeriodo,
  GestaoErro,
} from "../../src/application/gestao/gestao-service.js";

function prismaSemFeedback() {
  const transacao = vi.fn().mockResolvedValue([]);
  return {
    feedback: { count: vi.fn().mockResolvedValue(0) },
    aluno: { updateMany: vi.fn() },
    grupoRevisao: { delete: vi.fn() },
    dupla: { delete: vi.fn() },
    monitor: { delete: vi.fn().mockResolvedValue(undefined) },
    $transaction: transacao,
  } as unknown as PrismaClient;
}

describe("exclusões seguras da gestão", () => {
  it("bloqueia só o monitor quando há feedback vinculado (feedback é dele, não da dupla/grupo)", async () => {
    const prisma = {
      feedback: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaClient;

    await expect(excluirMonitor(prisma, "monitor")).rejects.toBeInstanceOf(GestaoErro);
  });

  it("permite excluir grupo/dupla mesmo com feedback vinculado — a referência só some (SetNull)", async () => {
    const grupo = prismaSemFeedback();
    const dupla = prismaSemFeedback();

    await expect(excluirGrupoRevisao(grupo, "grupo")).resolves.toBeUndefined();
    await expect(excluirDupla(dupla, "dupla")).resolves.toBeUndefined();
    expect(grupo.$transaction).toHaveBeenCalledOnce();
    expect(dupla.$transaction).toHaveBeenCalledOnce();
    expect(grupo.feedback.count).not.toHaveBeenCalled();
    expect(dupla.feedback.count).not.toHaveBeenCalled();
  });

  it("mantém a exclusão de monitor sem histórico", async () => {
    const monitor = prismaSemFeedback();

    await expect(excluirMonitor(monitor, "monitor")).resolves.toBeUndefined();
    expect(monitor.monitor.delete).toHaveBeenCalledWith({ where: { id: "monitor" } });
  });
});

describe("exclusão de período", () => {
  it("bloqueia quando há alunos, monitores ou grupos vinculados", async () => {
    const comAluno = {
      aluno: { count: vi.fn().mockResolvedValue(1) },
      monitor: { count: vi.fn().mockResolvedValue(0) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    const comMonitor = {
      aluno: { count: vi.fn().mockResolvedValue(0) },
      monitor: { count: vi.fn().mockResolvedValue(1) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    const comGrupo = {
      aluno: { count: vi.fn().mockResolvedValue(0) },
      monitor: { count: vi.fn().mockResolvedValue(0) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaClient;

    await expect(excluirPeriodo(comAluno, "periodo")).rejects.toBeInstanceOf(GestaoErro);
    await expect(excluirPeriodo(comMonitor, "periodo")).rejects.toBeInstanceOf(GestaoErro);
    await expect(excluirPeriodo(comGrupo, "periodo")).rejects.toBeInstanceOf(GestaoErro);
  });

  it("permite excluir um período só com o scaffolding automático (turmas/listas)", async () => {
    const prisma = {
      aluno: { count: vi.fn().mockResolvedValue(0) },
      monitor: { count: vi.fn().mockResolvedValue(0) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(0) },
      periodo: { delete: vi.fn().mockResolvedValue(undefined) },
    } as unknown as PrismaClient;

    await expect(excluirPeriodo(prisma, "periodo")).resolves.toBeUndefined();
    expect(prisma.periodo.delete).toHaveBeenCalledWith({ where: { id: "periodo" } });
  });
});

// Desvincular um monitor (tirar da dupla, desativar) não pode fazer um feedback já
// registrado perder a autoria — Feedback.monitorId precisa continuar apontando pro
// mesmo monitor que de fato registrou, mesmo depois dele ser desvinculado/desativado.
describe("atualizarMonitor preserva a autoria de feedback já registrado", () => {
  const sufixo = Date.now();
  const dataReferenciaRodizio = new Date("2026-08-03T00:00:00Z");

  let periodoId: string;
  let grupoId: string;
  let monitorId: string;
  let feedbackId: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste desvincular monitor ${sufixo}`,
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

    const monitor = await prisma.monitor.create({
      data: { nome: "Monitor a desvincular", whatsappNumero: `+55${sufixo}1`, periodoId, duplaId: dupla.id },
    });
    monitorId = monitor.id;

    const aluno = await prisma.aluno.create({
      data: {
        nome: "Aluno teste",
        matricula: `TESTE-${sufixo}-1`,
        turmaId: turma.id,
        duplaId: dupla.id,
        monitorSemanaAId: monitor.id,
      },
    });

    const lista = await prisma.lista.create({
      data: { periodoId, nome: "Lista teste", qtdQuestoesTotal: 6, ordem: 1 },
    });

    const feedback = await criarFeedback(prisma, {
      alunoId: aluno.id,
      monitorId: monitor.id,
      listaId: lista.id,
      qtdQuestoesPontuadas: 5,
    });
    feedbackId = feedback.id;
  });

  afterAll(async () => {
    await prisma.feedback.deleteMany({ where: { monitorId } });
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.lista.deleteMany({ where: { periodoId } });
    await prisma.dupla.deleteMany({ where: { grupoRevisaoId: grupoId } });
    await prisma.grupoRevisao.deleteMany({ where: { periodoId } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("tirar o monitor da dupla e desativá-lo não muda o monitorId do feedback já salvo", async () => {
    await atualizarMonitor(prisma, monitorId, { duplaId: null });
    await atualizarMonitor(prisma, monitorId, { status: "INATIVO" });

    const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId } });
    expect(feedback).not.toBeNull();
    expect(feedback?.monitorId).toBe(monitorId);
    expect(feedback?.qtdQuestoesPontuadas).toBe(5);

    const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor?.duplaId).toBeNull();
    expect(monitor?.status).toBe("INATIVO");
  });
});
