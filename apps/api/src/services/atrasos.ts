import type { PrismaClient } from "../generated/prisma/client.js";
import { calcularSemana } from "../domain/semana.js";

export type PendenciaAtrasada = {
  alunoId: string;
  alunoNome: string;
  listaId: string;
  listaNome: string;
  monitorId: string;
  monitorNome: string;
  whatsappNumero: string;
  duplaId: string;
  prazoEntregaFeedback: Date;
};

/** Feedbacks esperados cujo prazo efetivo (exceção individual ou turma) venceu. */
export async function buscarPendenciasAtrasadas(prisma: PrismaClient, agora = new Date()) {
  const alunos = await prisma.aluno.findMany({
    include: {
      turma: true,
      dupla: { include: { monitores: { where: { status: "ATIVO" } } } },
      prazosIndividuais: true,
      feedbacks: { select: { listaId: true } },
    },
  });
  const periodos = [...new Set(alunos.map((a) => a.turma.periodoId))];
  const listas = await prisma.lista.findMany({
    where: { periodoId: { in: periodos } },
    include: { prazos: true },
    orderBy: { ordem: "asc" },
  });
  const pendencias: PendenciaAtrasada[] = [];
  for (const aluno of alunos) {
    if (!aluno.duplaId || !aluno.dupla) continue;
    const entregues = new Set(aluno.feedbacks.map((f) => f.listaId));
    const listasPeriodo = listas.filter((l) => l.periodoId === aluno.turma.periodoId);
    for (const lista of listasPeriodo) {
      if (entregues.has(lista.id)) continue;
      const prazo =
        aluno.prazosIndividuais.find((p) => p.listaId === lista.id)?.prazoEntregaFeedback ??
        lista.prazos.find((p) => p.turmaId === aluno.turmaId)?.prazoEntregaFeedback;
      if (!prazo || prazo >= agora) continue;
      const semana = calcularSemana({
        posicaoLista: lista.ordem,
        semanaOverride: lista.semanaOverride,
      });
      const monitor =
        semana === "A"
          ? (aluno.dupla.monitores.find((m) => m.id === aluno.monitorSemanaAId) ??
            (aluno.dupla.monitores.length === 1 ? aluno.dupla.monitores[0] : undefined))
          : (aluno.dupla.monitores.find((m) => m.id !== aluno.monitorSemanaAId) ??
            (aluno.dupla.monitores.length === 1 ? aluno.dupla.monitores[0] : undefined));
      if (!monitor) continue;
      pendencias.push({
        alunoId: aluno.id,
        alunoNome: aluno.nome,
        listaId: lista.id,
        listaNome: lista.nome,
        monitorId: monitor.id,
        monitorNome: monitor.nome,
        whatsappNumero: monitor.whatsappNumero,
        duplaId: aluno.duplaId,
        prazoEntregaFeedback: prazo,
      });
    }
  }
  return pendencias;
}
