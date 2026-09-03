import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

describe("guildsDisponiveis", () => {
  it("lista os servidores em que o bot está presente, ordenados por nome", () => {
    const instancia = new DiscordBot({} as PrismaClient, "token");
    const interno = instancia as unknown as {
      client: { guilds: { cache: Map<string, { id: string; name: string }> } };
      guildsDisponiveis(): { id: string; nome: string }[];
    };
    interno.client.guilds.cache.set("guild-b", { id: "guild-b", name: "Servidor B" });
    interno.client.guilds.cache.set("guild-a", { id: "guild-a", name: "Servidor A" });

    expect(interno.guildsDisponiveis()).toEqual([
      { id: "guild-a", nome: "Servidor A" },
      { id: "guild-b", nome: "Servidor B" },
    ]);
  });
});
