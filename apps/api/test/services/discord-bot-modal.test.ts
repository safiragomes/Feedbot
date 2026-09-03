import { describe, expect, it, vi } from "vitest";
import type { ModalSubmitInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

// tratarModal() é o fallback de texto livre usado quando uma lista tem mais de 25
// questões (não cabe num select) — validação de pontuação/questões digitadas
// manualmente. Nenhum ramo tinha teste antes desta auditoria.

type ConversaTeste = {
  monitorId: string;
  etapa: string;
  totalQuestoes?: number;
  pontuacao?: number;
  faltou: boolean;
  ia: number[];
  plagio: number[];
  proibicao: number[];
  envolvidos: Record<number, string>;
};

function conversaBase(overrides: Partial<ConversaTeste> = {}): ConversaTeste {
  return {
    monitorId: "monitor-1",
    etapa: "pontuacao",
    totalQuestoes: 30,
    faltou: false,
    ia: [],
    plagio: [],
    proibicao: [],
    envolvidos: {},
    ...overrides,
  };
}

function interacaoModal(customId: string, valor: string) {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  const interaction: {
    user: { id: string };
    customId: string;
    fields: { getTextInputValue: (id: string) => string };
    deferred: boolean;
    replied: boolean;
    deferUpdate: () => Promise<void>;
    editReply: typeof editReply;
    followUp: typeof followUp;
    reply: typeof reply;
  } = {
    user: { id: "discord-1" },
    customId,
    fields: { getTextInputValue: () => valor },
    deferred: false,
    replied: false,
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply,
    followUp,
    reply,
  };
  return { interaction: interaction as unknown as ModalSubmitInteraction, editReply, followUp, reply };
}

function bot(prisma: PrismaClient = {} as PrismaClient) {
  const instancia = new DiscordBot(prisma, "token");
  return instancia as unknown as {
    conversas: Map<string, ConversaTeste>;
    tratarModal(i: ModalSubmitInteraction): Promise<unknown>;
  };
}

describe("tratarModal — sessão", () => {
  it("avisa sessão expirada quando não há conversa em andamento", async () => {
    const instancia = bot();
    const { interaction, reply } = interacaoModal("fb:modal:pontuacao", "5");

    await instancia.tratarModal(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Sessão expirada") }),
    );
  });
});

describe("tratarModal — pontuação digitada manualmente", () => {
  it("aceita F e pula direto pra confirmação, igual ao select", async () => {
    const prisma = {
      lista: { findUnique: vi.fn().mockResolvedValue({ id: "lista-1", nome: "Lista 1" }) },
      aluno: {
        findUnique: vi.fn().mockResolvedValue({ id: "aluno-1", nome: "Aluno", turma: { nome: "CC/IA" } }),
      },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set(
      "discord-1",
      conversaBase({ etapa: "pontuacao" }) as unknown as ConversaTeste & { alunoId: string; listaId: string },
    );
    (instancia.conversas.get("discord-1") as unknown as { alunoId: string; listaId: string }).alunoId = "aluno-1";
    (instancia.conversas.get("discord-1") as unknown as { alunoId: string; listaId: string }).listaId = "lista-1";
    const { interaction } = interacaoModal("fb:modal:pontuacao", "f");

    await instancia.tratarModal(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.faltou).toBe(true);
    expect(conversa.pontuacao).toBe(0);
    expect(conversa.etapa).toBe("confirmar");
  });

  it("rejeita um número fora do intervalo 0..total e pede de novo sem avançar a etapa", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "pontuacao", totalQuestoes: 10 }));
    const { interaction, followUp } = interacaoModal("fb:modal:pontuacao", "99");

    await instancia.tratarModal(interaction);

    expect(followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("entre 0 e 10") }),
    );
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("pontuacao");
  });

  it("rejeita um valor não numérico e não-F", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "pontuacao", totalQuestoes: 10 }));
    const { interaction, followUp } = interacaoModal("fb:modal:pontuacao", "abc");

    await instancia.tratarModal(interaction);

    expect(followUp).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("F") }));
  });

  it("aceita um número válido e segue pra etapa de IA", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "pontuacao", totalQuestoes: 30 }));
    const { interaction } = interacaoModal("fb:modal:pontuacao", "12");

    await instancia.tratarModal(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.faltou).toBe(false);
    expect(conversa.pontuacao).toBe(12);
    expect(conversa.etapa).toBe("ia");
  });
});

describe("tratarModal — questões digitadas manualmente (IA/plágio/proibição)", () => {
  it("rejeita números fora do intervalo válido de questões", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "questoesIa", totalQuestoes: 30 }));
    const { interaction, followUp } = interacaoModal("fb:modal:questoesIa", "1, 99");

    await instancia.tratarModal(interaction);

    expect(followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("entre 1 e 30") }),
    );
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("questoesIa");
  });

  it("aceita a lista de questões válida e avança o fluxo (IA -> plágio)", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "questoesIa", totalQuestoes: 30 }));
    const { interaction } = interacaoModal("fb:modal:questoesIa", "1, 15, 30");

    await instancia.tratarModal(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.ia).toEqual([1, 15, 30]);
    expect(conversa.etapa).toBe("plagio");
  });
});
