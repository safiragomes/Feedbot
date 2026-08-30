import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  hashPassword,
  hashToken,
  DUMMY_PASSWORD_HASH,
  newSessionToken,
  timingSafeEqualString,
  verifyPassword,
} from "../auth/password.js";
import { requireChief, SESSION_COOKIE, sessionToken } from "../auth/require-chief.js";
import {
  concluirConviteContaChefe,
  ConviteErro,
  enviarConviteContaChefe,
  type EmailSender,
} from "../application/auth/convites-service.js";
import {
  alterarSenha,
  concluirRecuperacaoSenha,
  SenhaErro,
  solicitarRecuperacaoSenha,
} from "../application/auth/senhas-service.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;

function credenciaisValidas(email: string, senha: string) {
  return (
    EMAIL_RE.test(email) &&
    email.length <= MAX_EMAIL_LENGTH &&
    senha.length >= MIN_PASSWORD_LENGTH &&
    senha.length <= MAX_PASSWORD_LENGTH
  );
}

export function authRoutes(
  app: FastifyInstance,
  { prisma, emailSender }: { prisma: PrismaClient; emailSender: EmailSender },
) {
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
          "Monitor, e-mail válido e senha entre 8 e 256 caracteres são obrigatórios",
        );
      const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
      if (!monitor?.isChefe || monitor.status !== "ATIVO")
        return reply.badRequest("A conta deve pertencer a um monitor-chefe ativo");
      const senhaHash = await hashPassword(senha);
      const conta = await prisma.$transaction(async (tx) => {
        // Serializa tentativas de bootstrap. Sem o lock, duas requisições simultâneas
        // poderiam observar count=0 e criar dois primeiros administradores.
        await tx.$queryRaw`
          WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(937421))
          SELECT true AS acquired FROM lock
        `;
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

  app.post(
    "/auth/convites",
    {
      preHandler: requireChief(prisma),
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const body = request.body as { monitorId?: unknown; email?: unknown } | undefined;
      const monitorId = typeof body?.monitorId === "string" ? body.monitorId : "";
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!monitorId || !EMAIL_RE.test(email) || email.length > MAX_EMAIL_LENGTH) {
        return reply.badRequest("Monitor e e-mail válido são obrigatórios");
      }
      const appUrl = process.env["APP_URL"];
      if (!appUrl) return reply.serviceUnavailable("URL pública do Feedbot não configurada");
      let baseUrl: URL;
      try {
        baseUrl = new URL(appUrl);
      } catch {
        return reply.serviceUnavailable("URL pública do Feedbot inválida");
      }

      try {
        const convite = await enviarConviteContaChefe(prisma, emailSender, {
          monitorId,
          email,
          appUrl: baseUrl,
        });
        return reply.code(201).send(convite);
      } catch (error) {
        if (!(error instanceof ConviteErro)) throw error;
        if (error.codigo === "MONITOR_INELEGIVEL")
          return reply.badRequest("O convite deve pertencer a um monitor-chefe ativo");
        if (error.codigo === "MONITOR_JA_POSSUI_ACESSO")
          return reply.conflict("Este chefe já possui acesso");
        if (error.codigo === "EMAIL_JA_POSSUI_ACESSO")
          return reply.conflict("Este e-mail já possui acesso");
        request.log.error({ err: error.origem }, "falha ao enviar convite");
        return reply.serviceUnavailable("Não foi possível enviar o convite por e-mail");
      }
    },
  );

  app.post(
    "/auth/convites/concluir",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = request.body as { token?: unknown; senha?: unknown } | undefined;
      const token = typeof body?.token === "string" ? body.token : "";
      const senha = typeof body?.senha === "string" ? body.senha : "";
      if (!token || senha.length < MIN_PASSWORD_LENGTH || senha.length > MAX_PASSWORD_LENGTH) {
        return reply.badRequest("Convite ou senha inválidos");
      }
      try {
        await concluirConviteContaChefe(prisma, { token, senha });
      } catch (error) {
        if (error instanceof ConviteErro && error.codigo === "CONVITE_INVALIDO") {
          return reply.badRequest("Convite inválido ou expirado");
        }
        throw error;
      }
      return reply.code(204).send();
    },
  );

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
      const senhaValida = await verifyPassword(senha, conta?.senhaHash ?? DUMMY_PASSWORD_HASH);
      if (!conta || !conta.monitor.isChefe || conta.monitor.status !== "ATIVO" || !senhaValida) {
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

  app.post(
    "/auth/senha/solicitar-recuperacao",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = request.body as { email?: unknown } | undefined;
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL_LENGTH)
        return reply.badRequest("Informe um e-mail válido");
      const appUrl = process.env["APP_URL"];
      if (!appUrl) return reply.serviceUnavailable("URL pública do Feedbot não configurada");
      try {
        const resultado = await solicitarRecuperacaoSenha(prisma, emailSender, {
          email,
          appUrl: new URL(appUrl),
        });
        request.log.info(
          { recuperacaoEnviada: resultado === "ENVIADA" },
          "solicitação de recuperação de senha processada",
        );
      } catch (error) {
        if (error instanceof TypeError)
          return reply.serviceUnavailable("URL pública do Feedbot inválida");
        if (error instanceof SenhaErro && error.codigo === "ENVIO_FALHOU")
          request.log.error({ err: error }, "falha ao enviar recuperação de senha");
      }
      return reply.code(204).send();
    },
  );

  app.post(
    "/auth/senha/redefinir",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = request.body as { token?: unknown; novaSenha?: unknown } | undefined;
      const token = typeof body?.token === "string" ? body.token : "";
      const novaSenha = typeof body?.novaSenha === "string" ? body.novaSenha : "";
      if (
        !token ||
        novaSenha.length < MIN_PASSWORD_LENGTH ||
        novaSenha.length > MAX_PASSWORD_LENGTH
      )
        return reply.badRequest("Link ou senha inválidos");
      try {
        await concluirRecuperacaoSenha(prisma, { token, novaSenha });
      } catch (error) {
        if (error instanceof SenhaErro && error.codigo === "TOKEN_INVALIDO")
          return reply.badRequest("Link de recuperação inválido ou expirado");
        throw error;
      }
      return reply.code(204).send();
    },
  );

  app.patch(
    "/auth/senha",
    {
      preHandler: requireChief(prisma),
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const body = request.body as { senhaAtual?: unknown; novaSenha?: unknown } | undefined;
      const senhaAtual = typeof body?.senhaAtual === "string" ? body.senhaAtual : "";
      const novaSenha = typeof body?.novaSenha === "string" ? body.novaSenha : "";
      if (
        !senhaAtual ||
        novaSenha.length < MIN_PASSWORD_LENGTH ||
        novaSenha.length > MAX_PASSWORD_LENGTH
      )
        return reply.badRequest("A nova senha deve ter entre 8 e 256 caracteres");
      try {
        await alterarSenha(prisma, {
          contaId: request.chefe!.contaId,
          senhaAtual,
          novaSenha,
          sessaoTokenHash: await hashToken(sessionToken(request)!),
        });
      } catch (error) {
        if (error instanceof SenhaErro && error.codigo === "SENHA_ATUAL_INVALIDA")
          return reply.badRequest("Senha atual incorreta");
        throw error;
      }
      return reply.code(204).send();
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
