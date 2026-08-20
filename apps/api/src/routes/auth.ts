import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "../auth/password.js";
import { requireChief } from "../auth/require-chief.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post("/auth/bootstrap", async (request, reply) => {
    const body = request.body as
      { segredo?: unknown; monitorId?: unknown; email?: unknown; senha?: unknown } | undefined;
    const segredoEsperado = process.env["AUTH_BOOTSTRAP_SECRET"];
    const segredo = typeof body?.segredo === "string" ? body.segredo : "";
    const monitorId = typeof body?.monitorId === "string" ? body.monitorId : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const senha = typeof body?.senha === "string" ? body.senha : "";
    if (!segredoEsperado || segredo !== segredoEsperado)
      return reply.unauthorized("Segredo de inicialização inválido");
    if (!monitorId || !EMAIL_RE.test(email) || senha.length < 12)
      return reply.badRequest(
        "Monitor, e-mail válido e senha de ao menos 12 caracteres são obrigatórios",
      );
    const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    if (!monitor?.isChefe) return reply.badRequest("A conta deve pertencer a um monitor-chefe");
    const existeConta = await prisma.contaChefe.count();
    if (existeConta > 0) return reply.conflict("A inicialização já foi concluída");
    return reply.code(201).send(
      await prisma.contaChefe.create({
        data: { monitorId, email, senhaHash: await hashPassword(senha) },
        select: { id: true, monitorId: true, email: true },
      }),
    );
  });

  app.post("/auth/contas", { preHandler: requireChief(prisma) }, async (request, reply) => {
    const body = request.body as
      { monitorId?: unknown; email?: unknown; senha?: unknown } | undefined;
    const monitorId = typeof body?.monitorId === "string" ? body.monitorId : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const senha = typeof body?.senha === "string" ? body.senha : "";
    if (!monitorId || !EMAIL_RE.test(email) || senha.length < 12)
      return reply.badRequest(
        "Monitor, e-mail válido e senha de ao menos 12 caracteres são obrigatórios",
      );
    const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    if (!monitor?.isChefe) return reply.badRequest("A conta deve pertencer a um monitor-chefe");
    return reply.code(201).send(
      await prisma.contaChefe.create({
        data: { monitorId, email, senhaHash: await hashPassword(senha) },
        select: { id: true, monitorId: true, email: true },
      }),
    );
  });

  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { email?: unknown; senha?: unknown } | undefined;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const senha = typeof body?.senha === "string" ? body.senha : "";
    if (!EMAIL_RE.test(email) || !senha) return reply.badRequest("E-mail e senha são obrigatórios");

    const conta = await prisma.contaChefe.findUnique({
      where: { email },
      include: { monitor: true },
    });
    if (!conta || !conta.monitor.isChefe || !(await verifyPassword(senha, conta.senhaHash))) {
      return reply.unauthorized("Credenciais inválidas");
    }

    const token = newSessionToken();
    const expiraEm = new Date(Date.now() + 1000 * 60 * 60 * 12);
    await prisma.sessaoChefe.create({
      data: { contaChefeId: conta.id, tokenHash: await hashToken(token), expiraEm },
    });
    return {
      token,
      expiraEm,
      chefe: { id: conta.monitorId, nome: conta.monitor.nome, email: conta.email },
    };
  });

  app.post("/auth/logout", { preHandler: requireChief(prisma) }, async (request, reply) => {
    const token = request.headers.authorization!.slice(7);
    await prisma.sessaoChefe.deleteMany({ where: { tokenHash: await hashToken(token) } });
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: requireChief(prisma) }, async (request) => ({
    chefe: request.chefe,
  }));
}
