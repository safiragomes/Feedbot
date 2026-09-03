import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { DiscordBot } from "../../src/services/discord-bot.js";

function contexto(periodoOverrides: Record<string, unknown> = {}) {
  const periodoBase = {
    id: "periodo",
    discordGuildId: "guild-1",
    discordMonitoresRoleId: "role-1",
    discordAvisosCanalId: "canal",
    ...periodoOverrides,
  };
  const periodoUpdate = vi.fn().mockResolvedValue(periodoBase);
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
      findUnique: vi.fn().mockResolvedValue(periodoBase),
    },
    monitor: {
      findMany: vi.fn().mockResolvedValue([{ discordUserId: "membro-1", nome: "Ana" }]),
    },
  } as unknown as PrismaClient;
  const bot = {
    status: vi.fn().mockResolvedValue({ status: "CONECTADO" }),
    guildsDisponiveis: vi.fn().mockReturnValue([{ id: "guild-1", nome: "Servidor 2026.2" }]),
    rolesDisponiveis: vi.fn().mockResolvedValue([{ id: "role-1", nome: "Monitores" }]),
    membrosComPapelMonitores: vi
      .fn()
      .mockResolvedValue([
        { discordUserId: "membro-1", username: "ana", displayName: "Ana", avatarUrl: null },
        { discordUserId: "membro-2", username: "bia", displayName: "Bia", avatarUrl: null },
      ]),
    canaisDisponiveis: vi.fn().mockResolvedValue([{ id: "canal", nome: "avisos" }]),
    enviarPainelRegistro: vi.fn().mockResolvedValue(undefined),
  } as unknown as DiscordBot;
  return { app: buildApp({ prisma, bot }), bot, prisma, periodoUpdate };
}

const headers = { authorization: "Bearer teste" };

