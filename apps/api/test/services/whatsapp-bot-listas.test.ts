import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { WhatsAppBot } from "../../src/services/whatsapp-bot.js";

describe("listas exibidas pelo bot", () => {
  it("mostra as listas 2, 4 e 6 para o monitor B", async () => {
    const listas = Array.from({ length: 6 }, (_, index) => ({
      id: `lista-${index + 1}`,
      nome: `Lista ${index + 1}`,
      ordem: index + 1,
      semanaOverride: null,
    }));
    const prisma = {
      monitor: {
        findUnique: vi.fn().mockResolvedValue({ id: "monitor-b", duplaId: "dupla-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "monitor-a" }, { id: "monitor-b" }]),
      },
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno-1",
            duplaId: "dupla-1",
            monitorSemanaAId: "monitor-a",
            turma: { id: "turma-1", nome: "CC/IA" },
          },
        ]),
      },
      lista: { findMany: vi.fn().mockResolvedValue(listas) },
    } as unknown as PrismaClient;
    const bot = new WhatsAppBot(prisma);

    const permitidas = await (
      bot as unknown as {
        listasPermitidas(monitorId: string, periodoId: string): Promise<typeof listas>;
      }
    ).listasPermitidas("monitor-b", "periodo-1");

    expect(permitidas.map(({ ordem }) => ordem)).toEqual([2, 4, 6]);
  });
});
