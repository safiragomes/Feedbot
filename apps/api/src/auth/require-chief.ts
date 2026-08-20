import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { hashToken } from "./password.js";

export type ChiefSession = { contaId: string; monitorId: string; email: string };

declare module "fastify" {
  interface FastifyRequest {
    chefe?: ChiefSession;
  }
}

export function requireChief(prisma: PrismaClient) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) return reply.unauthorized("Sessão de chefe obrigatória");

    const session = await prisma.sessaoChefe.findUnique({
      where: { tokenHash: await hashToken(token) },
      include: { contaChefe: { include: { monitor: true } } },
    });
    if (!session || session.expiraEm <= new Date() || !session.contaChefe.monitor.isChefe) {
      return reply.unauthorized("Sessão inválida ou expirada");
    }
    request.chefe = {
      contaId: session.contaChefeId,
      monitorId: session.contaChefe.monitorId,
      email: session.contaChefe.email,
    };
  };
}
