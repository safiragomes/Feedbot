import type { Guild } from "discord.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface MembroDiscord {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Busca ao vivo os membros do servidor que têm o cargo informado (ex.: "Monitores").
 * Não usa cache — cada chamada reflete o estado atual do servidor, já que a tela de
 * vínculo manual depende de ver quem entrou/saiu recentemente. Exige o intent
 * privilegiado GuildMembers habilitado no Developer Portal para `guild.members.fetch()`
 * retornar a lista completa em vez de só os membros já em cache do gateway.
 */
export async function listarMembrosComPapel(
  guild: Guild,
  roleId: string,
): Promise<MembroDiscord[]> {
  const membros = await guild.members.fetch();
  return membros
    .filter((membro) => membro.roles.cache.has(roleId))
    .map((membro) => ({
      discordUserId: membro.id,
      username: membro.user.username,
      displayName: membro.displayName,
      avatarUrl: membro.displayAvatarURL({ size: 64 }),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
}

export async function monitorPorDiscordUserId(prisma: PrismaClient, discordUserId: string) {
  return prisma.monitor.findUnique({ where: { discordUserId } });
}
