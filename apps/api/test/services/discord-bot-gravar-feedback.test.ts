import { describe, expect, it, vi } from "vitest";
import type { ButtonInteraction } from "discord.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { GoogleSheetsSync } from "../../src/services/google-sheets.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

// gravarFeedback() é a função que de fato persiste o feedback (via criarFeedback) e
// tenta sincronizar com a planilha — a mais crítica do fluxo, e a que tinha 0% de
// cobertura antes desta auditoria. Os dois casos de falha abaixo são os que já tinham
// tratamento explícito no código mas nenhum teste: criarFeedback rejeitando (ex.: regra
// de semana A/B violada) e a sincronização com a planilha falhando depois do feedback
// já ter sido salvo (o registro não pode ser desfeito só porque a planilha falhou).

vi.mock("../../src/services/feedback.js", () => ({
  criarFeedback: vi.fn(),
}));

const { criarFeedback } = await import("../../src/services/feedback.js");

type ConversaTeste = {
  monitorId: string;
  etapa: string;
  alunoId?: string;
  listaId?: string;
  pontuacao?: number;
  faltou: boolean;
  ia: number[];
  plagio: number[];
  proibicao: number[];
  envolvidos: Record<number, string>;
};

function conversaPronta(): ConversaTeste {
  return {
    monitorId: "monitor-1",
    etapa: "confirmar",
    alunoId: "aluno-1",
    listaId: "lista-1",
    pontuacao: 5,
    faltou: false,
    ia: [],
    plagio: [],
    proibicao: [],
    envolvidos: {},
  };
}

function interacaoConfirmar() {
  const editReply = vi.fn().mockResolvedValue(undefined);
  const interaction: {
    user: { id: string };
    customId: string;
    deferred: boolean;
    replied: boolean;
    deferUpdate: () => Promise<void>;
    editReply: typeof editReply;
  } = {
    user: { id: "discord-1" },
    customId: "fb:confirmar",
    deferred: false,
    replied: false,
    deferUpdate: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply,
  };
  return { interaction: interaction as unknown as ButtonInteraction, editReply };
}

function bot(sheets?: GoogleSheetsSync) {
  const instancia = new DiscordBot({} as PrismaClient, "token", sheets);
  return instancia as unknown as {
    conversas: Map<string, ConversaTeste>;
    tratarBotao(i: ButtonInteraction): Promise<unknown>;
  };
}

describe("gravarFeedback — casos de falha", () => {
  it("mantém a conversa e mostra o erro quando criarFeedback rejeita (ex.: regra de negócio violada)", async () => {
    vi.mocked(criarFeedback).mockRejectedValueOnce(
      new Error("Esta lista é da semana B deste aluno, responsabilidade de outro monitor"),
    );
    const instancia = bot();
    instancia.conversas.set("discord-1", conversaPronta());
    const { interaction, editReply } = interacaoConfirmar();

    await instancia.tratarBotao(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("responsabilidade de outro monitor"),
      }),
    );
    // Ao contrário do sucesso, um erro de validação não descarta a conversa — o
    // monitor pode tentar de novo sem perder o que já preencheu... na prática o botão
    // Confirmar reaparece só se a mensagem ainda tiver os componentes, mas o estado em
    // memória preservado é o comportamento atual do código (não perde o rascunho).
    expect(instancia.conversas.has("discord-1")).toBe(true);
  });

  it("salva o feedback e avisa quando a sincronização com a planilha falha depois", async () => {
    vi.mocked(criarFeedback).mockResolvedValueOnce({ id: "feedback-1" } as never);
    const sincronizarFeedback = vi.fn().mockRejectedValue(new Error("Planilha indisponível"));
    const sheets = { sincronizarFeedback } as unknown as GoogleSheetsSync;
    const instancia = bot(sheets);
    instancia.conversas.set("discord-1", conversaPronta());
    const { interaction, editReply } = interacaoConfirmar();

    await instancia.tratarBotao(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Feedback salvo, mas a planilha não foi atualizada"),
      }),
    );
    // O feedback foi salvo (criarFeedback não rejeitou) — a conversa É descartada,
    // diferente do caso de erro de validação acima, porque não há nada mais a corrigir.
    expect(instancia.conversas.has("discord-1")).toBe(false);
  });
});
