import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { prisma } from "../../src/db/client.js";
import { criarFeedback } from "../../src/services/feedback.js";
import {
  atualizarMonitor,
  atualizarPrazosDoGrupo,
  excluirDupla,
  excluirGrupoRevisao,
  excluirMonitor,
  excluirPeriodo,
  GestaoErro,
  verificarDiscordDisponivel,
} from "../../src/application/gestao/gestao-service.js";

describe("atualizarMonitor bloqueia número de WhatsApp já usado por outro monitor", () => {
  it("recusa a troca quando o número já pertence a outro monitor", async () => {
    const monitorAtual = {
      id: "m1",
      whatsappNumero: "+5581900000000",
      isChefe: false,
      duplaId: null,
      periodoId: "p1",
    };
    const outroMonitor = { id: "m2", nome: "Outro Monitor", whatsappNumero: "+5581999999999" };
    const prisma = {
      monitor: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(monitorAtual)
          .mockResolvedValueOnce(outroMonitor),
      },
    } as unknown as PrismaClient;

    await expect(
      atualizarMonitor(prisma, "m1", { whatsappNumero: "+5581999999999" }),
    ).rejects.toThrow("Esse número de WhatsApp já está cadastrado para Outro Monitor");
  });

  it("permite manter o próprio número ou trocar pra um número livre", async () => {
    const monitorAtual = {
      id: "m1",
      whatsappNumero: "+5581900000000",
      isChefe: false,
      duplaId: null,
      periodoId: "p1",
    };
    const transacao = vi.fn().mockImplementation(async (fn) =>
      fn({
        aluno: { updateMany: vi.fn() },
        monitor: { update: vi.fn().mockResolvedValue({ ...monitorAtual, isChefe: false }) },
        sessaoChefe: { deleteMany: vi.fn() },
      }),
    );
    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValueOnce(monitorAtual).mockResolvedValueOnce(null),
      },
      $transaction: transacao,
    } as unknown as PrismaClient;

    await expect(
      atualizarMonitor(prisma, "m1", { whatsappNumero: "+5581911111111" }),
    ).resolves.toBeDefined();
  });
});

describe("atualizarMonitor bloqueia conta do Discord já vinculada a outro monitor", () => {
  it("recusa o vínculo quando o discordUserId já pertence a outro monitor", async () => {
    const monitorAtual = {
      id: "m1",
      discordUserId: null,
      isChefe: false,
      duplaId: null,
      periodoId: "p1",
    };
    const outroMonitor = { id: "m2", nome: "Outro Monitor", discordUserId: "discord-2" };
    const prisma = {
      monitor: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(monitorAtual)
          .mockResolvedValueOnce(outroMonitor),
      },
    } as unknown as PrismaClient;

    await expect(
      atualizarMonitor(prisma, "m1", { discordUserId: "discord-2" }),
    ).rejects.toThrow("Essa conta do Discord já está vinculada a Outro Monitor");
  });

  it("verificarDiscordDisponivel não bloqueia o próprio monitor mantendo o mesmo id", async () => {
    const prisma = {
      monitor: { findUnique: vi.fn().mockResolvedValue({ id: "m1", nome: "Eu mesmo" }) },
    } as unknown as PrismaClient;

    await expect(
      verificarDiscordDisponivel(prisma, "discord-1", "m1"),
    ).resolves.toBeUndefined();
  });
});

