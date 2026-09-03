import type { PrismaClient } from "../../generated/prisma/client.js";
import { calcularSemana } from "../../domain/semana.js";
import { semanasCobertasPorMonitorNaDupla } from "../../domain/monitorSemana.js";

/**
 * Um monitor pertence a no máximo uma dupla (Monitor.duplaId), que tem no máximo 2
 * monitores. O papel de cada aluno da dupla (semana A ou B) é definido por ALUNO:
 * Aluno.monitorSemanaAId escolhe qual dos 2 monitores é o da semana A; o outro é
 * implicitamente o da semana B (não armazenado). Por isso o fluxo não pode filtrar
 * "as listas do monitor" de forma fixa: primeiro descobre em quais listas ele tem
 * pelo menos um aluno elegível (para a etapa de escolher a lista); depois, já com a
 * lista escolhida, filtra os alunos elegíveis especificamente para aquela lista.
 *
 * A decisão de quais semanas um monitor cobre por aluno (incluindo o caso de dupla
 * com só 1 monitor) mora em domain/monitorSemana.ts — a mesma regra usada por
 * services/feedback.ts, pra não ter duas implementações que podem divergir.
 *
 * Transporte-agnóstico: usado por services/discord-bot.ts sem depender de nenhum
 * transporte específico.
 */
export async function alunosDoMonitor(prisma: PrismaClient, monitorId: string) {
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor?.duplaId) return { alunos: [], monitorIds: [] };
  const [alunos, monitores] = await Promise.all([
    prisma.aluno.findMany({
      where: { duplaId: monitor.duplaId },
      include: { turma: true },
      orderBy: { nome: "asc" },
    }),
    prisma.monitor.findMany({
      where: { duplaId: monitor.duplaId },
      select: { id: true },
    }),
  ]);
  return { alunos, monitorIds: monitores.map(({ id }) => id) };
}

export async function listasComSemana(prisma: PrismaClient, periodoId: string) {
  const listas = await prisma.lista.findMany({
    where: { periodoId },
    orderBy: { ordem: "asc" },
  });
  return listas.map((lista, index) => ({
    lista,
    semana: calcularSemana({ posicaoLista: index + 1, semanaOverride: lista.semanaOverride }),
  }));
}

export async function listasPermitidas(prisma: PrismaClient, monitorId: string, periodoId: string) {
  const [{ alunos, monitorIds }, comSemana] = await Promise.all([
    alunosDoMonitor(prisma, monitorId),
    listasComSemana(prisma, periodoId),
  ]);
  const papeisPossiveis = new Set<"A" | "B">();
  for (const aluno of alunos)
    for (const semana of semanasCobertasPorMonitorNaDupla({ ...aluno, monitorIds }, monitorId))
      papeisPossiveis.add(semana);
  return comSemana.filter(({ semana }) => papeisPossiveis.has(semana)).map(({ lista }) => lista);
}

export async function alunosElegiveis(
  prisma: PrismaClient,
  monitorId: string,
  listaId: string,
  periodoId: string,
) {
  const [{ alunos, monitorIds }, comSemana] = await Promise.all([
    alunosDoMonitor(prisma, monitorId),
    listasComSemana(prisma, periodoId),
  ]);
  const semanaLista = comSemana.find(({ lista }) => lista.id === listaId)?.semana;
  if (!semanaLista) return [];
  return alunos.filter((aluno) =>
    semanasCobertasPorMonitorNaDupla({ ...aluno, monitorIds }, monitorId).has(semanaLista),
  );
}
