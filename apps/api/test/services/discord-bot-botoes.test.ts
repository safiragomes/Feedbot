import { describe, expect, it, vi } from "vitest";
import type { ButtonInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

// tratarBotao() despacha paginação, sim/não e confirmar/cancelar — nenhum desses ramos
// tinha teste dedicado antes desta auditoria (só o caminho feliz completo, coberto
// separadamente em discord-bot-fluxo-completo.test.ts, passa pelo ramo sim/não).

type ConversaTeste = {
  monitorId: string;
  etapa: string;
  listaId?: string;
  alunoId?: string;
  turmaEnvolvidoId?: string;
  paginaAluno: number;
  paginaEnvolvido: number;
  ia: number[];
  plagio: number[];
  proibicao: number[];
  envolvidos: Record<number, string>;
};

function conversaBase(overrides: Partial<ConversaTeste> = {}): ConversaTeste {
  return {
    monitorId: "monitor-1",
    etapa: "aluno",
    listaId: "lista-1",
    paginaAluno: 0,
    paginaEnvolvido: 0,
    ia: [],
    plagio: [],
    proibicao: [],
    envolvidos: {},
    ...overrides,
  };
}

function interacaoBotao(customId: string) {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  const showModal = vi.fn().mockResolvedValue(undefined);
  const interaction: {
    user: { id: string };
    customId: string;
    deferred: boolean;
    replied: boolean;
    deferUpdate: () => Promise<void>;
    editReply: typeof editReply;
    update: typeof update;
    reply: typeof reply;
    showModal: typeof showModal;
  } = {
    user: { id: "discord-1" },
    customId,
    deferred: false,
    replied: false,
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply,
    update,
    reply,
    showModal,
  };
  return {
    interaction: interaction as unknown as ButtonInteraction,
    editReply,
    update,
    reply,
    showModal,
  };
}

function bot(prisma: PrismaClient = {} as PrismaClient) {
  const instancia = new DiscordBot(prisma, "token");
  return instancia as unknown as {
    conversas: Map<string, ConversaTeste>;
    tratarBotao(i: ButtonInteraction): Promise<unknown>;
  };
}

describe("tratarBotao — sessão e casos gerais", () => {
  it("avisa sessão expirada quando não há conversa em andamento pra esse usuário", async () => {
    const instancia = bot();
    const { interaction, reply } = interacaoBotao("fb:confirmar");

    await instancia.tratarBotao(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Sessão expirada"), ephemeral: true }),
    );
  });

  it("abre o modal de entrada manual quando o botão é fb:modal", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "pontuacao" }));
    const { interaction, showModal } = interacaoBotao("fb:modal");

    await instancia.tratarBotao(interaction);

    expect(showModal).toHaveBeenCalledOnce();
  });

  it("nenhum customId/etapa reconhecido: confirma o recebimento sem quebrar o fluxo", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "confirmar" }));
    const { interaction } = interacaoBotao("fb:algo-obsoleto");

    await instancia.tratarBotao(interaction);

    expect(interaction.deferred).toBe(true);
  });
});

describe("tratarBotao — paginação (Anterior/Próximo)", () => {
  it("avança a página de alunos e rebusca a lista", async () => {
    // 30 alunos elegíveis (> PAGE_SIZE de 25) pra que a página 1 seja válida depois do
    // clamp em paginar() — com poucos alunos a página sempre volta pra 0.
    const alunos = Array.from({ length: 30 }, (_, index) => ({
      id: `aluno-${index}`,
      nome: `Aluno ${index}`,
      duplaId: "dupla-1",
      monitorSemanaAId: "monitor-1",
      turma: { nome: "CC/IA" },
    }));
    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValue({ id: "monitor-1", duplaId: "dupla-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "monitor-1" }]),
      },
      aluno: { findMany: vi.fn().mockResolvedValue(alunos) },
      lista: { findMany: vi.fn().mockResolvedValue([{ id: "lista-1", ordem: 1, semanaOverride: null }]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set("discord-1", conversaBase({ etapa: "aluno", paginaAluno: 0 }));
    const { interaction, editReply } = interacaoBotao("fb:pag:next");

    await instancia.tratarBotao(interaction);

    expect(instancia.conversas.get("discord-1")?.paginaAluno).toBe(1);
    expect(editReply).toHaveBeenCalled();
  });

  it("volta a página de envolvidos", async () => {
    const prisma = {
      aluno: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set(
      "discord-1",
      conversaBase({ etapa: "envolvido", paginaEnvolvido: 1, turmaEnvolvidoId: "turma-1", alunoId: "aluno-1" }),
    );
    const { interaction } = interacaoBotao("fb:pag:prev");

    await instancia.tratarBotao(interaction);

    expect(instancia.conversas.get("discord-1")?.paginaEnvolvido).toBe(0);
  });

  it("confirma o recebimento sem quebrar quando a etapa atual não tem paginação (mensagem obsoleta)", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "ia" }));
    const { interaction } = interacaoBotao("fb:pag:next");

    await instancia.tratarBotao(interaction);

    expect(interaction.deferred).toBe(true);
  });
});

describe("tratarBotao — cancelar", () => {
  it("descarta a conversa e avisa que nada foi gravado", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase({ etapa: "confirmar" }));
    const { interaction, update } = interacaoBotao("fb:cancelar");

    await instancia.tratarBotao(interaction);

    expect(instancia.conversas.has("discord-1")).toBe(false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Nenhuma informação foi gravada") }),
    );
  });
});

describe("tratarBotao — plagioMesmaPessoa", () => {
  it("sim: registra mesmaPessoaPlagio e segue pro curso do envolvido", async () => {
    const prisma = {
      turma: { findMany: vi.fn().mockResolvedValue([{ id: "turma-1", nome: "CC/IA" }]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set(
      "discord-1",
      conversaBase({ etapa: "plagioMesmaPessoa", plagio: [1, 3] } as Partial<ConversaTeste>),
    );
    const { interaction, editReply } = interacaoBotao("fb:sim");

    await instancia.tratarBotao(interaction);

    expect((instancia.conversas.get("discord-1") as unknown as { mesmaPessoaPlagio: boolean }).mesmaPessoaPlagio).toBe(
      true,
    );
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("cursoEnvolvido");
    expect(editReply).toHaveBeenCalled();
  });
});
