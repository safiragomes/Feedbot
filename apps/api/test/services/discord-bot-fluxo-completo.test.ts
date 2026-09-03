import { describe, expect, it, vi } from "vitest";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { GoogleSheetsSync } from "../../src/services/google-sheets.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

// Antes desta auditoria, nenhum teste percorria o fluxo inteiro: cada teste existente
// injetava uma `conversa` já pronta num passo específico do meio, então iniciarFluxo,
// mostrarResumo e gravarFeedback (a função que de fato grava o feedback no banco) nunca
// eram exercitados. Este teste percorre o caminho feliz completo — do /feedback até a
// gravação — sem plágio (esse ramo já tem cobertura dedicada em
// discord-bot-plagio.test.ts e discord-bot-revalidacao.test.ts).

vi.mock("../../src/services/feedback.js", () => ({
  criarFeedback: vi.fn().mockResolvedValue({ id: "feedback-1" }),
}));

const { criarFeedback } = await import("../../src/services/feedback.js");

type ConversaTeste = {
  monitorId: string;
  etapa: string;
  alunoId?: string;
  listaId?: string;
  pontuacao?: number;
  faltou: boolean;
};

function interacaoBase(overrides: Record<string, unknown> = {}) {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const deferUpdate = vi.fn().mockResolvedValue(undefined);
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const interaction: Record<string, unknown> = {
    user: { id: "discord-1" },
    channelId: "canal-1",
    deferred: false,
    replied: false,
    deferUpdate: vi.fn(async () => {
      interaction["deferred"] = true;
    }),
    deferReply,
    editReply,
    update,
    ...overrides,
  };
  interaction["deferUpdate"] = deferUpdate.mockImplementation(async () => {
    interaction["deferred"] = true;
  });
  return { interaction, editReply, update, deferUpdate, deferReply };
}

describe("fluxo completo do /feedback (caminho feliz, sem plágio)", () => {
  it("do comando até o feedback gravado e sincronizado com a planilha", async () => {
    const monitor = {
      id: "monitor-1",
      nome: "Monitor Um",
      status: "ATIVO",
      periodoId: "periodo-1",
      duplaId: "dupla-1",
    };
    const aluno = {
      id: "aluno-1",
      nome: "Aluno Um",
      duplaId: "dupla-1",
      monitorSemanaAId: "monitor-1",
      turma: { id: "turma-1", nome: "CC/IA", periodoId: "periodo-1" },
    };
    const lista = {
      id: "lista-1",
      nome: "Lista 1",
      ordem: 1,
      semanaOverride: null,
      qtdQuestoesTotal: 6,
      periodoId: "periodo-1",
    };
    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValue(monitor),
        findMany: vi.fn().mockResolvedValue([{ id: "monitor-1" }]),
      },
      periodo: {
        findUnique: vi.fn().mockResolvedValue({ id: "periodo-1", discordAvisosCanalId: "canal-1" }),
      },
      aluno: {
        findMany: vi.fn().mockResolvedValue([aluno]),
        findUnique: vi.fn().mockResolvedValue(aluno),
      },
      lista: {
        findMany: vi.fn().mockResolvedValue([lista]),
        findUnique: vi.fn().mockResolvedValue(lista),
      },
    } as unknown as PrismaClient;
    const sincronizarFeedback = vi.fn().mockResolvedValue(undefined);
    const sheets = { sincronizarFeedback } as unknown as GoogleSheetsSync;
    const instancia = new DiscordBot(prisma, "token", sheets) as unknown as {
      conversas: Map<string, ConversaTeste>;
      iniciarFluxo(i: ChatInputCommandInteraction): Promise<unknown>;
      tratarSelect(i: StringSelectMenuInteraction): Promise<unknown>;
      tratarBotao(i: ButtonInteraction): Promise<unknown>;
    };

    // 1. /feedback
    const entrada = interacaoBase();
    await instancia.iniciarFluxo(entrada.interaction as unknown as ChatInputCommandInteraction);
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("lista");

    // 2. escolhe a lista
    const escolhaLista = interacaoBase({ values: ["lista-1"] });
    await instancia.tratarSelect(escolhaLista.interaction as unknown as StringSelectMenuInteraction);
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("aluno");

    // 3. escolhe o aluno
    const escolhaAluno = interacaoBase({ values: ["aluno-1"] });
    await instancia.tratarSelect(escolhaAluno.interaction as unknown as StringSelectMenuInteraction);
    expect(instancia.conversas.get("discord-1")).toMatchObject({ etapa: "pontuacao", alunoId: "aluno-1" });

    // 4. pontuação: 5 corretas
    const pontuacao = interacaoBase({ values: ["5"] });
    await instancia.tratarSelect(pontuacao.interaction as unknown as StringSelectMenuInteraction);
    expect(instancia.conversas.get("discord-1")).toMatchObject({ etapa: "ia", pontuacao: 5, faltou: false });

    // 5. IA: não
    const ia = interacaoBase({ customId: "fb:nao" });
    await instancia.tratarBotao(ia.interaction as unknown as ButtonInteraction);
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("plagio");

    // 6. plágio: não
    const plagio = interacaoBase({ customId: "fb:nao" });
    await instancia.tratarBotao(plagio.interaction as unknown as ButtonInteraction);
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("proibicao");

    // 7. proibição: não -> mostra o resumo
    const proibicao = interacaoBase({ customId: "fb:nao" });
    await instancia.tratarBotao(proibicao.interaction as unknown as ButtonInteraction);
    expect(instancia.conversas.get("discord-1")?.etapa).toBe("confirmar");
    expect(proibicao.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.arrayContaining([expect.anything()]) }),
    );

    // 8. confirma -> grava e sincroniza
    const confirmar = interacaoBase({ customId: "fb:confirmar" });
    await instancia.tratarBotao(confirmar.interaction as unknown as ButtonInteraction);

    expect(criarFeedback).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        alunoId: "aluno-1",
        monitorId: "monitor-1",
        listaId: "lista-1",
        qtdQuestoesPontuadas: 5,
        faltou: false,
        questoesIa: [],
        questoesPlagio: [],
        questoesProibicao: [],
      }),
    );
    expect(sincronizarFeedback).toHaveBeenCalledWith(prisma, "feedback-1");
    expect(confirmar.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Feedback salvo") }),
    );
    // A conversa é descartada depois de gravar — reabrir /feedback começa do zero.
    expect(instancia.conversas.has("discord-1")).toBe(false);
  });
});
