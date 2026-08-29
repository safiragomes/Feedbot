import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { google } from "googleapis";
import type { PrismaClient } from "../generated/prisma/client.js";

function chave() {
  const valor = process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(valor))
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY deve ser base64 canônico");
  const buffer = Buffer.from(valor, "base64");
  if (buffer.length !== 32)
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em base64");
  return buffer;
}

export function criptografarToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  const conteudo = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), conteudo].map((item) => item.toString("base64url")).join(".");
}

export function descriptografarToken(valor: string) {
  const partes = valor.split(".");
  if (partes.length !== 3 || partes.some((item) => !/^[A-Za-z0-9_-]+$/.test(item)))
    throw new Error("Token Google criptografado inválido");
  const [iv, tag, conteudo] = partes.map((item) => Buffer.from(item!, "base64url"));
  if (iv?.length !== 12 || tag?.length !== 16 || !conteudo?.length)
    throw new Error("Token Google criptografado inválido");
  const decipher = createDecipheriv("aes-256-gcm", chave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString("utf8");
}

export function clienteOAuth() {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  const redirectUri = process.env["GOOGLE_OAUTH_REDIRECT_URI"];
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("OAuth do Google não está configurado no servidor");
  const url = new URL(redirectUri);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/google/oauth/callback")
  )
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI inválida");
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function oauthGoogleConfigurado() {
  try {
    clienteOAuth();
    chave();
    return true;
  } catch {
    return false;
  }
}

export async function autenticacaoGoogle(prisma: PrismaClient) {
  const conexao = await prisma.conexaoGoogle.findUnique({ where: { id: "principal" } });
  if (!conexao) return null;
  const cliente = clienteOAuth();
  cliente.setCredentials({
    refresh_token: descriptografarToken(conexao.refreshTokenCriptografado),
  });
  return cliente;
}
