import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import {
  hashPassword,
  hashToken,
  newSessionToken,
  verifyPassword,
} from "../../src/auth/password.js";
import { prisma } from "../../src/db/client.js";
import type { ConviteEmail, EmailSender } from "../../src/services/email.js";

describe("alteração e recuperação de senha", () => {
  const sufixo = randomUUID();
  const email = `senha-${sufixo}@feedbot.test`;
  const tokenSessao = newSessionToken();
  const recuperacoes: ConviteEmail[] = [];
  const emailSender: EmailSender = {
    async enviarConvite() {},
    async enviarRecuperacao(mensagem) {
      recuperacoes.push(mensagem);
    },
    async enviarAvisoBot() {},
  };
  const app = buildApp({ prisma, emailSender });
  let periodoId: string;
  let contaId: string;

  beforeAll(async () => {
    process.env["APP_URL"] = "http://localhost:5173";
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Senhas ${sufixo}`,
        dataInicio: new Date("2026-08-01Z"),
        dataFim: new Date("2026-12-01Z"),
        dataReferenciaRodizio: new Date("2026-08-03Z"),
      },
    });
    periodoId = periodo.id;
    const monitor = await prisma.monitor.create({
      data: {
        nome: "Chefe Senha",
        whatsappNumero: `+5583${sufixo.replaceAll("-", "").slice(0, 8)}`,
        isChefe: true,
        periodoId,
      },
    });
    const conta = await prisma.contaChefe.create({
      data: { monitorId: monitor.id, email, senhaHash: await hashPassword("senha-antiga") },
    });
    contaId = conta.id;
    await prisma.sessaoChefe.create({
      data: {
        contaChefeId: conta.id,
        tokenHash: await hashToken(tokenSessao),
        expiraEm: new Date(Date.now() + 60_000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.recuperacaoSenha.deleteMany({ where: { contaChefeId: contaId } });
    await prisma.contaChefe.delete({ where: { id: contaId } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("exige a senha atual e altera mantendo a sessão corrente", async () => {
    const incorreta = await app.inject({
      method: "PATCH",
      url: "/auth/senha",
      headers: { authorization: `Bearer ${tokenSessao}` },
      payload: { senhaAtual: "errada", novaSenha: "senha-nova" },
    });
    expect(incorreta.statusCode).toBe(400);
    const resposta = await app.inject({
      method: "PATCH",
      url: "/auth/senha",
      headers: { authorization: `Bearer ${tokenSessao}` },
      payload: { senhaAtual: "senha-antiga", novaSenha: "senha-nova" },
    });
    expect(resposta.statusCode).toBe(204);
    const conta = await prisma.contaChefe.findUniqueOrThrow({ where: { id: contaId } });
    expect(await verifyPassword("senha-nova", conta.senhaHash)).toBe(true);
    expect(await prisma.sessaoChefe.count({ where: { contaChefeId: contaId } })).toBe(1);
  });

  it("não revela e-mail, envia token único e revoga sessões ao redefinir", async () => {
    const desconhecido = await app.inject({
      method: "POST",
      url: "/auth/senha/solicitar-recuperacao",
      payload: { email: `nao-existe-${sufixo}@feedbot.test` },
    });
    expect(desconhecido.statusCode).toBe(204);
    expect(recuperacoes).toHaveLength(0);
    const solicitacao = await app.inject({
      method: "POST",
      url: "/auth/senha/solicitar-recuperacao",
      payload: { email },
    });
    expect(solicitacao.statusCode).toBe(204);
    expect(recuperacoes).toHaveLength(1);
    const token = new URLSearchParams(new URL(recuperacoes[0]!.link).hash.slice(1)).get(
      "recuperacao",
    )!;
    expect(
      (await prisma.recuperacaoSenha.findUnique({ where: { tokenHash: await hashToken(token) } }))
        ?.tokenHash,
    ).not.toBe(token);
    const conclusao = await app.inject({
      method: "POST",
      url: "/auth/senha/redefinir",
      payload: { token, novaSenha: "senha-final" },
    });
    expect(conclusao.statusCode).toBe(204);
    expect(await prisma.sessaoChefe.count({ where: { contaChefeId: contaId } })).toBe(0);
    const reutilizacao = await app.inject({
      method: "POST",
      url: "/auth/senha/redefinir",
      payload: { token, novaSenha: "outra-senha" },
    });
    expect(reutilizacao.statusCode).toBe(400);
  });
});
