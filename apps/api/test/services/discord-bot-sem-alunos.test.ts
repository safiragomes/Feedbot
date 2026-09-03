import { describe, expect, it, vi } from "vitest";
import type { StringSelectMenuInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

type ConversaTeste = {
  monitorId: string;
  periodoId: string;
  etapa: string;
  ia: number[];
  plagio: number[];
  indicePlagioAtual: number;
  envolvidos: Record<number, string>;
  proibicao: number[];
  paginaAluno: number;
  paginaEnvolvido: number;
  atualizadoEm: number;
};

describe("lista sem alunos elegíveis no momento da escolha", () => {
  it("avisa e encerra a conversa em vez de mostrar um select sem opções", async () => {
    const editReply = vi.fn().mockResolvedValue(undefined);
    const deferUpdate = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      user: { id: "discord-1" },
      values: ["lista-1"],
      deferUpdate,
      editReply,
    } as unknown as StringSelectMenuInteraction;

    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValue({ id: "monitor-1", duplaId: "dupla-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "monitor-1" }]),
      },
      // Simula os alunos mudando entre o início da conversa e a resposta: quando
      // alunosElegiveis é chamado (dentro do handler do select), já não há ninguém.
      aluno: { findMany: vi.fn().mockResolvedValue([]) },
      lista: { findMany: vi.fn().mockResolvedValue([{ id: "lista-1", ordem: 1, semanaOverride: null }]) },
    } as unknown as PrismaClient;

    const bot = new DiscordBot(prisma, undefined, undefined, undefined);
    const botInterno = bot as unknown as {
      conversas: Map<string, ConversaTeste>;
      tratarSelect(interacao: StringSelectMenuInteraction): Promise<unknown>;
    };
    botInterno.conversas.set("discord-1", {
      monitorId: "monitor-1",
      periodoId: "periodo-1",
      etapa: "lista",
      ia: [],
      plagio: [],
      indicePlagioAtual: 0,
      envolvidos: {},
      proibicao: [],
      paginaAluno: 0,
      paginaEnvolvido: 0,
      atualizadoEm: Date.now(),
    });

    await botInterno.tratarSelect(interaction);

    expect(botInterno.conversas.has("discord-1")).toBe(false);
    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Não há alunos") }),
    );
  });
});
