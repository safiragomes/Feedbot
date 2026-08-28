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

export function buildApp(
  options: { prisma?: PrismaClient; bot?: WhatsAppBot; sheets?: GoogleSheetsSync } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer")
      .header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });

  app.register(cors, {
    origin: process.env["WEB_ORIGIN"]?.split(",") ?? ["http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });
  app.register(cookie);
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(sensible);
  app.register(healthRoutes);
  if (options.prisma) {
    app.register(authRoutes, options.prisma);
    app.register(managementRoutes, options.prisma);
    app.register(privacyRoutes, options.prisma);
    feedbackRoutes(app, options.prisma, options.sheets ?? new GoogleSheetsSync());
    if (options.bot) botRoutes(app, options.prisma, options.bot);
  }
  app.setErrorHandler((error, _request, reply) => {
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
    console.error(error);
    return reply.code(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Erro inesperado no servidor",
    });
  });

  return app;
}
