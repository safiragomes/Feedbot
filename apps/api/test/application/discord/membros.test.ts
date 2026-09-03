import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import { listarMembrosComPapel, monitorPorDiscordUserId } from "../../../src/application/discord/membros.js";

function membroFalso(id: string, temPapel: boolean, displayName: string) {
  return {
    id,
    user: { username: `user-${id}` },
    displayName,
    roles: { cache: { has: (roleId: string) => temPapel && roleId === "role-monitores" } },
    displayAvatarURL: () => `https://cdn.test/${id}.png`,
  };
}

// discord.js resolve guild.members.fetch() para uma Collection (Map + filter/map que
// retornam array, ao contrário de um Map comum) — este fake replica só essa parte da
// API usada por listarMembrosComPapel.
function colecaoFalsa<T>(itens: T[]): { filter: (fn: (item: T) => boolean) => unknown; map: <R>(fn: (item: T) => R) => R[] } {
  return {
    filter: (fn) => colecaoFalsa(itens.filter(fn)),
    map: (fn) => itens.map(fn),
  };
}

describe("listarMembrosComPapel", () => {
  it("retorna somente membros com o cargo informado, ordenados por nome", async () => {
    const membros = colecaoFalsa([
      membroFalso("1", true, "Beatriz"),
      membroFalso("2", false, "Ana"),
      membroFalso("3", true, "Ana"),
    ]);
    const guild = {
      members: { fetch: vi.fn().mockResolvedValue(membros) },
    } as unknown as Guild;

    const resultado = await listarMembrosComPapel(guild, "role-monitores");

    expect(resultado.map((item) => item.discordUserId)).toEqual(["3", "1"]);
    expect(resultado[0]).toMatchObject({ username: "user-3", displayName: "Ana" });
  });
});

describe("monitorPorDiscordUserId", () => {
  it("busca o monitor pelo discordUserId", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "monitor-1" });
    const prisma = { monitor: { findUnique } } as unknown as PrismaClient;

    const monitor = await monitorPorDiscordUserId(prisma, "discord-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { discordUserId: "discord-1" } });
    expect(monitor).toEqual({ id: "monitor-1" });
  });
});
