import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { atualizarPrazosDaTurma } from "../src/application/gestao/gestao-service.js";
import { buscarPendenciasAtrasadas } from "../src/services/atrasos.js";

// Seed aditivo: ao contrário de seed.ts, não apaga nada. Só define PrazoLista
// (prazo de entrega de feedback) para as turmas/listas que ainda não têm um,
// usando datas no passado — isso faz os feedbacks já pendentes no banco
// aparecerem como atraso, sem inventar alunos/monitores/feedbacks novos.

function addDias(base: Date, dias: number): Date {
  const data = new Date(base);
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

async function main() {
  const hoje = new Date();
  const turmas = await prisma.turma.findMany({ include: { prazos: true } });
  const listasPorPeriodo = new Map<string, { id: string; ordem: number }[]>();

  let totalDefinidos = 0;
  for (const turma of turmas) {
    if (!listasPorPeriodo.has(turma.periodoId)) {
      const listas = await prisma.lista.findMany({
        where: { periodoId: turma.periodoId },
        orderBy: { ordem: "asc" },
        select: { id: true, ordem: true },
      });
      listasPorPeriodo.set(turma.periodoId, listas);
    }
    const listas = listasPorPeriodo.get(turma.periodoId)!;
    const jaTemPrazo = new Set(turma.prazos.map((p) => p.listaId));
    const pendentes = listas.filter((lista) => !jaTemPrazo.has(lista.id));
    if (!pendentes.length) continue;

    // Escalona: as primeiras listas do período vencem há mais tempo (bem
    // atrasadas), as últimas ainda não venceram (pendência normal, sem atraso).
    const prazos = pendentes.map((lista, i) => ({
      listaId: lista.id,
      prazoEntregaFeedback: addDias(hoje, -35 + i * 10),
    }));
    totalDefinidos += await atualizarPrazosDaTurma(prisma, turma.id, prazos);
  }

  const atrasos = await buscarPendenciasAtrasadas(prisma, hoje);
  console.log(
    `Seed de atrasos concluído: ${totalDefinidos} prazos definidos, ${atrasos.length} pendências agora atrasadas.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
