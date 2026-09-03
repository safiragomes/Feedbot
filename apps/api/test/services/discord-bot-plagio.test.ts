import { describe, expect, it, vi } from "vitest";
import type { StringSelectMenuInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

type ConversaTeste = {
  monitorId: string;
  monitorNome: string;
  periodoId: string;
  etapa: string;
  ia: number[];
  plagio: number[];
  mesmaPessoaPlagio: boolean;
  indicePlagioAtual: number;
  envolvidos: Record<number, string>;
  turmaEnvolvidoId?: string;
  proibicao: number[];
  paginaAluno: number;
  paginaEnvolvido: number;
  atualizadoEm: number;
};

function bot(prisma: PrismaClient = {} as PrismaClient) {
  const instancia = new DiscordBot(prisma);
  return instancia as unknown as {
    conversas: Map<string, ConversaTeste>;
    tratarSelect(interacao: StringSelectMenuInteraction): Promise<unknown>;
  };
}

function interacaoSelect(valores: string[]) {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const interaction: {
    user: { id: string };
    values: string[];
    deferred: boolean;
    replied: boolean;
    deferUpdate: () => Promise<void>;
    editReply: typeof editReply;
    update: typeof update;
  } = {
    user: { id: "discord-1" },
    values: valores,
    deferred: false,
    replied: false,
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply,
    update,
  };
  return { interaction: interaction as unknown as StringSelectMenuInteraction, editReply, update };
}

function conversaBase(): ConversaTeste {
  return {
    monitorId: "monitor-1",
    monitorNome: "Monitor Um",
    periodoId: "periodo-1",
    etapa: "envolvido",
    ia: [],
    plagio: [1, 3, 5],
    mesmaPessoaPlagio: true,
    indicePlagioAtual: 0,
    envolvidos: {},
    turmaEnvolvidoId: "turma-1",
    proibicao: [],
    paginaAluno: 0,
    paginaEnvolvido: 0,
    atualizadoEm: Date.now(),
  };
}

describe("plágio da mesma pessoa em várias questões", () => {
  it("aplica o mesmo aluno envolvido a todas as questões marcadas e pula direto pra proibição", async () => {
    const prisma = {
      aluno: { findMany: vi.fn().mockResolvedValue([{ id: "aluno-envolvido-1" }]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set("discord-1", conversaBase());
    const { interaction, editReply } = interacaoSelect(["aluno-envolvido-1"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.envolvidos).toEqual({ 1: "aluno-envolvido-1", 3: "aluno-envolvido-1", 5: "aluno-envolvido-1" });
    expect(conversa.etapa).toBe("proibicao");
    // A revalidação do aluno escolhido contra a turma (segurança: nunca confiar cegamente
    // no valor devolvido por um select) exige consulta ao banco, então esse passo virou
    // deferUpdate()+editReply() em vez do update() direto de antes.
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("proibição") }),
    );
  });

  it("rejeita um aluno envolvido que não pertence à turma escolhida", async () => {
    const prisma = {
      aluno: { findMany: vi.fn().mockResolvedValue([{ id: "aluno-legitimo" }]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set("discord-1", conversaBase());
    const { interaction, editReply } = interacaoSelect(["aluno-forjado"]);

    await instancia.tratarSelect(interaction);

    expect(instancia.conversas.has("discord-1")).toBe(false);
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Opção inválida") }),
    );
  });

  it("quando não é a mesma pessoa, pergunta o envolvido de cada questão separadamente", async () => {
    const prisma = {
      turma: { findMany: vi.fn().mockResolvedValue([{ id: "turma-1", nome: "CC/IA" }]) },
      aluno: { findMany: vi.fn().mockResolvedValue([{ id: "aluno-questao-1" }]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set("discord-1", { ...conversaBase(), mesmaPessoaPlagio: false });
    const { interaction } = interacaoSelect(["aluno-questao-1"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.envolvidos).toEqual({ 1: "aluno-questao-1" });
    expect(conversa.indicePlagioAtual).toBe(1);
    expect(conversa.etapa).toBe("cursoEnvolvido");
  });
});
