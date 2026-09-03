import type { FastifyInstance, FastifyReply } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireChief } from "../auth/require-chief.js";
import type { DiscordBot } from "../services/discord-bot.js";

async function periodoOuErro(prisma: PrismaClient, reply: FastifyReply, periodoId: string) {
  const periodo = await prisma.periodo.findUnique({ where: { id: periodoId } });
  if (!periodo) {
    reply.notFound();
    return null;
  }
  return periodo;
}

export function botRoutes(app: FastifyInstance, prisma: PrismaClient, bot: DiscordBot) {
  const protectedRoute = { preHandler: requireChief(prisma) };
  app.get("/bot", protectedRoute, async () => ({ sessao: await bot.status() }));

  // Cada período usa um servidor do Discord próprio (criado do zero a cada semestre),
  // então servidor/cargo/canal são escolhidos por período, não uma configuração única
  // do bot — as três rotas abaixo listam o que está disponível ao vivo pra montar
  // esses seletores no painel.
  app.get("/bot/servidores-disponiveis", protectedRoute, async () => bot.guildsDisponiveis());

  app.get("/bot/periodos/:id/cargos-disponiveis", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const periodo = await periodoOuErro(prisma, reply, periodoId);
    if (!periodo) return;
    if (!periodo.discordGuildId) return reply.badRequest("Vincule um servidor a este período primeiro");
    try {
      return await bot.rolesDisponiveis(periodo.discordGuildId);
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível listar os cargos do servidor",
      );
    }
  });

  app.get("/bot/periodos/:id/canais-disponiveis", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const periodo = await periodoOuErro(prisma, reply, periodoId);
    if (!periodo) return;
    if (!periodo.discordGuildId) return reply.badRequest("Vincule um servidor a este período primeiro");
    try {
      return await bot.canaisDisponiveis(periodo.discordGuildId);
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível listar os canais do servidor",
      );
    }
  });

  app.get("/bot/periodos/:id/membros-monitores", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const periodo = await periodoOuErro(prisma, reply, periodoId);
    if (!periodo) return;
    if (!periodo.discordGuildId || !periodo.discordMonitoresRoleId) {
      return reply.badRequest("Vincule um servidor e um cargo de monitores a este período primeiro");
    }
    try {
      const membros = await bot.membrosComPapelMonitores(
        periodo.discordGuildId,
        periodo.discordMonitoresRoleId,
      );
      const vinculados = await prisma.monitor.findMany({
        where: { discordUserId: { not: null } },
        select: { discordUserId: true, nome: true },
      });
      const nomePorDiscordId = new Map(vinculados.map((item) => [item.discordUserId, item.nome]));
      return membros.map((membro) => ({
        ...membro,
        jaVinculado: nomePorDiscordId.get(membro.discordUserId) ?? null,
      }));
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível listar os membros do Discord",
      );
    }
  });

  app.put("/bot/periodos/:id/servidor", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const periodo = await periodoOuErro(prisma, reply, periodoId);
    if (!periodo) return;
    const body = request.body as { discordGuildId?: unknown };
    if (typeof body.discordGuildId !== "string") return reply.badRequest("Selecione um servidor");
    const servidor = bot.guildsDisponiveis().find((item) => item.id === body.discordGuildId);
    if (!servidor) return reply.badRequest("O bot não está presente nesse servidor");
    // Só limpa cargo e canal quando o servidor está realmente TROCANDO por outro —
    // pertenciam ao servidor anterior e não existem no novo. Definir o servidor pela
    // primeira vez (ou salvar o mesmo de novo) não pode apagar um canal/cargo já
    // configurado antes.
    const trocandoDeServidor =
      periodo.discordGuildId !== null && periodo.discordGuildId !== servidor.id;
    return prisma.periodo.update({
      where: { id: periodoId },
      data: {
        discordGuildId: servidor.id,
        ...(trocandoDeServidor
          ? { discordMonitoresRoleId: null, discordAvisosCanalId: null, discordAvisosCanalNome: null }
          : {}),
      },
    });
  });
  app.delete("/bot/periodos/:id/servidor", protectedRoute, async (request, reply) => {
    await prisma.periodo.update({
      where: request.params as { id: string },
      data: {
        discordGuildId: null,
        discordMonitoresRoleId: null,
        discordAvisosCanalId: null,
        discordAvisosCanalNome: null,
      },
    });
    return reply.code(204).send();
  });

  app.put("/bot/periodos/:id/cargo", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const periodo = await periodoOuErro(prisma, reply, periodoId);
    if (!periodo) return;
    if (!periodo.discordGuildId) return reply.badRequest("Vincule um servidor a este período primeiro");
    const body = request.body as { discordMonitoresRoleId?: unknown };
    if (typeof body.discordMonitoresRoleId !== "string") return reply.badRequest("Selecione um cargo");
    const cargos = await bot.rolesDisponiveis(periodo.discordGuildId).catch(() => []);
    const cargo = cargos.find((item) => item.id === body.discordMonitoresRoleId);
    if (!cargo) return reply.badRequest("O cargo não existe mais nesse servidor");
    return prisma.periodo.update({
      where: { id: periodoId },
      data: { discordMonitoresRoleId: cargo.id },
    });
  });

  app.put("/bot/periodos/:id/comunidade", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const periodo = await periodoOuErro(prisma, reply, periodoId);
    if (!periodo) return;
    if (!periodo.discordGuildId) return reply.badRequest("Vincule um servidor a este período primeiro");
    const body = request.body as { discordAvisosCanalId?: unknown };
    if (typeof body.discordAvisosCanalId !== "string") return reply.badRequest("Selecione um canal");
    const disponiveis = await bot.canaisDisponiveis(periodo.discordGuildId).catch(() => []);
    const canal = disponiveis.find((item) => item.id === body.discordAvisosCanalId);
    if (!canal) return reply.badRequest("O canal não existe mais ou o Feedbot não o enxerga");
    try {
      await bot.enviarPainelRegistro(canal.id);
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível publicar o painel no canal",
      );
    }
    return prisma.periodo.update({
      where: { id: periodoId },
      data: { discordAvisosCanalId: canal.id, discordAvisosCanalNome: canal.nome },
    });
  });
  app.delete("/bot/periodos/:id/comunidade", protectedRoute, async (request, reply) => {
    await prisma.periodo.update({
      where: request.params as { id: string },
      data: { discordAvisosCanalId: null, discordAvisosCanalNome: null },
    });
    return reply.code(204).send();
  });
  app.post("/bot/periodos/:id/enviar-link", protectedRoute, async (request, reply) => {
    const periodo = await prisma.periodo.findUnique({ where: request.params as { id: string } });
    if (!periodo?.discordAvisosCanalId)
      return reply.badRequest("O período não está vinculado a um canal");
    try {
      await bot.enviarPainelRegistro(periodo.discordAvisosCanalId);
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível publicar o painel no canal",
      );
    }
    return reply.code(204).send();
  });
}
