import { calcularPrazoEfetivo } from "../domain/prazo.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { calcularSemana } from "../domain/semana.js";
import { monitorDaSemana } from "../domain/monitorSemana.js";

export type PendenciaAtrasada = {
  alunoId: string;
  alunoNome: string;
  listaId: string;
  listaNome: string;
  monitorId: string;
  monitorNome: string;
  whatsappNumero: string | null;
  duplaId: string;
  prazoEntregaFeedback: Date;
};

/** Feedbacks esperados ainda não entregues e que possuem prazo configurado. */
export async function buscarFeedbacksPendentesComPrazo(prisma: PrismaClient) {
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
    include: { prazos: true, prazosGrupo: true },
    orderBy: { ordem: "asc" },
  });
  const pendencias: PendenciaAtrasada[] = [];
  for (const aluno of alunos) {
    if (!aluno.duplaId || !aluno.dupla) continue;
    const entregues = new Set(aluno.feedbacks.map((f) => f.listaId));
    const listasPeriodo = listas.filter((l) => l.periodoId === aluno.turma.periodoId);
    for (const [indice, lista] of listasPeriodo.entries()) {
      if (entregues.has(lista.id)) continue;
      const prazo = calcularPrazoEfetivo({
        prazoIndividual: aluno.prazosIndividuais.find((p) => p.listaId === lista.id)
          ?.prazoEntregaFeedback,
        prazoGrupo: aluno.grupoPrazoId
          ? lista.prazosGrupo.find((p) => p.grupoPrazoId === aluno.grupoPrazoId)
              ?.prazoEntregaFeedback
          : null,
        prazoTurma: lista.prazos.find((p) => p.turmaId === aluno.turmaId)?.prazoEntregaFeedback,
      });
      if (!prazo) continue;
      // posicaoLista precisa ser a posição da lista entre as do período (1, 2, 3...),
      // não o valor bruto de `ordem` — que fica com buracos depois que uma lista é
      // excluída (ordem não é renumerado). Mesmo cálculo de posicaoDaLista em
      // services/feedback.ts, senão a semana A/B diverge da usada no lançamento real.
      const semana = calcularSemana({
        posicaoLista: indice + 1,
        semanaOverride: lista.semanaOverride,
      });
      // Mesma regra de domain/monitorSemana.ts usada em services/feedback.ts: o
      // "outro monitor" é sempre relativo ao monitorSemanaAId do aluno, nunca "o
      // primeiro da dupla" — senão um aluno sem monitorSemanaAId definido acaba
      // atribuindo o atraso a um monitor que não tem nenhum aluno vinculado a ele.
      const outroMonitorId = aluno.monitorSemanaAId
        ? (aluno.dupla.monitores.find((m) => m.id !== aluno.monitorSemanaAId)?.id ?? null)
        : null;
      const monitorId = monitorDaSemana(
        { monitorSemanaAId: aluno.monitorSemanaAId, outroMonitorId },
        semana,
      );
      const monitor = monitorId ? aluno.dupla.monitores.find((m) => m.id === monitorId) : undefined;
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

/** Feedbacks esperados cujo prazo efetivo (exceção individual, grupo ou turma) venceu. */
export async function buscarPendenciasAtrasadas(prisma: PrismaClient, agora = new Date()) {
  const pendencias = await buscarFeedbacksPendentesComPrazo(prisma);
  return pendencias.filter((pendencia) => pendencia.prazoEntregaFeedback < agora);
}
