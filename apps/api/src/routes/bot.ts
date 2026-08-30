import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireChief } from "../auth/require-chief.js";
import { WhatsAppBot } from "../services/whatsapp-bot.js";

export function botRoutes(app: FastifyInstance, prisma: PrismaClient, bot: WhatsAppBot) {
  const protectedRoute = { preHandler: requireChief(prisma) };
  app.get("/bot", protectedRoute, async () => ({ sessao: await bot.status(), qr: bot.qrAtual() }));
  app.post("/bot/conectar", protectedRoute, async (_request, reply) => {
    await bot.conectar();
    return reply.code(202).send({ status: "CONECTANDO" });
  });
  app.post("/bot/desconectar", protectedRoute, async (_request, reply) => {
    await bot.desconectar();
    return reply.code(204).send();
  });
  app.get("/bot/comunidades-disponiveis", protectedRoute, async (_request, reply) => {
    try {
      return await bot.comunidadesDisponiveis();
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível listar as comunidades",
      );
    }
  });
  app.put("/bot/periodos/:id/comunidade", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const whatsappAvisosId = (request.body as { whatsappAvisosId?: unknown }).whatsappAvisosId;
    if (typeof whatsappAvisosId !== "string") return reply.badRequest("Selecione uma comunidade");
    const disponiveis = await bot.comunidadesDisponiveis();
    const comunidade = disponiveis.find((item) => item.id === whatsappAvisosId);
    if (!comunidade)
      return reply.badRequest("A comunidade não existe mais ou o Feedbot não participa dos Avisos");
    await bot.enviarLinkDeAcesso(whatsappAvisosId);
    return prisma.periodo.update({
      where: { id: periodoId },
      data: { whatsappAvisosId, whatsappComunidadeNome: comunidade.nome },
    });
  });
  app.delete("/bot/periodos/:id/comunidade", protectedRoute, async (request, reply) => {
    await prisma.periodo.update({
      where: request.params as { id: string },
      data: { whatsappAvisosId: null, whatsappComunidadeNome: null },
    });
    return reply.code(204).send();
  });
  app.post("/bot/periodos/:id/enviar-link", protectedRoute, async (request, reply) => {
    const periodo = await prisma.periodo.findUnique({ where: request.params as { id: string } });
    if (!periodo?.whatsappAvisosId)
      return reply.badRequest("O período não está vinculado a uma comunidade");
    return bot.enviarLinkDeAcesso(periodo.whatsappAvisosId);
  });
}
