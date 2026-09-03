import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

function membroFalso(id: string, temPapel: boolean, nome: string) {
  return {
    id,
    user: { username: `user-${id}` },
    displayName: nome,
    roles: { cache: { has: (roleId: string) => temPapel && roleId === "role-1" } },
    displayAvatarURL: () => null,
  };
}

function colecaoFalsa<T>(itens: T[]) {
  return {
    filter: (fn: (item: T) => boolean) => colecaoFalsa(itens.filter(fn)),
    map: <R,>(fn: (item: T) => R) => itens.map(fn),
  };
}

describe("cache de membrosComPapelMonitores", () => {
  it("não refaz a busca no Discord (guild.members.fetch) dentro da janela de cache", async () => {
    const instancia = new DiscordBot({} as PrismaClient, "token");
    const membersFetch = vi
      .fn()
      .mockResolvedValue(colecaoFalsa([membroFalso("1", true, "Ana")]));
    const guildsFetch = vi.fn().mockResolvedValue({ members: { fetch: membersFetch } });
    const interno = instancia as unknown as {
      client: { guilds: { fetch: typeof guildsFetch } };
      membrosComPapelMonitores(guildId: string, roleId: string): Promise<unknown>;
    };
    interno.client.guilds.fetch = guildsFetch;

    await interno.membrosComPapelMonitores("guild-1", "role-1");
    await interno.membrosComPapelMonitores("guild-1", "role-1");
    const segunda = await interno.membrosComPapelMonitores("guild-1", "role-1");

    expect(guildsFetch).toHaveBeenCalledTimes(1);
    expect(membersFetch).toHaveBeenCalledTimes(1);
    expect(segunda).toEqual([
      { discordUserId: "1", username: "user-1", displayName: "Ana", avatarUrl: null },
    ]);
  });

  it("busca de novo pra um servidor/cargo diferente (chave de cache diferente)", async () => {
    const instancia = new DiscordBot({} as PrismaClient, "token");
    const membersFetch = vi.fn().mockResolvedValue(colecaoFalsa([membroFalso("1", true, "Ana")]));
    const guildsFetch = vi.fn().mockResolvedValue({ members: { fetch: membersFetch } });
    const interno = instancia as unknown as {
      client: { guilds: { fetch: typeof guildsFetch } };
      membrosComPapelMonitores(guildId: string, roleId: string): Promise<unknown>;
    };
    interno.client.guilds.fetch = guildsFetch;

    await interno.membrosComPapelMonitores("guild-1", "role-1");
    await interno.membrosComPapelMonitores("guild-2", "role-1");

    expect(guildsFetch).toHaveBeenCalledTimes(2);
  });
});