describe("rotas do bot", () => {
  it("consulta o estado da conexão", async () => {
    const { app } = contexto();
    expect((await app.inject({ method: "GET", url: "/bot", headers })).json()).toMatchObject({
      sessao: { status: "CONECTADO" },
    });
    await app.close();
  });

  it("lista os servidores em que o bot está presente", async () => {
    const { app } = contexto();
    const resposta = await app.inject({ method: "GET", url: "/bot/servidores-disponiveis", headers });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([{ id: "guild-1", nome: "Servidor 2026.2" }]);
    await app.close();
  });

  it("vincula o servidor pela primeira vez sem apagar cargo/canal (não havia nenhum antes)", async () => {
    const { app, periodoUpdate } = contexto({ discordGuildId: null });
    const resposta = await app.inject({
      method: "PUT",
      url: "/bot/periodos/periodo/servidor",
      headers,
      payload: { discordGuildId: "guild-1" },
    });
    expect(resposta.statusCode).toBe(200);
    expect(periodoUpdate).toHaveBeenCalledWith({
      where: { id: "periodo" },
      data: { discordGuildId: "guild-1" },
    });
    await app.close();
  });

  it("salvar o mesmo servidor de novo não apaga cargo/canal já configurados", async () => {
    // periodoBase já tem discordGuildId: "guild-1" — reenviar o mesmo servidor não
    // pode limpar o que já estava vinculado (ex.: reabrir a tela Bot depois de já
    // ter configurado tudo não deveria desfazer nada).
    const { app, periodoUpdate } = contexto();
    const resposta = await app.inject({
      method: "PUT",
      url: "/bot/periodos/periodo/servidor",
      headers,
      payload: { discordGuildId: "guild-1" },
    });
    expect(resposta.statusCode).toBe(200);
    expect(periodoUpdate).toHaveBeenCalledWith({
      where: { id: "periodo" },
      data: { discordGuildId: "guild-1" },
    });
    await app.close();
  });

  it("trocar por um servidor diferente limpa cargo e canal do servidor anterior", async () => {
    const { app, bot, periodoUpdate } = contexto();
    vi.mocked(bot.guildsDisponiveis).mockReturnValue([
      { id: "guild-1", nome: "Servidor 2026.2" },
      { id: "guild-2", nome: "Servidor 2027.1" },
    ]);
    const resposta = await app.inject({
      method: "PUT",
      url: "/bot/periodos/periodo/servidor",
      headers,
      payload: { discordGuildId: "guild-2" },
    });
    expect(resposta.statusCode).toBe(200);
    expect(periodoUpdate).toHaveBeenCalledWith({
      where: { id: "periodo" },
      data: {
        discordGuildId: "guild-2",
        discordMonitoresRoleId: null,
        discordAvisosCanalId: null,
        discordAvisosCanalNome: null,
      },
    });
    await app.close();
  });

  it("rejeita vincular um servidor onde o bot não está presente", async () => {
    const { app } = contexto();
    const resposta = await app.inject({
      method: "PUT",
      url: "/bot/periodos/periodo/servidor",
      headers,
      payload: { discordGuildId: "guild-inexistente" },
    });
    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("lista os cargos e os canais do servidor vinculado ao período", async () => {
    const { app, bot } = contexto();
    const cargos = await app.inject({
      method: "GET",
      url: "/bot/periodos/periodo/cargos-disponiveis",
      headers,
    });
    expect(cargos.statusCode).toBe(200);
    expect(cargos.json()).toEqual([{ id: "role-1", nome: "Monitores" }]);
    expect(bot.rolesDisponiveis).toHaveBeenCalledWith("guild-1");

    const canais = await app.inject({
      method: "GET",
      url: "/bot/periodos/periodo/canais-disponiveis",
      headers,
    });
    expect(canais.statusCode).toBe(200);
    expect(canais.json()).toEqual([{ id: "canal", nome: "avisos" }]);
    expect(bot.canaisDisponiveis).toHaveBeenCalledWith("guild-1");
    await app.close();
  });

  it("recusa listar cargo/canal se o período ainda não tem servidor vinculado", async () => {
    const { app } = contexto({ discordGuildId: null });
    const resposta = await app.inject({
      method: "GET",
      url: "/bot/periodos/periodo/cargos-disponiveis",
      headers,
    });
    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("vincula um cargo ao período", async () => {
    const { app, periodoUpdate } = contexto();
    const resposta = await app.inject({
      method: "PUT",
      url: "/bot/periodos/periodo/cargo",
      headers,
      payload: { discordMonitoresRoleId: "role-1" },
    });
    expect(resposta.statusCode).toBe(200);
    expect(periodoUpdate).toHaveBeenCalledWith({
      where: { id: "periodo" },
      data: { discordMonitoresRoleId: "role-1" },
    });
    await app.close();
  });

  it("lista os membros do Discord com o cargo de monitores, marcando quem já está vinculado", async () => {
    const { app } = contexto();
    const resposta = await app.inject({
      method: "GET",
      url: "/bot/periodos/periodo/membros-monitores",
      headers,
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      { discordUserId: "membro-1", username: "ana", displayName: "Ana", avatarUrl: null, jaVinculado: "Ana" },
      { discordUserId: "membro-2", username: "bia", displayName: "Bia", avatarUrl: null, jaVinculado: null },
    ]);
    await app.close();
  });

  it("libera o membro assim que o monitor vinculado a ele é excluído (sem cache de quem já está vinculado)", async () => {
    const { app, prisma } = contexto();
    // Simula o monitor "Ana" tendo sido apagado: a consulta de vinculados não retorna
    // mais essa linha, mesmo que a lista de membros do Discord em si (essa sim
    // cacheada por um tempo) continue a mesma.
    vi.mocked(prisma.monitor.findMany).mockResolvedValueOnce([]);
    const resposta = await app.inject({
      method: "GET",
      url: "/bot/periodos/periodo/membros-monitores",
      headers,
    });
    expect(resposta.json()).toEqual([
      { discordUserId: "membro-1", username: "ana", displayName: "Ana", avatarUrl: null, jaVinculado: null },
      { discordUserId: "membro-2", username: "bia", displayName: "Bia", avatarUrl: null, jaVinculado: null },
    ]);
    await app.close();
  });

  it("recusa listar membros se o período não tem servidor ou cargo vinculado", async () => {
    const { app } = contexto({ discordMonitoresRoleId: null });
    const resposta = await app.inject({
      method: "GET",
      url: "/bot/periodos/periodo/membros-monitores",
      headers,
    });
    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("vincula, remove e reenvia o painel do canal", async () => {
    const { app, bot, periodoUpdate } = contexto();
    const vinculo = await app.inject({
      method: "PUT",
      url: "/bot/periodos/periodo/comunidade",
      headers,
      payload: { discordAvisosCanalId: "canal" },
    });
    expect(vinculo.statusCode).toBe(200);
    expect(bot.enviarPainelRegistro).toHaveBeenCalledWith("canal");
    expect(periodoUpdate).toHaveBeenCalled();
    expect(
      (await app.inject({ method: "DELETE", url: "/bot/periodos/periodo/comunidade", headers }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "POST", url: "/bot/periodos/periodo/enviar-link", headers }))
        .statusCode,
    ).toBe(204);
    await app.close();
  });

  it("rejeita canal ausente e traduz falha ao publicar o painel", async () => {
    const { app, bot } = contexto();
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/bot/periodos/periodo/comunidade",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/bot/periodos/periodo/comunidade",
          headers,
          payload: { discordAvisosCanalId: "inexistente" },
        })
      ).statusCode,
    ).toBe(400);
    vi.mocked(bot.membrosComPapelMonitores).mockRejectedValueOnce(new Error("Discord offline"));
    const resposta = await app.inject({
      method: "GET",
      url: "/bot/periodos/periodo/membros-monitores",
      headers,
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().message).toBe("Discord offline");
    await app.close();
  });
});