function prismaSemFeedback() {
  const transacao = vi.fn().mockResolvedValue([]);
  return {
    feedback: { count: vi.fn().mockResolvedValue(0) },
    aluno: { updateMany: vi.fn() },
    grupoRevisao: { delete: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    dupla: { delete: vi.fn() },
    monitor: { delete: vi.fn().mockResolvedValue(undefined) },
    $transaction: transacao,
  } as unknown as PrismaClient;
}

describe("exclusões seguras da gestão", () => {
  it("exclui o monitor sem checar feedback vinculado (cascade cuida do histórico no schema)", async () => {
    const monitor = prismaSemFeedback();

    await expect(excluirMonitor(monitor, "monitor")).resolves.toBeUndefined();
    expect(monitor.monitor.delete).toHaveBeenCalledWith({ where: { id: "monitor" } });
    expect(monitor.feedback.count).not.toHaveBeenCalled();
  });

  it("bloqueia exclusão de monitor que ainda é chefe de um grupo — o FK de GrupoRevisao.chefeId é obrigatório", async () => {
    const monitor = {
      grupoRevisao: { count: vi.fn().mockResolvedValue(1) },
      monitor: { delete: vi.fn() },
    } as unknown as PrismaClient;

    await expect(excluirMonitor(monitor, "monitor")).rejects.toBeInstanceOf(GestaoErro);
    expect(monitor.monitor.delete).not.toHaveBeenCalled();
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
});

describe("exclusão de período", () => {
  it("bloqueia quando há alunos, monitores, grupos de revisão ou grupos de prazo vinculados", async () => {
    const comAluno = {
      aluno: { count: vi.fn().mockResolvedValue(1) },
      monitor: { count: vi.fn().mockResolvedValue(0) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(0) },
      grupoPrazo: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    const comMonitor = {
      aluno: { count: vi.fn().mockResolvedValue(0) },
      monitor: { count: vi.fn().mockResolvedValue(1) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(0) },
      grupoPrazo: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    const comGrupo = {
      aluno: { count: vi.fn().mockResolvedValue(0) },
      monitor: { count: vi.fn().mockResolvedValue(0) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(1) },
      grupoPrazo: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    const comGrupoPrazo = {
      aluno: { count: vi.fn().mockResolvedValue(0) },
      monitor: { count: vi.fn().mockResolvedValue(0) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(0) },
      grupoPrazo: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaClient;

    await expect(excluirPeriodo(comAluno, "periodo")).rejects.toBeInstanceOf(GestaoErro);
    await expect(excluirPeriodo(comMonitor, "periodo")).rejects.toBeInstanceOf(GestaoErro);
    await expect(excluirPeriodo(comGrupo, "periodo")).rejects.toBeInstanceOf(GestaoErro);
    await expect(excluirPeriodo(comGrupoPrazo, "periodo")).rejects.toBeInstanceOf(GestaoErro);
  });

  it("permite excluir um período só com o scaffolding automático (turmas/listas)", async () => {
    const prisma = {
      aluno: { count: vi.fn().mockResolvedValue(0) },
      monitor: { count: vi.fn().mockResolvedValue(0) },
      grupoRevisao: { count: vi.fn().mockResolvedValue(0) },
      grupoPrazo: { count: vi.fn().mockResolvedValue(0) },
      periodo: { delete: vi.fn().mockResolvedValue(undefined) },
    } as unknown as PrismaClient;

    await expect(excluirPeriodo(prisma, "periodo")).resolves.toBeUndefined();
    expect(prisma.periodo.delete).toHaveBeenCalledWith({ where: { id: "periodo" } });
  });
});

describe("atualizarPrazosDoGrupo", () => {
  it("recusa quando o grupo de prazo não existe", async () => {
    const prisma = {
      grupoPrazo: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(
      atualizarPrazosDoGrupo(prisma, "grupo-inexistente", [
        { listaId: "lista-1", prazoEntregaFeedback: new Date("2026-09-20T23:59:00") },
      ]),
    ).rejects.toBeInstanceOf(GestaoErro);
  });

  it("recusa quando alguma lista pertence a um período diferente do grupo", async () => {
    const prisma = {
      grupoPrazo: {
        findUnique: vi.fn().mockResolvedValue({ id: "grupo-1", periodoId: "periodo-1" }),
      },
      lista: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "lista-1", periodoId: "periodo-2" }]),
      },
    } as unknown as PrismaClient;

    await expect(
      atualizarPrazosDoGrupo(prisma, "grupo-1", [
        { listaId: "lista-1", prazoEntregaFeedback: new Date("2026-09-20T23:59:00") },
      ]),
    ).rejects.toBeInstanceOf(GestaoErro);
  });

  describe("configuração real do prazo do grupo por lista", () => {
    const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const dataReferenciaRodizio = new Date("2026-08-03T00:00:00Z");

    let periodoId: string;
    let grupoPrazoId: string;
    let listaId: string;

    beforeAll(async () => {
      const periodo = await prisma.periodo.create({
        data: {
          nome: `Teste prazo do grupo ${sufixo}`,
          dataInicio: dataReferenciaRodizio,
          dataFim: new Date("2026-12-01T00:00:00Z"),
          dataReferenciaRodizio,
        },
      });
      periodoId = periodo.id;

      const lista = await prisma.lista.create({
        data: { periodoId, nome: "Lista teste", qtdQuestoesTotal: 6, ordem: 1 },
      });
      listaId = lista.id;

      const grupoPrazo = await prisma.grupoPrazo.create({
        data: { periodoId, nome: "Grupo teste" },
      });
      grupoPrazoId = grupoPrazo.id;
    });

    afterAll(async () => {
      await prisma.prazoGrupoLista.deleteMany({ where: { grupoPrazoId } });
      await prisma.grupoPrazo.deleteMany({ where: { periodoId } });
      await prisma.lista.deleteMany({ where: { periodoId } });
      await prisma.periodo.delete({ where: { id: periodoId } });
    });

    it("configura o prazo inicial e, ao repetir, atualiza em vez de duplicar", async () => {
      const primeiraData = new Date("2026-09-20T23:59:00Z");
      await atualizarPrazosDoGrupo(prisma, grupoPrazoId, [
        { listaId, prazoEntregaFeedback: primeiraData },
      ]);

      const apósPrimeira = await prisma.prazoGrupoLista.findMany({ where: { grupoPrazoId } });
      expect(apósPrimeira).toHaveLength(1);
      expect(apósPrimeira[0]?.prazoEntregaFeedback).toEqual(primeiraData);

      const segundaData = new Date("2026-09-25T23:59:00Z");
      await atualizarPrazosDoGrupo(prisma, grupoPrazoId, [
        { listaId, prazoEntregaFeedback: segundaData },
      ]);

      const apósSegunda = await prisma.prazoGrupoLista.findMany({ where: { grupoPrazoId } });
      expect(apósSegunda).toHaveLength(1);
      expect(apósSegunda[0]?.prazoEntregaFeedback).toEqual(segundaData);
    });
  });
});

// Desvincular um monitor (tirar da dupla, desativar) não pode fazer um feedback já
// registrado perder a autoria — Feedback.monitorId precisa continuar apontando pro
// mesmo monitor que de fato registrou, mesmo depois dele ser desvinculado/desativado.
describe("atualizarMonitor preserva a autoria de feedback já registrado", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
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
      data: {
        nome: "Monitor a desvincular",
        whatsappNumero: `+55${sufixo}1`,
        periodoId,
        duplaId: dupla.id,
      },
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
