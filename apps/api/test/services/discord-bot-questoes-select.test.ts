import { describe, expect, it, vi } from "vitest";
import type { StringSelectMenuInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

// aplicarQuestoesEscolhidas(), chamada a partir do select de questões (caso comum:
// lista com <=25 questões — o fallback por modal já tem cobertura própria em
// discord-bot-modal.test.ts), não tinha nenhum teste direto: os testes de plágio
// existentes injetavam a conversa já na etapa seguinte, pulando esta função.

type ConversaTeste = {
  monitorId: string;
  etapa: string;
  totalQuestoes?: number;
  ia: number[];
  plagio: number[];
  proibicao: number[];
  mesmaPessoaPlagio: boolean;
  indicePlagioAtual: number;
  envolvidos: Record<number, string>;
};

function conversaBase(overrides: Partial<ConversaTeste> = {}): ConversaTeste {
  return {
    monitorId: "monitor-1",
    etapa: "questoesIa",
    totalQuestoes: 30,
    ia: [],
    plagio: [],
    proibicao: [],
    mesmaPessoaPlagio: true,
    indicePlagioAtual: 5,
    envolvidos: {},
    ...overrides,
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

function bot(prisma: PrismaClient = {} as PrismaClient) {
  const instancia = new DiscordBot(prisma, "token");
  return instancia as unknown as {
    conversas: Map<string, ConversaTeste>;
    tratarSelect(i: StringSelectMenuInteraction): Promise<unknown>;
  };
}

describe("select de questões (etapas questoesIa / questoesPlagio / questoesProibicao)", () => {
  it("questoesIa: grava as questões e segue pra pergunta de plágio", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "questoesIa" }));
    const { interaction } = interacaoSelect(["2", "7"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.ia).toEqual([2, 7]);
    expect(conversa.etapa).toBe("plagio");
  });

  it("questoesPlagio com uma única questão marcada: pula a pergunta 'mesma pessoa' e vai direto pro curso", async () => {
    const prisma = {
      turma: { findMany: vi.fn().mockResolvedValue([{ id: "turma-1", nome: "CC/IA" }]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set("discord-1", conversaBase({ etapa: "questoesPlagio" }));
    const { interaction } = interacaoSelect(["4"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.plagio).toEqual([4]);
    // reset garantido pela função, mesmo que a conversa trouxesse resíduo de um plágio anterior
    expect(conversa.mesmaPessoaPlagio).toBe(false);
    expect(conversa.indicePlagioAtual).toBe(0);
    expect(conversa.envolvidos).toEqual({});
    expect(conversa.etapa).toBe("cursoEnvolvido");
  });

  it("questoesPlagio com mais de uma questão: pergunta se foi a mesma pessoa antes de pedir o curso", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "questoesPlagio" }));
    const { interaction, update } = interacaoSelect(["1", "3", "5"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.plagio).toEqual([1, 3, 5]);
    expect(conversa.etapa).toBe("plagioMesmaPessoa");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("mesma pessoa") }),
    );
  });

  it("questoesProibicao: grava as questões e mostra o resumo final", async () => {
    const prisma = {
      lista: { findUnique: vi.fn().mockResolvedValue({ id: "lista-1", nome: "Lista 1" }) },
      aluno: {
        findUnique: vi.fn().mockResolvedValue({ id: "aluno-1", nome: "Aluno", turma: { nome: "CC/IA" } }),
      },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set(
      "discord-1",
      conversaBase({ etapa: "questoesProibicao" }) as unknown as ConversaTeste & {
        alunoId: string;
        listaId: string;
      },
    );
    Object.assign(instancia.conversas.get("discord-1")!, { alunoId: "aluno-1", listaId: "lista-1" });
    const { interaction } = interacaoSelect(["9"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.proibicao).toEqual([9]);
    expect(conversa.etapa).toBe("confirmar");
  });
});
