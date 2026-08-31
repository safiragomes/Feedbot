import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { google } from "googleapis";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireChief } from "../auth/require-chief.js";
import {
  clienteOAuth,
  criptografarToken,
  descriptografarToken,
  oauthGoogleConfigurado,
} from "../services/google-oauth.js";
import { webOrigins } from "../config/runtime.js";

export function googleOAuthRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get(
    "/google/oauth/iniciar",
    { preHandler: requireChief(prisma) },
    async (_request, reply) => {
      if (!oauthGoogleConfigurado())
        return reply.serviceUnavailable("OAuth do Google ainda não foi configurado no servidor");
      const state = randomBytes(24).toString("base64url");
      reply.setCookie("feedbot_google_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env["GOOGLE_OAUTH_REDIRECT_URI"]?.startsWith("https://") ?? false,
        // Path relativo à API interna não bate com o path externo visto pelo navegador
        // quando um proxy (nginx/Caddy) expõe a rota sob um prefixo como /api — usar "/"
        // garante que o cookie volte independentemente de prefixo.
        path: "/",
        maxAge: 600,
      });
      return reply.redirect(
        clienteOAuth().generateAuthUrl({
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: true,
          state,
          scope: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/userinfo.email",
          ],
        }),
      );
    },
  );

  app.get("/google/oauth/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code || !state || state !== request.cookies["feedbot_google_state"])
      return reply.badRequest("Retorno OAuth inválido");
    const cliente = clienteOAuth();
    const { tokens } = await cliente.getToken(code);
    if (!tokens.refresh_token)
      return reply.badRequest("O Google não forneceu acesso offline; tente conectar novamente");
    cliente.setCredentials(tokens);
    const usuario = await google.oauth2({ version: "v2", auth: cliente }).userinfo.get();
    if (!usuario.data.email) return reply.badRequest("Não foi possível identificar a conta Google");
    await prisma.conexaoGoogle.upsert({
      where: { id: "principal" },
      create: {
        id: "principal",
        email: usuario.data.email,
        refreshTokenCriptografado: criptografarToken(tokens.refresh_token),
      },
      update: {
        email: usuario.data.email,
        refreshTokenCriptografado: criptografarToken(tokens.refresh_token),
        conectadoEm: new Date(),
      },
    });
    reply.clearCookie("feedbot_google_state", { path: "/" });
    return reply.redirect(`${webOrigins()[0]}/?google=conectado`);
  });

  app.delete(
    "/google/oauth/conexao",
    { preHandler: requireChief(prisma) },
    async (_request, reply) => {
      const conexao = await prisma.conexaoGoogle.findUnique({ where: { id: "principal" } });
      if (conexao) {
        const token = descriptografarToken(conexao.refreshTokenCriptografado);
        await clienteOAuth()
          .revokeToken(token)
          .catch(() => undefined);
      }
      await prisma.conexaoGoogle.deleteMany({ where: { id: "principal" } });
      return reply.code(204).send();
    },
  );
}
