import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { hashPassword } from "../../auth/password.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class BootstrapErro extends Error {
  constructor(readonly codigo: "CREDENCIAIS_INVALIDAS" | "JA_CONCLUIDO") {
    super(codigo);
  }
}

export async function criarPrimeiraContaChefe<T>(
  prisma: PrismaClient,
  entrada: {
    email: string;
    senha: string;
    prepararMonitor: (tx: Prisma.TransactionClient) => Promise<{ id: string; resultado: T }>;
  },
) {
  const email = entrada.email.trim().toLowerCase();
  if (
    !EMAIL_RE.test(email) ||
    email.length > 254 ||
    entrada.senha.length < 8 ||
    entrada.senha.length > 256
  )
    throw new BootstrapErro("CREDENCIAIS_INVALIDAS");
  const senhaHash = await hashPassword(entrada.senha);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(937421))
      SELECT true AS acquired FROM lock
    `;
    if ((await tx.contaChefe.count()) > 0) throw new BootstrapErro("JA_CONCLUIDO");
    const monitor = await entrada.prepararMonitor(tx);
    const conta = await tx.contaChefe.create({
      data: { monitorId: monitor.id, email, senhaHash },
      select: { id: true, monitorId: true, email: true },
    });
    return { conta, resultado: monitor.resultado };
  });
}
