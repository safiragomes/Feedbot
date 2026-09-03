import nodemailer from "nodemailer";
import { readFile } from "node:fs/promises";
import type {
  AvisoBotEmail,
  ConviteEmail,
  EmailSender,
} from "../application/auth/convites-service.js";

export type {
  AvisoBotEmail,
  ConviteEmail,
  EmailSender,
} from "../application/auth/convites-service.js";

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
    return this.enviar({
      destinatario,
      subject: "Convite para acessar o Feedbot",
      text: `Olá, ${nome}.\n\nVocê foi convidado para acessar o Feedbot. Defina sua senha pelo link abaixo:\n\n${link}\n\nO link é pessoal, funciona uma única vez e expira em 24 horas. Se você não esperava este convite, ignore esta mensagem.`,
      html: montarHtmlConvite(nome, link),
    });
  }

  async enviarRecuperacao({ destinatario, nome, link }: ConviteEmail) {
    return this.enviar({
      destinatario,
      subject: "Redefinição de senha do Feedbot",
      text: `Olá, ${nome}.\n\nRecebemos uma solicitação para redefinir sua senha do Feedbot:\n\n${link}\n\nO link é pessoal, funciona uma única vez e expira em 1 hora. Se você não fez a solicitação, ignore esta mensagem.`,
      html: montarHtmlRecuperacao(nome, link),
    });
  }

  async enviarAvisoBot({ destinatario, nome, assunto, mensagem }: AvisoBotEmail) {
    return this.enviar({
      destinatario,
      subject: assunto,
      text: `Olá, ${nome}.\n\n${mensagem}`,
      html: montarHtmlAvisoBot(nome, mensagem),
    });
  }

  private async enviar(entrada: {
    destinatario: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const config = smtpConfig();
    const logo = await readFile(new URL("../../assets/feedbot-logo-email.jpg", import.meta.url));
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: process.env["SMTP_SECURE"] === "true",
      auth: { user: config.user, pass: config.pass },
    });
    await transport.sendMail({
      from: config.from,
      to: entrada.destinatario,
      subject: entrada.subject,
      text: entrada.text,
      html: entrada.html,
      attachments: [
        {
          filename: "feedbot-logo.jpg",
          content: logo,
          cid: "feedbot-logo",
          contentType: "image/jpeg",
          contentDisposition: "inline",
        },
      ],
    });
  }
}

export function montarHtmlRecuperacao(nome: string, link: string) {
  return montarHtmlConvite(nome, link)
    .replace("Seu acesso ao Feedbot está pronto", "Redefina sua senha do Feedbot")
    .replace(
      "Você foi convidado para acessar o painel da monitoria. Use o botão abaixo para definir sua senha e concluir o cadastro.",
      "Recebemos uma solicitação para redefinir sua senha. Use o botão abaixo para escolher uma nova senha segura.",
    )
    .replace("Definir minha senha", "Redefinir minha senha")
    .replace("expira em 24 horas", "expira em 1 hora")
    .replace(
      "Se você não esperava este convite, ignore esta mensagem. Nenhuma conta será criada sem a definição da senha.",
      "Se você não fez esta solicitação, ignore a mensagem. Sua senha atual continuará funcionando.",
    );
}

export function montarHtmlConvite(nome: string, link: string) {
  const nomeSeguro = escapeHtml(nome);
  const linkSeguro = escapeHtml(link);
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#08111f;font-family:Arial,Helvetica,sans-serif;color:#eef5ff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#08111f;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#101b2d;border:1px solid #263954;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(3,7,18,.38);">
            <tr>
              <td align="center" style="padding:30px 32px 24px;background-color:#223763;border-bottom:4px solid #20b8c4;">
                <img src="cid:feedbot-logo" width="104" height="104" alt="Feedbot" style="display:block;width:104px;height:104px;border:0;border-radius:22px;" />
                <div style="margin-top:14px;font-size:25px;line-height:30px;font-weight:700;color:#ffffff;">Feedbot</div>
                <div style="margin-top:5px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#73e1d5;">Painel da monitoria</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 40px 14px;">
                <div style="font-size:14px;line-height:22px;color:#abc0dd;">Olá, ${nomeSeguro}.</div>
                <h1 style="margin:10px 0 14px;font-size:28px;line-height:35px;color:#eef5ff;font-weight:700;">Seu acesso ao Feedbot está pronto</h1>
                <p style="margin:0;font-size:16px;line-height:26px;color:#abc0dd;">Você foi convidado para acessar o painel da monitoria. Use o botão abaixo para definir sua senha e concluir o cadastro.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 40px 28px;">
                <a href="${linkSeguro}" style="display:inline-block;min-width:220px;padding:15px 24px;border-radius:12px;background-color:#20b8c4;color:#06131d;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;">Definir minha senha</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 34px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#16253a;border-left:4px solid #7cb7f6;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:13px;line-height:21px;color:#abc0dd;"><strong style="color:#eef5ff;">Link pessoal e temporário</strong><br />Ele funciona uma única vez e expira em 24 horas. Não encaminhe este e-mail.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;background-color:#0c1626;border-top:1px solid #263954;font-size:12px;line-height:19px;color:#6f88ab;">Se você não esperava este convite, ignore esta mensagem. Nenhuma conta será criada sem a definição da senha.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function montarHtmlAvisoBot(nome: string, mensagem: string) {
  const nomeSeguro = escapeHtml(nome);
  const mensagemSegura = escapeHtml(mensagem).replaceAll("\n", "<br />");
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#08111f;font-family:Arial,Helvetica,sans-serif;color:#eef5ff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#08111f;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#101b2d;border:1px solid #263954;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(3,7,18,.38);">
            <tr>
              <td align="center" style="padding:30px 32px 24px;background-color:#223763;border-bottom:4px solid #20b8c4;">
                <img src="cid:feedbot-logo" width="104" height="104" alt="Feedbot" style="display:block;width:104px;height:104px;border:0;border-radius:22px;" />
                <div style="margin-top:14px;font-size:25px;line-height:30px;font-weight:700;color:#ffffff;">Feedbot</div>
                <div style="margin-top:5px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#73e1d5;">Status do bot</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 40px 34px;">
                <div style="font-size:14px;line-height:22px;color:#abc0dd;">Olá, ${nomeSeguro}.</div>
                <p style="margin:14px 0 0;font-size:16px;line-height:26px;color:#eef5ff;">${mensagemSegura}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;background-color:#0c1626;border-top:1px solid #263954;font-size:12px;line-height:19px;color:#6f88ab;">Este é um aviso automático do Feedbot para quem administra a conexão com o Discord.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
