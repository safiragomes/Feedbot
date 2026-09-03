import type { PrismaClient } from "../generated/prisma/client.js";
import { calcularSemana } from "../domain/semana.js";
import { monitorDaSemana } from "../domain/monitorSemana.js";

export interface NovoFeedback {
  alunoId: string;
  monitorId: string;
  listaId: string;
  qtdQuestoesPontuadas: number;
  // Aluno não entregou/respondeu a lista — distinto de ter respondido e acertado 0.
  // Quando true, zera pontuação e ocorrências independente do que for passado, e a
  // planilha grava "F" em vez de um número (ver GoogleSheetsSync.sincronizarFeedback).
  faltou?: boolean;
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

// Usado pelo lançamento manual do chefe pela interface: quando dá pra calcular o
// monitor responsável pela rotação semana A/B (mesma regra do bot), usa esse. Aluno
// sem dupla, ou sem rotação resolvível, não tem "responsável" possível — nesse caso
// o próprio chefe que está lançando o feedback assume (a palavra do chefe vale mais
// que a rotação automática, que nem se aplica sem dupla).
export async function resolverMonitorResponsavel(
  prisma: PrismaClient,
  alunoId: string,
  listaId: string,
  chefeMonitorId: string,
) {
  // Editar um feedback já existente não deve trocar de quem é o crédito — senão
  // um chefe corrigindo um detalhe de outro chefe (ex.: número de questões) acabaria
  // reatribuindo a autoria pra si mesmo sem querer.
  const existente = await prisma.feedback.findUnique({
    where: { alunoId_listaId: { alunoId, listaId } },
    select: { monitorId: true },
  });
  // Se o monitor que registrou originalmente já foi excluído (monitorId virou null
  // via SetNull), não há mais quem creditar — cai no mesmo fallback do chefe usado
  // abaixo quando não dá pra determinar o responsável.
  if (existente) return existente.monitorId ?? chefeMonitorId;

  const [aluno, lista] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId } }),
    prisma.lista.findUnique({ where: { id: listaId } }),
  ]);
  if (!aluno || !lista) throw new Error("Aluno ou lista não encontrado");
  if (!aluno.duplaId) return chefeMonitorId;
  const posicaoLista = await posicaoDaLista(prisma, lista.id, lista.periodoId);
  const semana = calcularSemana({ posicaoLista, semanaOverride: lista.semanaOverride });
  const monitorId = await monitorEsperadoDaSemana(
    prisma,
    { duplaId: aluno.duplaId, monitorSemanaAId: aluno.monitorSemanaAId },
    semana,
  );
  if (!monitorId) return chefeMonitorId;
  // Monitor calculado pode existir mas estar inativo (ex.: saiu da monitoria) — nesse
  // caso não há para quem creditar pela rotação, então o chefe assume também.
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor || monitor.status !== "ATIVO") return chefeMonitorId;
  return monitorId;
}

export async function criarFeedback(prisma: PrismaClient, entrada: NovoFeedback) {
  const faltou = entrada.faltou ?? false;
  const questoesIa = faltou ? [] : [...new Set(entrada.questoesIa ?? [])];
  const questoesProibicao = faltou ? [] : [...new Set(entrada.questoesProibicao ?? [])];
  const questoesPlagio = faltou ? [] : (entrada.questoesPlagio ?? []);
  const qtdQuestoesPontuadas = faltou ? 0 : entrada.qtdQuestoesPontuadas;
  const [aluno, monitor, lista] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: entrada.alunoId }, include: { turma: true } }),
    prisma.monitor.findUnique({ where: { id: entrada.monitorId } }),
    prisma.lista.findUnique({ where: { id: entrada.listaId } }),
  ]);
  if (!aluno || !monitor || !lista) throw new Error("Aluno, monitor ou lista não encontrado");
  if (aluno.turma.periodoId !== lista.periodoId)
    throw new Error("Aluno e lista devem pertencer ao mesmo período");
  if (monitor.periodoId !== lista.periodoId)
    throw new Error("Lista e monitor devem pertencer ao mesmo período");
  if (monitor.status !== "ATIVO") throw new Error("Monitor inativo não pode registrar feedback");
  if (
    !Number.isInteger(qtdQuestoesPontuadas) ||
    qtdQuestoesPontuadas < 0 ||
    qtdQuestoesPontuadas > lista.qtdQuestoesTotal
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
  // Sem dupla não há rotação semana A/B pra validar contra — o feedback é aceito
  // como está (ver resolverMonitorResponsavel, que já credita o próprio chefe
  // nesse caso).
  if (aluno.duplaId) {
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
  }

  return prisma.feedback.upsert({
    where: { alunoId_listaId: { alunoId: aluno.id, listaId: lista.id } },
    create: {
      alunoId: aluno.id,
      monitorId: monitor.id,
      monitorNome: monitor.nome,
      listaId: lista.id,
      duplaId: aluno.duplaId,
      semana,
      qtdQuestoesPontuadas,
      faltou,
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
    update: {
      monitorId: monitor.id,
      monitorNome: monitor.nome,
      duplaId: aluno.duplaId,
      semana,
      qtdQuestoesPontuadas,
      faltou,
      usouIa: questoesIa.length > 0,
      plagiou: questoesPlagio.length > 0,
      usouProibicao: questoesProibicao.length > 0,
      sincronizadoPlanilha: false,
      questoesIa: {
        deleteMany: {},
        create: questoesIa.map((numeroQuestao) => ({ numeroQuestao })),
      },
      questoesPlagio: {
        deleteMany: {},
        create: questoesPlagio.map(({ numeroQuestao, alunoEnvolvidoId }) => ({
          numeroQuestao,
          alunoEnvolvidoId,
        })),
      },
      questoesProibicao: {
        deleteMany: {},
        create: questoesProibicao.map((numeroQuestao) => ({ numeroQuestao })),
      },
    },
    include: { aluno: { include: { turma: true } }, lista: true },
  });
}
