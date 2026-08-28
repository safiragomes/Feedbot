import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  hashPassword,
  hashToken,
  newSessionToken,
  timingSafeEqualString,
  verifyPassword,
} from "../auth/password.js";
import { requireChief, SESSION_COOKIE, sessionToken } from "../auth/require-chief.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

function credenciaisValidas(email: string, senha: string) {
  return (
    EMAIL_RE.test(email) &&
    email.length <= MAX_EMAIL_LENGTH &&
    senha.length >= MIN_PASSWORD_LENGTH &&
    senha.length <= MAX_PASSWORD_LENGTH
  );
}

export function authRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post(
    "/auth/bootstrap",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = request.body as
        { segredo?: unknown; monitorId?: unknown; email?: unknown; senha?: unknown } | undefined;
      const segredoEsperado = process.env["AUTH_BOOTSTRAP_SECRET"];
      const segredo = typeof body?.segredo === "string" ? body.segredo : "";
      const monitorId = typeof body?.monitorId === "string" ? body.monitorId : "";
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const senha = typeof body?.senha === "string" ? body.senha : "";
      if (!segredoEsperado || !timingSafeEqualString(segredo, segredoEsperado))
        return reply.unauthorized("Segredo de inicialização inválido");
      if (!monitorId || !credenciaisValidas(email, senha))
        return reply.badRequest(
          "Monitor, e-mail válido e senha entre 12 e 256 caracteres são obrigatórios",
        );
      const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
      if (!monitor?.isChefe || monitor.status !== "ATIVO")
        return reply.badRequest("A conta deve pertencer a um monitor-chefe ativo");
      const senhaHash = await hashPassword(senha);
      const conta = await prisma.$transaction(async (tx) => {
        // Serializa tentativas de bootstrap. Sem o lock, duas requisições simultâneas
        // poderiam observar count=0 e criar dois primeiros administradores.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(937421)`;
        if ((await tx.contaChefe.count()) > 0) return null;
        return tx.contaChefe.create({
          data: { monitorId, email, senhaHash },
          select: { id: true, monitorId: true, email: true },
        });
      });
      if (!conta) return reply.conflict("A inicialização já foi concluída");
      return reply.code(201).send(conta);
    },
  );

  app.post("/auth/contas", { preHandler: requireChief(prisma) }, async (request, reply) => {
    const body = request.body as
      { monitorId?: unknown; email?: unknown; senha?: unknown } | undefined;
    const monitorId = typeof body?.monitorId === "string" ? body.monitorId : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const senha = typeof body?.senha === "string" ? body.senha : "";
    if (!monitorId || !credenciaisValidas(email, senha))
      return reply.badRequest(
        "Monitor, e-mail válido e senha entre 12 e 256 caracteres são obrigatórios",
      );
    const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    if (!monitor?.isChefe || monitor.status !== "ATIVO")
      return reply.badRequest("A conta deve pertencer a um monitor-chefe ativo");
    return reply.code(201).send(
      await prisma.contaChefe.create({
        data: { monitorId, email, senhaHash: await hashPassword(senha) },
        select: { id: true, monitorId: true, email: true },
      }),
    );
  });

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body as { email?: unknown; senha?: unknown } | undefined;
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const senha = typeof body?.senha === "string" ? body.senha : "";
      if (!email || !senha || email.length > MAX_EMAIL_LENGTH || senha.length > MAX_PASSWORD_LENGTH)
        return reply.badRequest("E-mail ou senha inválidos");

      const conta = await prisma.contaChefe.findUnique({
        where: { email },
        include: { monitor: true },
      });
      if (
        !conta ||
        !conta.monitor.isChefe ||
        conta.monitor.status !== "ATIVO" ||
        !(await verifyPassword(senha, conta.senhaHash))
      ) {
        return reply.unauthorized("Credenciais inválidas");
      }

      const token = newSessionToken();
      const expiraEm = new Date(Date.now() + 1000 * 60 * 60 * 12);
      await prisma.$transaction([
        prisma.sessaoChefe.deleteMany({
          where: { OR: [{ expiraEm: { lte: new Date() } }, { contaChefeId: conta.id }] },
        }),
        prisma.sessaoChefe.create({
          data: { contaChefeId: conta.id, tokenHash: await hashToken(token), expiraEm },
        }),
      ]);
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env["NODE_ENV"] === "production",
        path: "/",
        expires: expiraEm,
      });
      const resposta = {
        expiraEm,
        chefe: { id: conta.monitorId, nome: conta.monitor.nome, email: conta.email },
      };
      // Clientes de API continuam podendo usar Bearer; o frontend nunca recebe o token.
      return request.headers["x-feedbot-client"] === "web" ? resposta : { ...resposta, token };
    },
  );

  app.post("/auth/logout", { preHandler: requireChief(prisma) }, async (request, reply) => {
    const token = sessionToken(request)!;
    await prisma.sessaoChefe.deleteMany({ where: { tokenHash: await hashToken(token) } });
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: requireChief(prisma) }, async (request) => ({
    chefe: request.chefe,
  }));
}
