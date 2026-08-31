import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { hashToken } from "./password.js";

export type ChiefSession = { contaId: string; monitorId: string; email: string; nome: string };
export const SESSION_COOKIE = "feedbot_session";

export function sessionToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.cookies[SESSION_COOKIE];
}

declare module "fastify" {
  interface FastifyRequest {
    chefe?: ChiefSession;
  }
}

export function requireChief(prisma: PrismaClient) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    const bearer = authorization?.startsWith("Bearer ");
    const token = sessionToken(request);
    if (!token) return reply.unauthorized("Sessão de chefe obrigatória");

    // Requisições autenticadas por cookie precisam deste cabeçalho não-simples.
    // Isso impede que outro site dispare alterações usando a sessão do navegador.
    if (
      !bearer &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      request.headers["x-feedbot-client"] !== "web"
    ) {
      return reply.forbidden("Requisição não autorizada");
    }

    const session = await prisma.sessaoChefe.findUnique({
      where: { tokenHash: await hashToken(token) },
      include: { contaChefe: { include: { monitor: true } } },
    });
    if (
      !session ||
      session.expiraEm <= new Date() ||
      !session.contaChefe.monitor.isChefe ||
      session.contaChefe.monitor.status !== "ATIVO"
    ) {
      if (!bearer) reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return reply.unauthorized("Sessão inválida ou expirada");
    }
    request.chefe = {
      contaId: session.contaChefeId,
      monitorId: session.contaChefe.monitorId,
      email: session.contaChefe.email,
      nome: session.contaChefe.monitor.nome,
    };
  };
}
