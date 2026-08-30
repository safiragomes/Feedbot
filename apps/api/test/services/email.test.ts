import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import nodemailer from "nodemailer";
import { SmtpEmailSender } from "../../src/services/email.js";

const ambienteOriginal = { ...process.env };

describe("SmtpEmailSender", () => {
  afterEach(() => {
    process.env = { ...ambienteOriginal };
    vi.clearAllMocks();
  });

  it("exige configuração completa antes de enviar", async () => {
    delete process.env["SMTP_HOST"];
    await expect(
      new SmtpEmailSender().enviarConvite({ destinatario: "a@b.test", nome: "A", link: "x" }),
    ).rejects.toThrow("Envio de e-mail não configurado");
  });

  it("remove espaços da senha de app e escapa nome e link no HTML", async () => {
    Object.assign(process.env, {
      SMTP_HOST: "smtp.example",
      SMTP_PORT: "465",
      SMTP_USER: "feedbot@example.test",
      SMTP_PASS: "abcd efgh",
      SMTP_SECURE: "true",
      EMAIL_FROM: "Feedbot <feedbot@example.test>",
    });
    sendMail.mockResolvedValue(undefined);

    await new SmtpEmailSender().enviarConvite({
      destinatario: "chefe@example.test",
      nome: "Chefe <Teste>",
      link: "https://example.test/#convite=a&b",
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
        auth: { user: "feedbot@example.test", pass: "abcdefgh" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "chefe@example.test",
        html: expect.stringContaining("Chefe &lt;Teste&gt;"),
      }),
    );
    expect(sendMail.mock.calls[0]![0].html).toContain("a&amp;b");
  });
});
