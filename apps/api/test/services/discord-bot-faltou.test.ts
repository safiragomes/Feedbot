import { describe, expect, it, vi } from "vitest";
import type { StringSelectMenuInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

type ConversaTeste = {
  monitorId: string;
  monitorNome: string;
  periodoId: string;
  etapa: string;
  alunoId?: string;
  listaId?: string;
  totalQuestoes?: number;
  pontuacao?: number;
  faltou: boolean;
  ia: number[];
  plagio: number[];
  mesmaPessoaPlagio: boolean;
  indicePlagioAtual: number;
  envolvidos: Record<number, string>;
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
    etapa: "pontuacao",
    alunoId: "aluno-1",
    listaId: "lista-1",
    totalQuestoes: 6,
    faltou: false,
    ia: [],
    plagio: [],
    mesmaPessoaPlagio: false,
    indicePlagioAtual: 0,
    envolvidos: {},
    proibicao: [],
    paginaAluno: 0,
    paginaEnvolvido: 0,
    atualizadoEm: Date.now(),
  };
}

describe("aluno que não entregou/respondeu a lista (F)", () => {
  it("marca faltou, zera a pontuação e pula direto pra confirmação", async () => {
    const instancia = bot({
      lista: { findUnique: vi.fn().mockResolvedValue({ id: "lista-1", nome: "Lista 1" }) },
      aluno: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "aluno-1", nome: "Aluno Teste", turma: { nome: "CC/IA" } }),
      },
    } as unknown as PrismaClient);
    instancia.conversas.set("discord-1", conversaBase());
    const { interaction, editReply } = interacaoSelect(["F"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.faltou).toBe(true);
    expect(conversa.pontuacao).toBe(0);
    expect(conversa.etapa).toBe("confirmar");
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: "Questões corretas",
                  value: "F — não entregou/respondeu",
                }),
              ]),
            }),
          }),
        ],
      }),
    );
    // Sem pergunta de IA/plágio/proibição quando o aluno faltou.
    const camposResumo = editReply.mock.calls[0]![0].embeds[0].data.fields as { name: string }[];
    expect(camposResumo.map((campo) => campo.name)).not.toContain("Usou IA");
  });

  it("resposta numérica normal segue pro passo de IA", async () => {
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaBase());
    const { interaction, update } = interacaoSelect(["4"]);

    await instancia.tratarSelect(interaction);

    const conversa = instancia.conversas.get("discord-1")!;
    expect(conversa.faltou).toBe(false);
    expect(conversa.pontuacao).toBe(4);
    expect(conversa.etapa).toBe("ia");
    // Passo puro (sem consulta ao banco) responde direto via update(), sem o hop extra
    // de deferUpdate()+editReply().
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Usou IA") }),
    );
  });
});
