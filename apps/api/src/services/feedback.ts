import type { PrismaClient } from "../generated/prisma/client.js";
import { calcularSemana } from "../domain/semana.js";

export interface NovoFeedback {
  alunoId: string;
  monitorId: string;
  listaId: string;
  qtdQuestoesPontuadas: number;
  questoesIa?: number[];
  questoesPlagio?: Array<{ numeroQuestao: number; alunoEnvolvidoId: string }>;
  questoesProibicao?: number[];
}

function questoesValidas(questoes: number[], total: number) {
  return questoes.every((questao) => Number.isInteger(questao) && questao >= 1 && questao <= total);
}

export async function criarFeedback(prisma: PrismaClient, entrada: NovoFeedback) {
  const questoesIa = [...new Set(entrada.questoesIa ?? [])];
  const questoesProibicao = [...new Set(entrada.questoesProibicao ?? [])];
  const questoesPlagio = entrada.questoesPlagio ?? [];
  const [aluno, monitor, lista] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: entrada.alunoId } }),
    prisma.monitor.findUnique({ where: { id: entrada.monitorId } }),
    prisma.lista.findUnique({ where: { id: entrada.listaId }, include: { periodo: true } }),
  ]);
  if (!aluno || !monitor || !lista) throw new Error("Aluno, monitor ou lista não encontrado");
  if (monitor.duplaId !== aluno.duplaId) throw new Error("Monitor só pode registrar feedback da própria dupla");
  if (monitor.periodoId !== lista.periodoId) throw new Error("Lista e monitor devem pertencer ao mesmo período");
  if (!Number.isInteger(entrada.qtdQuestoesPontuadas) || entrada.qtdQuestoesPontuadas < 0 || entrada.qtdQuestoesPontuadas > lista.qtdQuestoesTotal) {
    throw new Error("Quantidade de questões corretas inválida");
  }
  if (!questoesValidas([...questoesIa, ...questoesProibicao, ...questoesPlagio.map((item) => item.numeroQuestao)], lista.qtdQuestoesTotal)) {
    throw new Error("Número de questão inválido");
  }
  if (questoesPlagio.some((item) => item.alunoEnvolvidoId === aluno.id)) throw new Error("Aluno não pode ser envolvido em plágio próprio");
  const envolvidos = await prisma.aluno.findMany({ where: { id: { in: questoesPlagio.map((item) => item.alunoEnvolvidoId) } } });
  if (envolvidos.length !== new Set(questoesPlagio.map((item) => item.alunoEnvolvidoId)).size) throw new Error("Aluno envolvido em plágio não encontrado");

  return prisma.feedback.create({
    data: {
      alunoId: aluno.id,
      monitorId: monitor.id,
      listaId: lista.id,
      duplaId: aluno.duplaId,
      semana: calcularSemana({ hoje: new Date(), dataReferenciaRodizio: lista.periodo.dataReferenciaRodizio, semanaOverride: lista.semanaOverride }),
      qtdQuestoesPontuadas: entrada.qtdQuestoesPontuadas,
      usouIa: questoesIa.length > 0,
      plagiou: questoesPlagio.length > 0,
      usouProibicao: questoesProibicao.length > 0,
      questoesIa: { create: questoesIa.map((numeroQuestao) => ({ numeroQuestao })) },
      questoesPlagio: { create: questoesPlagio.map(({ numeroQuestao, alunoEnvolvidoId }) => ({ numeroQuestao, alunoEnvolvidoId })) },
      questoesProibicao: { create: questoesProibicao.map((numeroQuestao) => ({ numeroQuestao })) },
    },
    include: { aluno: { include: { turma: true } }, lista: true },
  });
}
