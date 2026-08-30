import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  hashToken,
  newSessionToken,
  verifyPassword,
} from "../../auth/password.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { EmailSender } from "./convites-service.js";

export class SenhaErro extends Error {
  constructor(readonly codigo: "SENHA_ATUAL_INVALIDA" | "TOKEN_INVALIDO") {
    super(codigo);
  }
}

export interface RecuperacaoLogger {
  info(contexto: Record<string, unknown>, mensagem: string): void;
  error(contexto: Record<string, unknown>, mensagem: string): void;
}

export async function alterarSenha(
  prisma: PrismaClient,
  entrada: { contaId: string; senhaAtual: string; novaSenha: string; sessaoTokenHash: string },
) {
  const conta = await prisma.contaChefe.findUnique({ where: { id: entrada.contaId } });
  const valida = await verifyPassword(entrada.senhaAtual, conta?.senhaHash ?? DUMMY_PASSWORD_HASH);
  if (!conta || !valida) throw new SenhaErro("SENHA_ATUAL_INVALIDA");
  const senhaHash = await hashPassword(entrada.novaSenha);
  await prisma.$transaction([
    prisma.contaChefe.update({ where: { id: conta.id }, data: { senhaHash } }),
    prisma.sessaoChefe.deleteMany({
      where: { contaChefeId: conta.id, tokenHash: { not: entrada.sessaoTokenHash } },
    }),
  ]);
}

export async function solicitarRecuperacaoSenha(
  prisma: PrismaClient,
  emailSender: EmailSender,
  entrada: { email: string; appUrl: URL },
  logger: RecuperacaoLogger,
) {
  const conta = await prisma.contaChefe.findUnique({
    where: { email: entrada.email },
    include: { monitor: true },
  });
  if (!conta || !conta.monitor.isChefe || conta.monitor.status !== "ATIVO") return;
  void (async () => {
    const token = newSessionToken();
    const tokenHash = await hashToken(token);
    const expiraEm = new Date(Date.now() + 60 * 60 * 1_000);
    await prisma.$transaction([
      prisma.recuperacaoSenha.deleteMany({ where: { contaChefeId: conta.id } }),
      prisma.recuperacaoSenha.create({ data: { contaChefeId: conta.id, tokenHash, expiraEm } }),
    ]);
    const link = new URL(entrada.appUrl);
    link.hash = new URLSearchParams({ recuperacao: token }).toString();
    try {
      await emailSender.enviarRecuperacao({
        destinatario: conta.email,
        nome: conta.monitor.nome,
        link: link.toString(),
      });
      logger.info({}, "e-mail de recuperação de senha enviado");
    } catch (error) {
      await prisma.recuperacaoSenha.deleteMany({ where: { tokenHash } });
      logger.error({ err: error }, "falha ao enviar recuperação de senha");
    }
  })().catch((error) => logger.error({ err: error }, "falha ao preparar recuperação de senha"));
}

export async function concluirRecuperacaoSenha(
  prisma: PrismaClient,
  entrada: { token: string; novaSenha: string },
) {
  const tokenHash = await hashToken(entrada.token);
  const recuperacao = await prisma.recuperacaoSenha.findUnique({
    where: { tokenHash },
    include: { contaChefe: { include: { monitor: true } } },
  });
  if (
    !recuperacao ||
    recuperacao.usadoEm ||
    recuperacao.expiraEm <= new Date() ||
    !recuperacao.contaChefe.monitor.isChefe ||
    recuperacao.contaChefe.monitor.status !== "ATIVO"
  )
    throw new SenhaErro("TOKEN_INVALIDO");
  const senhaHash = await hashPassword(entrada.novaSenha);
  await prisma.$transaction(async (tx) => {
    const reservado = await tx.recuperacaoSenha.updateMany({
      where: { id: recuperacao.id, usadoEm: null, expiraEm: { gt: new Date() } },
      data: { usadoEm: new Date() },
    });
    if (reservado.count !== 1) throw new SenhaErro("TOKEN_INVALIDO");
    await tx.contaChefe.update({ where: { id: recuperacao.contaChefeId }, data: { senhaHash } });
    await tx.sessaoChefe.deleteMany({ where: { contaChefeId: recuperacao.contaChefeId } });
  });
}
