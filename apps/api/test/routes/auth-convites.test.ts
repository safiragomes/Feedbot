import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";
import { prisma } from "../../src/db/client.js";
import type { ConviteEmail, EmailSender } from "../../src/services/email.js";

describe("convites de acesso", () => {
  const tokenSessao = newSessionToken();
  const sufixo = randomUUID();
  const emailsEnviados: ConviteEmail[] = [];
  const emailSender: EmailSender = {
    async enviarConvite(convite) {
      emailsEnviados.push(convite);
    },
  };
  const app = buildApp({ prisma, emailSender });
  let periodoId: string;
  let convidadoId: string;

  beforeAll(async () => {
    process.env["APP_URL"] = "http://localhost:5173";
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Convites ${sufixo}`,
        dataInicio: new Date("2026-08-01T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;
    const administrador = await prisma.monitor.create({
      data: {
        nome: "Chefe administrador",
        whatsappNumero: `+5581${sufixo.replaceAll("-", "").slice(0, 8)}`,
        isChefe: true,
        periodoId,
      },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: administrador.id,
        email: `admin-${sufixo}@feedbot.test`,
        senhaHash: await hashPassword("senha-administrador-123"),
      },
    });
    await prisma.sessaoChefe.create({
      data: {
        contaChefeId: conta.id,
        tokenHash: await hashToken(tokenSessao),
        expiraEm: new Date(Date.now() + 60_000),
      },
    });
    const convidado = await prisma.monitor.create({
      data: {
        nome: "Chefe convidado",
        whatsappNumero: `+5582${sufixo.replaceAll("-", "").slice(0, 8)}`,
        isChefe: false,
        periodoId,
      },
    });
    convidadoId = convidado.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.conviteContaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("envia link de uso único e permite ao chefe definir a própria senha", async () => {
    const email = `convidado-${sufixo}@feedbot.test`;
    const promocao = await app.inject({
      method: "PATCH",
      url: `/monitores/${convidadoId}`,
      headers: { authorization: `Bearer ${tokenSessao}` },
      payload: { isChefe: true },
    });
    expect(promocao.statusCode).toBe(200);
    expect(promocao.json().isChefe).toBe(true);

    const envio = await app.inject({
      method: "POST",
      url: "/auth/convites",
      headers: { authorization: `Bearer ${tokenSessao}` },
      payload: { monitorId: convidadoId, email },
    });
    expect(envio.statusCode).toBe(201);
    expect(emailsEnviados).toHaveLength(1);
    const linkConvite = new URL(emailsEnviados[0]!.link);
    const tokenConvite = new URLSearchParams(linkConvite.hash.slice(1)).get("convite");
    expect(tokenConvite).toBeTruthy();
    const persistido = await prisma.conviteContaChefe.findUnique({
      where: { monitorId: convidadoId },
    });
    expect(persistido?.tokenHash).toBe(await hashToken(tokenConvite!));
    expect(persistido?.tokenHash).not.toBe(tokenConvite);

    const conclusao = await app.inject({
      method: "POST",
      url: "/auth/convites/concluir",
      payload: { token: tokenConvite, senha: "minha-senha-segura-123" },
    });
    expect(conclusao.statusCode).toBe(204);
    expect(await prisma.contaChefe.findUnique({ where: { email } })).toMatchObject({
      monitorId: convidadoId,
    });

    const reutilizacao = await app.inject({
      method: "POST",
      url: "/auth/convites/concluir",
      payload: { token: tokenConvite, senha: "outra-senha-segura-456" },
    });
    expect(reutilizacao.statusCode).toBe(400);
  });
});
