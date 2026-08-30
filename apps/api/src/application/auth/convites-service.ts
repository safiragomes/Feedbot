import { hashPassword, hashToken, newSessionToken } from "../../auth/password.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface ConviteEmail {
  destinatario: string;
  nome: string;
  link: string;
}

export interface EmailSender {
  enviarConvite(convite: ConviteEmail): Promise<void>;
}

export type ConviteErroCodigo =
  | "MONITOR_INELEGIVEL"
  | "MONITOR_JA_POSSUI_ACESSO"
  | "EMAIL_JA_POSSUI_ACESSO"
  | "CONVITE_INVALIDO"
  | "ENVIO_FALHOU";

export class ConviteErro extends Error {
  constructor(
    readonly codigo: ConviteErroCodigo,
    readonly origem?: unknown,
  ) {
    super(codigo);
  }
}

const DURACAO_CONVITE_MS = 24 * 60 * 60 * 1_000;

export async function enviarConviteContaChefe(
  prisma: PrismaClient,
  emailSender: EmailSender,
  entrada: { monitorId: string; email: string; appUrl: URL },
) {
  const [monitor, contaComEmail] = await Promise.all([
    prisma.monitor.findUnique({
      where: { id: entrada.monitorId },
      include: { contaChefe: true },
    }),
    prisma.contaChefe.findUnique({ where: { email: entrada.email } }),
  ]);
  if (!monitor?.isChefe || monitor.status !== "ATIVO") {
    throw new ConviteErro("MONITOR_INELEGIVEL");
  }
  if (monitor.contaChefe) throw new ConviteErro("MONITOR_JA_POSSUI_ACESSO");
  if (contaComEmail) throw new ConviteErro("EMAIL_JA_POSSUI_ACESSO");

  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  const expiraEm = new Date(Date.now() + DURACAO_CONVITE_MS);
  const convite = await prisma.conviteContaChefe.upsert({
    where: { monitorId: entrada.monitorId },
    create: { monitorId: entrada.monitorId, email: entrada.email, tokenHash, expiraEm },
    update: {
      email: entrada.email,
      tokenHash,
      expiraEm,
      usadoEm: null,
      criadoEm: new Date(),
    },
  });

  const link = new URL(entrada.appUrl);
  link.hash = new URLSearchParams({ convite: token }).toString();
  try {
    await emailSender.enviarConvite({
      destinatario: entrada.email,
      nome: monitor.nome,
      link: link.toString(),
    });
  } catch (error) {
    // Só desfaz a gravação criada por esta chamada. Um reenvio concorrente pode já
    // ter substituído o token e não deve ser apagado por uma falha anterior.
    await prisma.conviteContaChefe.deleteMany({ where: { id: convite.id, tokenHash } });
    throw new ConviteErro("ENVIO_FALHOU", error);
  }
  return { email: entrada.email, expiraEm };
}

export async function concluirConviteContaChefe(
  prisma: PrismaClient,
  entrada: { token: string; senha: string },
) {
  const tokenHash = await hashToken(entrada.token);
  const convite = await prisma.conviteContaChefe.findUnique({
    where: { tokenHash },
    include: { monitor: true },
  });
  if (
    !convite ||
    convite.usadoEm ||
    convite.expiraEm <= new Date() ||
    !convite.monitor.isChefe ||
    convite.monitor.status !== "ATIVO"
  ) {
    throw new ConviteErro("CONVITE_INVALIDO");
  }

  const senhaHash = await hashPassword(entrada.senha);
  try {
    await prisma.$transaction(async (tx) => {
      const reservado = await tx.conviteContaChefe.updateMany({
        where: { id: convite.id, usadoEm: null, expiraEm: { gt: new Date() } },
        data: { usadoEm: new Date() },
      });
      if (reservado.count !== 1) throw new ConviteErro("CONVITE_INVALIDO");
      await tx.contaChefe.create({
        data: { monitorId: convite.monitorId, email: convite.email, senhaHash },
      });
    });
  } catch (error) {
    if (error instanceof ConviteErro) throw error;
    throw error;
  }
}
