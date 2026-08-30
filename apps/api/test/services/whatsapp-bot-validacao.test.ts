import { describe, expect, it, vi } from "vitest";
import type { WAMessage, WASocket } from "@whiskeysockets/baileys";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { WhatsAppBot } from "../../src/services/whatsapp-bot.js";

type EtapaOcorrencia = "questoesIa" | "questoesPlagio" | "questoesProibicao";
type ConversaTeste = {
  monitorId: string;
  periodoId: string;
  etapa: EtapaOcorrencia;
  listaId: string;
  alunoId: string;
  pontuacao: number;
  totalQuestoes: number;
  ia: number[];
  plagio: number[];
  proibicao: number[];
};

describe("validação imediata das ocorrências no bot", () => {
  it.each<EtapaOcorrencia>(["questoesIa", "questoesPlagio", "questoesProibicao"])(
    "não avança a etapa %s quando uma questão excede o total da lista",
    async (etapa) => {
      const enviar = vi.fn().mockResolvedValue(undefined);
      const socket = { sendMessage: enviar } as unknown as WASocket;
      const conversa: ConversaTeste = {
        monitorId: "monitor-1",
        periodoId: "periodo-1",
        etapa,
        listaId: "lista-1",
        alunoId: "aluno-1",
        pontuacao: 8,
        totalQuestoes: 10,
        ia: [],
        plagio: [],
        proibicao: [],
      };
      const bot = new WhatsAppBot({} as PrismaClient);
      const botInterno = bot as unknown as {
        conversas: Map<string, ConversaTeste>;
        receber(socketAtual: WASocket, mensagem: WAMessage): Promise<unknown>;
      };
      botInterno.conversas.set("5581999999999", conversa);

      await botInterno.receber(socket, {
        key: { remoteJid: "5581999999999@s.whatsapp.net", fromMe: false },
        message: { conversation: "1, 11" },
      } as WAMessage);

      expect(conversa.etapa).toBe(etapa);
      expect(enviar).toHaveBeenCalledWith(
        "5581999999999@s.whatsapp.net",
        expect.objectContaining({ text: expect.stringContaining("entre 1 e 10") }),
      );
    },
  );
});
