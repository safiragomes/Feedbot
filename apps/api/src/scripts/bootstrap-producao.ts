import "dotenv/config";
import { BootstrapErro, criarPrimeiraContaChefe } from "../application/auth/bootstrap-service.js";
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
  if (!whatsappNumero) throw new Error("BOOTSTRAP_CHIEF_WHATSAPP deve ser um número válido");

  const { conta, resultado } = await criarPrimeiraContaChefe(prisma, {
    email,
    senha,
    prepararMonitor: async (tx) => {
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
      return { id: monitor.id, resultado: { periodo: periodo.nome, chefe: nome } };
    },
  });

  console.info("Inicialização concluída", { ...resultado, email: conta.email });
}

main()
  .catch((error) => {
    const mensagem =
      error instanceof BootstrapErro && error.codigo === "JA_CONCLUIDO"
        ? "A inicialização já foi concluída; nenhuma alteração foi feita"
        : error instanceof BootstrapErro
          ? "BOOTSTRAP_CHIEF_EMAIL ou BOOTSTRAP_CHIEF_PASSWORD inválido"
          : error instanceof Error
            ? error.message
            : error;
    console.error(mensagem);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
