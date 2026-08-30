import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { Prisma } from "./generated/prisma/client.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { authRoutes } from "./routes/auth.js";
import { botRoutes } from "./routes/bot.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { healthRoutes } from "./routes/health.js";
import { managementRoutes } from "./routes/management.js";
import { privacyRoutes } from "./routes/privacy.js";
import { WhatsAppBot } from "./services/whatsapp-bot.js";
import { GoogleSheetsSync } from "./services/google-sheets.js";
import { planilhaRoutes } from "./routes/planilha.js";
import { googleOAuthRoutes } from "./routes/google-oauth.js";
import { ambienteProducao, confiarNoProxy, webOrigins } from "./config/runtime.js";
import { SmtpEmailSender, type EmailSender } from "./services/email.js";

export function buildApp(
  options: {
    prisma?: PrismaClient;
    bot?: WhatsAppBot;
    sheets?: GoogleSheetsSync;
    emailSender?: EmailSender;
  } = {},
) {
  const trustProxy = confiarNoProxy();
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    trustProxy,
    logger: ambienteProducao()
      ? {
          level: "info",
          redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
        }
      : false,
  });

  if (trustProxy)
    app.log.warn(
      "TRUST_PROXY=true: use apenas atrás de um proxy reverso confiável; cabeçalhos encaminhados afetam o rate limit",
    );

  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer")
      .header("permissions-policy", "camera=(), microphone=(), geolocation=()")
      .header("content-security-policy", "default-src 'none'; frame-ancestors 'none'")
      .header("cross-origin-resource-policy", "same-site");
    if (ambienteProducao())
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    return payload;
  });

  app.register(cors, {
    origin: webOrigins(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });
  app.register(cookie);
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(sensible);
  app.register(healthRoutes);
  if (options.prisma) {
    app.register(authRoutes, {
      prisma: options.prisma,
      emailSender: options.emailSender ?? new SmtpEmailSender(),
    });
    app.register(managementRoutes, options.prisma);
    app.register(privacyRoutes, options.prisma);
    const sheets = options.sheets ?? new GoogleSheetsSync();
    feedbackRoutes(app, options.prisma, sheets);
    planilhaRoutes(app, options.prisma, sheets);
    googleOAuthRoutes(app, options.prisma);
    if (options.bot) botRoutes(app, options.prisma, options.bot);
  }
  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2025"].includes(error.code)
    ) {
      return reply.code(error.code === "P2025" ? 404 : 409).send({
        statusCode: error.code === "P2025" ? 404 : 409,
        error: "Conflict",
        message: "Operação incompatível com os dados relacionados",
      });
    }
    // Deliberate 4xx errors (reply.badRequest/unauthorized/notFound/conflict) carry a safe,
    // intentional message — only mask genuinely unexpected failures to avoid leaking internals.
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode?: unknown }).statusCode
        : undefined;
    if (typeof statusCode === "number" && statusCode < 500) {
      return reply.send(error);
    }
    request.log.error({ err: error }, "erro inesperado no servidor");
    return reply.code(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Erro inesperado no servidor",
    });
  });

  return app;
}
