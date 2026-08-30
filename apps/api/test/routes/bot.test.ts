import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { WhatsAppBot } from "../../src/services/whatsapp-bot.js";

function contexto() {
  const periodoUpdate = vi.fn().mockResolvedValue({ id: "periodo", whatsappAvisosId: "grupo" });
  const prisma = {
    sessaoChefe: {
      findUnique: vi.fn().mockResolvedValue({
        expiraEm: new Date(Date.now() + 60_000),
        contaChefeId: "conta",
        contaChefe: {
          email: "chefe@feedbot.test",
          monitorId: "monitor",
          monitor: { isChefe: true, status: "ATIVO" },
        },
      }),
    },
    periodo: {
      update: periodoUpdate,
      findUnique: vi.fn().mockResolvedValue({ id: "periodo", whatsappAvisosId: "grupo" }),
    },
  } as unknown as PrismaClient;
  const bot = {
    status: vi.fn().mockResolvedValue({ status: "CONECTADO" }),
    qrAtual: vi.fn().mockReturnValue("qr"),
    possuiCredenciaisSalvas: vi.fn().mockResolvedValue(true),
    conectar: vi.fn().mockResolvedValue(undefined),
    desconectar: vi.fn().mockResolvedValue(undefined),
    desvincular: vi.fn().mockResolvedValue(undefined),
    comunidadesDisponiveis: vi.fn().mockResolvedValue([{ id: "grupo", nome: "Avisos" }]),
    enviarLinkDeAcesso: vi.fn().mockResolvedValue({ link: "https://wa.me/teste" }),
  } as unknown as WhatsAppBot;
  return { app: buildApp({ prisma, bot }), bot, periodoUpdate };
}

const headers = { authorization: "Bearer teste" };

describe("rotas do bot", () => {
  it("consulta estado, conecta e desconecta", async () => {
    const { app, bot } = contexto();
    expect((await app.inject({ method: "GET", url: "/bot", headers })).json()).toMatchObject({
      sessao: { status: "CONECTADO" },
      qr: "qr",
      credenciaisSalvas: true,
    });
    expect((await app.inject({ method: "POST", url: "/bot/conectar", headers })).statusCode).toBe(
      202,
    );
    expect(
      (await app.inject({ method: "POST", url: "/bot/desconectar", headers })).statusCode,
    ).toBe(204);
    expect(bot.conectar).toHaveBeenCalledOnce();
    expect(bot.desconectar).toHaveBeenCalledOnce();
    expect(
      (await app.inject({ method: "POST", url: "/bot/desvincular", headers })).statusCode,
    ).toBe(204);
    expect(bot.desvincular).toHaveBeenCalledOnce();
    await app.close();
  });

  it("vincula, remove e reenvia o link da comunidade", async () => {
    const { app, bot, periodoUpdate } = contexto();
    const vinculo = await app.inject({
      method: "PUT",
      url: "/bot/periodos/periodo/comunidade",
      headers,
      payload: { whatsappAvisosId: "grupo" },
    });
    expect(vinculo.statusCode).toBe(200);
    expect(bot.enviarLinkDeAcesso).toHaveBeenCalledWith("grupo");
    expect(periodoUpdate).toHaveBeenCalled();
    expect(
      (await app.inject({ method: "DELETE", url: "/bot/periodos/periodo/comunidade", headers }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "POST", url: "/bot/periodos/periodo/enviar-link", headers }))
        .statusCode,
    ).toBe(200);
    await app.close();
  });

  it("rejeita comunidade ausente e traduz falha de listagem", async () => {
    const { app, bot } = contexto();
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/bot/periodos/periodo/comunidade",
          headers,
          payload: { whatsappAvisosId: "inexistente" },
        })
      ).statusCode,
    ).toBe(400);
    vi.mocked(bot.comunidadesDisponiveis).mockRejectedValueOnce(new Error("WhatsApp offline"));
    const resposta = await app.inject({
      method: "GET",
      url: "/bot/comunidades-disponiveis",
      headers,
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().message).toBe("WhatsApp offline");
    await app.close();
  });
});
