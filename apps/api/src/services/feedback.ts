import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { calcularSemana } from "../domain/semana.js";
import { monitorDaSemana } from "../domain/monitorSemana.js";

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

// Monitor B de um aluno não é armazenado: é sempre "o outro monitor da dupla" do
// aluno (uma dupla tem no máximo 2 monitores — ver Monitor.duplaId no schema). A
// decisão em si mora em domain/monitorSemana.ts; aqui só resolve o "outro monitor"
// via banco — e só quando a semana pedida é B, já que a semana A nunca depende dele.
async function monitorEsperadoDaSemana(
  prisma: PrismaClient,
  aluno: { duplaId: string; monitorSemanaAId: string | null },
  semana: "A" | "B",
) {
  if (semana === "A") return monitorDaSemana({ ...aluno, outroMonitorId: null }, "A");
  const outroMonitor = aluno.monitorSemanaAId
    ? await prisma.monitor.findFirst({
        where: { duplaId: aluno.duplaId, id: { not: aluno.monitorSemanaAId } },
      })
    : null;
  return monitorDaSemana({ ...aluno, outroMonitorId: outroMonitor?.id ?? null }, "B");
}

export async function posicaoDaLista(prisma: PrismaClient, listaId: string, periodoId: string) {
  const listas = await prisma.lista.findMany({
    where: { periodoId },
    orderBy: { ordem: "asc" },
    select: { id: true },
  });
  const indice = listas.findIndex((item) => item.id === listaId);
  if (indice < 0) throw new Error("Lista não encontrada no período");
  return indice + 1;
}

export async function criarFeedback(prisma: PrismaClient, entrada: NovoFeedback) {
  const questoesIa = [...new Set(entrada.questoesIa ?? [])];
  const questoesProibicao = [...new Set(entrada.questoesProibicao ?? [])];
  const questoesPlagio = entrada.questoesPlagio ?? [];
  const [aluno, monitor, lista] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: entrada.alunoId }, include: { turma: true } }),
    prisma.monitor.findUnique({ where: { id: entrada.monitorId } }),
    prisma.lista.findUnique({ where: { id: entrada.listaId } }),
  ]);
  if (!aluno || !monitor || !lista) throw new Error("Aluno, monitor ou lista não encontrado");
  if (!aluno.duplaId) throw new Error("Atribua o aluno a uma dupla antes de registrar feedback");
  if (aluno.turma.periodoId !== lista.periodoId)
    throw new Error("Aluno e lista devem pertencer ao mesmo período");
  if (monitor.periodoId !== lista.periodoId)
    throw new Error("Lista e monitor devem pertencer ao mesmo período");
  if (monitor.status !== "ATIVO") throw new Error("Monitor inativo não pode registrar feedback");
  if (
    !Number.isInteger(entrada.qtdQuestoesPontuadas) ||
    entrada.qtdQuestoesPontuadas < 0 ||
    entrada.qtdQuestoesPontuadas > lista.qtdQuestoesTotal
  ) {
    throw new Error("Quantidade de questões corretas inválida");
  }
  if (
    questoesIa.length > lista.qtdQuestoesTotal ||
    questoesProibicao.length > lista.qtdQuestoesTotal ||
    questoesPlagio.length > lista.qtdQuestoesTotal
  )
    throw new Error("Quantidade de ocorrências excede o total de questões da lista");
  if (
    !questoesValidas(
      [...questoesIa, ...questoesProibicao, ...questoesPlagio.map((item) => item.numeroQuestao)],
      lista.qtdQuestoesTotal,
    )
  ) {
    throw new Error("Número de questão inválido");
  }
  if (questoesPlagio.some((item) => item.alunoEnvolvidoId === aluno.id))
    throw new Error("Aluno não pode ser envolvido em plágio próprio");
  const envolvidos = await prisma.aluno.findMany({
    where: { id: { in: questoesPlagio.map((item) => item.alunoEnvolvidoId) } },
    include: { turma: true },
  });
  if (envolvidos.length !== new Set(questoesPlagio.map((item) => item.alunoEnvolvidoId)).size)
    throw new Error("Aluno envolvido em plágio não encontrado");
  if (envolvidos.some((envolvido) => envolvido.turma.periodoId !== lista.periodoId))
    throw new Error("Aluno envolvido em plágio deve pertencer ao mesmo período");

  const posicaoLista = await posicaoDaLista(prisma, lista.id, lista.periodoId);
  const semana = calcularSemana({ posicaoLista, semanaOverride: lista.semanaOverride });
  const monitorEsperado = await monitorEsperadoDaSemana(
    prisma,
    { duplaId: aluno.duplaId, monitorSemanaAId: aluno.monitorSemanaAId },
    semana,
  );
  if (monitorEsperado !== monitor.id) {
    throw new Error(
      `Esta lista é da semana ${semana} deste aluno, responsabilidade de outro monitor`,
    );
  }

  try {
    return await prisma.feedback.create({
      data: {
        alunoId: aluno.id,
        monitorId: monitor.id,
        listaId: lista.id,
        duplaId: aluno.duplaId,
        semana,
        qtdQuestoesPontuadas: entrada.qtdQuestoesPontuadas,
        usouIa: questoesIa.length > 0,
        plagiou: questoesPlagio.length > 0,
        usouProibicao: questoesProibicao.length > 0,
        questoesIa: { create: questoesIa.map((numeroQuestao) => ({ numeroQuestao })) },
        questoesPlagio: {
          create: questoesPlagio.map(({ numeroQuestao, alunoEnvolvidoId }) => ({
            numeroQuestao,
            alunoEnvolvidoId,
          })),
        },
        questoesProibicao: {
          create: questoesProibicao.map((numeroQuestao) => ({ numeroQuestao })),
        },
      },
      include: { aluno: { include: { turma: true } }, lista: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Já existe feedback registrado para este aluno nesta lista", {
        cause: error,
      });
    }
    throw error;
  }
}
