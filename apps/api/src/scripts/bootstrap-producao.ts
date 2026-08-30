import "dotenv/config";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../db/client.js";
import { normalizarWhatsapp } from "../domain/telefone.js";

function obrigatoria(nome: string) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`${nome} é obrigatória`);
  return valor;
}

function dataObrigatoria(nome: string) {
  const valor = obrigatoria(nome);
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error(`${nome} deve ser uma data ISO válida`);
  return data;
}

async function main() {
  const nome = obrigatoria("BOOTSTRAP_CHIEF_NAME");
  const email = obrigatoria("BOOTSTRAP_CHIEF_EMAIL").toLowerCase();
  const senha = obrigatoria("BOOTSTRAP_CHIEF_PASSWORD");
  const whatsappNumero = normalizarWhatsapp(obrigatoria("BOOTSTRAP_CHIEF_WHATSAPP"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("BOOTSTRAP_CHIEF_EMAIL deve ser um e-mail válido");
  }
  if (senha.length < 8 || senha.length > 256) {
    throw new Error("BOOTSTRAP_CHIEF_PASSWORD deve ter entre 8 e 256 caracteres");
  }
  if (!whatsappNumero) throw new Error("BOOTSTRAP_CHIEF_WHATSAPP deve ser um número válido");

  const senhaHash = await hashPassword(senha);
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(937421))
      SELECT true AS acquired FROM lock
    `;
    if ((await tx.contaChefe.count()) > 0) {
      throw new Error("A inicialização já foi concluída; nenhuma alteração foi feita");
    }

    const periodoIdExistente = process.env["BOOTSTRAP_PERIOD_ID"]?.trim();
    const periodo = periodoIdExistente
      ? await tx.periodo.findUnique({ where: { id: periodoIdExistente } })
      : await tx.periodo.create({
          data: {
            nome: obrigatoria("BOOTSTRAP_PERIOD_NAME"),
            dataInicio: dataObrigatoria("BOOTSTRAP_PERIOD_START"),
            dataFim: dataObrigatoria("BOOTSTRAP_PERIOD_END"),
            dataReferenciaRodizio: dataObrigatoria("BOOTSTRAP_ROTATION_REFERENCE"),
            ativo: true,
          },
        });
    if (!periodo) throw new Error("BOOTSTRAP_PERIOD_ID não corresponde a um período existente");

    const monitor = await tx.monitor.create({
      data: { nome, whatsappNumero, isChefe: true, periodoId: periodo.id },
    });
    const conta = await tx.contaChefe.create({
      data: { monitorId: monitor.id, email, senhaHash },
      select: { email: true },
    });
    return { periodo: periodo.nome, chefe: nome, email: conta.email };
  });

  console.info("Inicialização concluída", resultado);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
