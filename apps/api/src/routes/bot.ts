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
  app.post("/bot/grupos/:id", protectedRoute, async (request, reply) => {
    const whatsappGrupoId = (request.body as { whatsappGrupoId?: unknown }).whatsappGrupoId;
    if (typeof whatsappGrupoId !== "string" || !whatsappGrupoId.endsWith("@g.us"))
      return reply.badRequest("ID de grupo do WhatsApp inválido");
    try {
      const whatsappGrupoNome = await bot.nomeDoGrupo(whatsappGrupoId);
      return reply
        .code(200)
        .send(
          await prisma.grupoRevisao.update({
            where: request.params as { id: string },
            data: { whatsappGrupoId, whatsappGrupoNome },
          }),
        );
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível validar o grupo",
      );
    }
  });
  app.delete("/bot/grupos/:id", protectedRoute, async (request, reply) => {
    await prisma.grupoRevisao.update({
      where: request.params as { id: string },
      data: { whatsappGrupoId: null, whatsappGrupoNome: null },
    });
    return reply.code(204).send();
  });
}
