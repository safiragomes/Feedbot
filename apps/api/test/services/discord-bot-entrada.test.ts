import { describe, expect, it, vi } from "vitest";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

// iniciarFluxo() é o ponto de entrada de todo o fluxo (/feedback e o botão do painel) —
// concentra as três checagens de autorização que existiam também no bot de WhatsApp
// (monitor vinculado e ativo, canal certo) mais a checagem nova (canal configurado),
// mas nenhum teste chegava a exercitar essa função antes desta auditoria: os testes
// existentes sempre começavam com uma `conversa` já inserida manualmente no Map.

type ConversaTeste = {
  monitorId: string;
  monitorNome: string;
  periodoId: string;
  etapa: string;
};

function bot(prisma: PrismaClient) {
  const instancia = new DiscordBot(prisma, "token");
  return instancia as unknown as {
    conversas: Map<string, ConversaTeste>;
    iniciarFluxo(
      interacao: ChatInputCommandInteraction | ButtonInteraction,
    ): Promise<unknown>;
  };
}

function interacaoEntrada(channelId = "canal-1") {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    user: { id: "discord-1" },
    channelId,
    deferReply,
    editReply,
  };
  return {
    interaction: interaction as unknown as ChatInputCommandInteraction,
    editReply,
    deferReply,
  };
}

const monitorAtivo = {
  id: "monitor-1",
  nome: "Monitor Um",
  status: "ATIVO",
  periodoId: "periodo-1",
  duplaId: "dupla-1",
};

describe("iniciarFluxo — checagens de entrada do /feedback", () => {
  it("recusa quando a conta do Discord não está vinculada a nenhum monitor", async () => {
    const prisma = {
      monitor: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    const { interaction, editReply, deferReply } = interacaoEntrada();

    await instancia.iniciarFluxo(interaction);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReply).toHaveBeenCalledWith(expect.stringContaining("não está vinculada"));
    expect(instancia.conversas.has("discord-1")).toBe(false);
  });

  it("recusa quando o monitor vinculado está inativo", async () => {
    const prisma = {
      monitor: { findUnique: vi.fn().mockResolvedValue({ ...monitorAtivo, status: "INATIVO" }) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    const { interaction, editReply } = interacaoEntrada();

    await instancia.iniciarFluxo(interaction);

    expect(editReply).toHaveBeenCalledWith(expect.stringContaining("não está vinculada"));
    expect(instancia.conversas.has("discord-1")).toBe(false);
  });

  it("recusa quando o período do monitor ainda não tem canal de registro configurado", async () => {
    const prisma = {
      monitor: { findUnique: vi.fn().mockResolvedValue(monitorAtivo) },
      periodo: { findUnique: vi.fn().mockResolvedValue({ id: "periodo-1", discordAvisosCanalId: null }) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    const { interaction, editReply } = interacaoEntrada();

    await instancia.iniciarFluxo(interaction);

    expect(editReply).toHaveBeenCalledWith(expect.stringContaining("canal de registro"));
    expect(instancia.conversas.has("discord-1")).toBe(false);
  });

  it("recusa quando o comando é usado fora do canal vinculado ao período", async () => {
    const prisma = {
      monitor: { findUnique: vi.fn().mockResolvedValue(monitorAtivo) },
      periodo: {
        findUnique: vi.fn().mockResolvedValue({ id: "periodo-1", discordAvisosCanalId: "canal-1" }),
      },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    const { interaction, editReply } = interacaoEntrada("canal-errado");

    await instancia.iniciarFluxo(interaction);

    expect(editReply).toHaveBeenCalledWith(expect.stringContaining("<#canal-1>"));
    expect(instancia.conversas.has("discord-1")).toBe(false);
  });

  it("avisa e não inicia a conversa quando nenhuma lista está sob responsabilidade do monitor no momento", async () => {
    const prisma = {
      monitor: { findUnique: vi.fn().mockResolvedValue(monitorAtivo) },
      periodo: {
        findUnique: vi.fn().mockResolvedValue({ id: "periodo-1", discordAvisosCanalId: "canal-1" }),
      },
      aluno: { findMany: vi.fn().mockResolvedValue([]) },
      lista: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    // alunosDoMonitor busca o monitor de novo por id (duplaId) — sem dupla, não há
    // listas permitidas possíveis.
    (prisma.monitor.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...monitorAtivo,
      duplaId: null,
    });
    const instancia = bot(prisma);
    const { interaction, editReply } = interacaoEntrada();

    await instancia.iniciarFluxo(interaction);

    expect(editReply).toHaveBeenCalledWith(expect.stringContaining("nenhuma lista está sob sua responsabilidade"));
    expect(instancia.conversas.has("discord-1")).toBe(false);
  });

  it("inicia a conversa e mostra o select de listas quando tudo está em ordem", async () => {
    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValue(monitorAtivo),
        findMany: vi.fn().mockResolvedValue([{ id: "monitor-1" }]),
      },
      periodo: {
        findUnique: vi.fn().mockResolvedValue({ id: "periodo-1", discordAvisosCanalId: "canal-1" }),
      },
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno-1",
            duplaId: "dupla-1",
            monitorSemanaAId: "monitor-1",
            turma: { id: "turma-1", nome: "CC/IA", periodoId: "periodo-1" },
          },
        ]),
      },
      lista: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "lista-1", nome: "Lista 1", ordem: 1, semanaOverride: null }]),
      },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    const { interaction, editReply } = interacaoEntrada();

    await instancia.iniciarFluxo(interaction);

    const conversa = instancia.conversas.get("discord-1");
    expect(conversa).toMatchObject({ monitorId: "monitor-1", etapa: "lista" });
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Olá, Monitor Um"),
        components: expect.any(Array),
      }),
    );
  });
});
