import nodemailer from "nodemailer";
import type { ConviteEmail, EmailSender } from "../application/auth/convites-service.js";

export type { ConviteEmail, EmailSender } from "../application/auth/convites-service.js";

function smtpConfig() {
  const host = process.env["SMTP_HOST"];
  const port = Number(process.env["SMTP_PORT"]);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"]?.replace(/\s/g, "");
  const from = process.env["EMAIL_FROM"];
  if (!host || !Number.isInteger(port) || !user || !pass || !from) {
    throw new Error("Envio de e-mail não configurado");
  }
  return { host, port, user, pass, from };
}

export class SmtpEmailSender implements EmailSender {
  async enviarConvite({ destinatario, nome, link }: ConviteEmail) {
    const config = smtpConfig();
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: process.env["SMTP_SECURE"] === "true",
      auth: { user: config.user, pass: config.pass },
    });
    await transport.sendMail({
      from: config.from,
      to: destinatario,
      subject: "Convite para acessar o Feedbot",
      text: `Olá, ${nome}.\n\nVocê foi convidado para acessar o Feedbot. Defina sua senha pelo link abaixo:\n\n${link}\n\nO link é pessoal, funciona uma única vez e expira em 24 horas. Se você não esperava este convite, ignore esta mensagem.`,
      html: `<p>Olá, ${escapeHtml(nome)}.</p><p>Você foi convidado para acessar o Feedbot.</p><p><a href="${escapeHtml(link)}">Definir minha senha</a></p><p>O link é pessoal, funciona uma única vez e expira em 24 horas. Se você não esperava este convite, ignore esta mensagem.</p>`,
    });
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
