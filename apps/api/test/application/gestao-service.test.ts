import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import {
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
