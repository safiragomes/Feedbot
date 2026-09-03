import { describe, expect, it, vi } from "vitest";
import type { StringSelectMenuInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

// O Discord não garante que o valor devolvido por uma interação de select é
// realmente uma das opções que o bot ofereceu — uma interação forjada pode
// submeter qualquer string. O bot antigo de WhatsApp era seguro por construção
// (respostas eram um índice numérico resolvido contra uma lista buscada no
// servidor); a migração pro Discord trocou pra usar o id do banco como valor do
// select diretamente, e por isso cada etapa que aceita um id precisa revalidar
// esse id contra a lista de opções legítimas antes de usá-lo — sem isso, um
// monitor mal-intencionado (ou uma interação forjada) poderia registrar feedback
// para um aluno fora da sua responsabilidade, ou vazar nomes de alunos de outro
// período/turma.

type ConversaTeste = {
  monitorId: string;
  monitorNome: string;
  periodoId: string;
  etapa: string;
  listaId?: string;
  totalQuestoes?: number;
  alunoId?: string;
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

function bot(prisma: PrismaClient) {
  const instancia = new DiscordBot(prisma);
  return instancia as unknown as {
    conversas: Map<string, ConversaTeste>;
    tratarSelect(interacao: StringSelectMenuInteraction): Promise<unknown>;
  };
}

function interacaoSelect(valores: string[]) {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const interaction: {
    user: { id: string };
    values: string[];
    deferred: boolean;
    replied: boolean;
    deferUpdate: () => Promise<void>;
    editReply: typeof editReply;
    update: ReturnType<typeof vi.fn>;
  } = {
    user: { id: "discord-1" },
    values: valores,
    deferred: false,
    replied: false,
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply,
    update: vi.fn().mockResolvedValue(undefined),
  };
  return { interaction: interaction as unknown as StringSelectMenuInteraction, editReply };
}

describe("revalidação server-side das escolhas de select", () => {
  it("etapa aluno: recusa um alunoId que não está entre os elegíveis do monitor pra essa lista", async () => {
    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValue({ id: "monitor-1", duplaId: "dupla-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "monitor-1" }]),
      },
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno-legitimo",
            duplaId: "dupla-1",
            monitorSemanaAId: "monitor-1",
            turma: { nome: "CC/IA" },
          },
        ]),
      },
      lista: {
        findMany: vi.fn().mockResolvedValue([{ id: "lista-1", ordem: 1, semanaOverride: null }]),
      },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set("discord-1", {
      monitorId: "monitor-1",
      monitorNome: "Monitor",
      periodoId: "periodo-1",
      etapa: "aluno",
      listaId: "lista-1",
      totalQuestoes: 6,
      ia: [],
      plagio: [],
      mesmaPessoaPlagio: false,
      indicePlagioAtual: 0,
      envolvidos: {},
      proibicao: [],
      paginaAluno: 0,
      paginaEnvolvido: 0,
      atualizadoEm: Date.now(),
    });
    // "aluno-de-outra-dupla" nunca esteve entre as opções mostradas — simula uma
    // interação forjada tentando escolher um aluno fora da responsabilidade do monitor
    // (inclusive o caso não coberto por criarFeedback: aluno sem dupla).
    const { interaction, editReply } = interacaoSelect(["aluno-de-outra-dupla"]);

    await instancia.tratarSelect(interaction);

    expect(instancia.conversas.has("discord-1")).toBe(false);
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Opção inválida") }),
    );
  });

  it("etapa cursoEnvolvido: recusa uma turmaId que não pertence ao período do monitor", async () => {
    const prisma = {
      turma: { findMany: vi.fn().mockResolvedValue([{ id: "turma-do-periodo" }]) },
    } as unknown as PrismaClient;
    const instancia = bot(prisma);
    instancia.conversas.set("discord-1", {
      monitorId: "monitor-1",
      monitorNome: "Monitor",
      periodoId: "periodo-1",
      etapa: "cursoEnvolvido",
      alunoId: "aluno-1",
      ia: [],
      plagio: [2],
      mesmaPessoaPlagio: false,
      indicePlagioAtual: 0,
      envolvidos: {},
      proibicao: [],
      paginaAluno: 0,
      paginaEnvolvido: 0,
      atualizadoEm: Date.now(),
    });
    // "turma-de-outro-periodo" nunca foi oferecida como opção — simula uma tentativa
    // de vazar/usar uma turma de outro período (ids não são adivinháveis, mas a
    // revalidação fecha esse vetor de qualquer forma).
    const { interaction, editReply } = interacaoSelect(["turma-de-outro-periodo"]);

    await instancia.tratarSelect(interaction);

    expect(instancia.conversas.has("discord-1")).toBe(false);
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Opção inválida") }),
    );
  });
});
