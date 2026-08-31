import { describe, expect, it, vi } from "vitest";
import type { WAMessage, WASocket } from "@whiskeysockets/baileys";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { WhatsAppBot } from "../../src/services/whatsapp-bot.js";

describe("lista sem alunos elegíveis no momento da escolha", () => {
  it("avisa e encerra a conversa em vez de mostrar 'Qual aluno?' sem opções", async () => {
    const enviar = vi.fn().mockResolvedValue(undefined);
    const socket = { sendMessage: enviar } as unknown as WASocket;
    const listas = [
      { id: "lista-1", nome: "Lista 1", ordem: 1, semanaOverride: null, qtdQuestoesTotal: 10 },
    ];
    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValue({ id: "monitor-1", duplaId: "dupla-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "monitor-1" }]),
      },
      aluno: {
        // A primeira chamada (dentro de listasPermitidas) ainda enxerga um aluno
        // elegível; a segunda (dentro de alunosElegiveis, para a lista escolhida)
        // já não encontra nenhum — simula os alunos mudando entre as duas etapas.
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "aluno-1",
              duplaId: "dupla-1",
              monitorSemanaAId: "monitor-1",
              turma: { id: "turma-1", nome: "CC/IA" },
            },
          ])
          .mockResolvedValueOnce([]),
      },
      lista: { findMany: vi.fn().mockResolvedValue(listas) },
    } as unknown as PrismaClient;

    const bot = new WhatsAppBot(prisma);
    const botInterno = bot as unknown as {
      conversas: Map<string, { monitorId: string; periodoId: string; etapa: string }>;
      receber(socketAtual: WASocket, mensagem: WAMessage): Promise<unknown>;
    };
    botInterno.conversas.set("5581999999999", {
      monitorId: "monitor-1",
      periodoId: "periodo-1",
      etapa: "lista",
    });

    await botInterno.receber(socket, {
      key: { remoteJid: "5581999999999@s.whatsapp.net", fromMe: false },
      message: { conversation: "1" },
    } as WAMessage);

    expect(botInterno.conversas.has("5581999999999")).toBe(false);
    expect(enviar).toHaveBeenCalledWith(
      "5581999999999@s.whatsapp.net",
      expect.objectContaining({ text: expect.stringContaining("Não há alunos") }),
    );
  });
});
