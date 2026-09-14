import type { PrismaClient } from "../../generated/prisma/client.js";
import { MonitorStatus } from "../../generated/prisma/enums.js";
import { NUM_LISTAS_POR_PERIODO, QTD_QUESTOES_PADRAO } from "../../domain/lista.js";
import { TURMAS_FIXAS } from "../../domain/turma.js";

export class GestaoErro extends Error {
  constructor(
    readonly codigo: "DADOS_INVALIDOS" | "NAO_ENCONTRADO" | "CONFLITO",
    message: string,
  ) {
    super(message);
  }
}

export async function criarPeriodo(
  prisma: PrismaClient,
  entrada: {
    nome: string;
    dataInicio: Date;
    dataFim: Date;
    dataReferenciaRodizio: Date;
    ativo: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const periodo = await tx.periodo.create({ data: entrada });
    await tx.lista.createMany({
      data: Array.from({ length: NUM_LISTAS_POR_PERIODO }, (_, indice) => ({
        periodoId: periodo.id,
        nome: `Lista ${indice + 1}`,
        qtdQuestoesTotal: QTD_QUESTOES_PADRAO,
        ordem: indice + 1,
      })),
    });
    await tx.turma.createMany({
      data: TURMAS_FIXAS.map((nome) => ({
        periodoId: periodo.id,
        nome,
        nomeAbaPlanilha: nome,
      })),
    });
    return periodo;
  });
}

export async function validarMonitorDupla(
  prisma: PrismaClient,
  periodoId: string,
  duplaId: string | null | undefined,
  monitorIdAtual?: string,
) {
  if (!duplaId) return;
  const dupla = await prisma.dupla.findUnique({
    where: { id: duplaId },
    include: { grupoRevisao: true },
  });
  if (!dupla) throw new GestaoErro("DADOS_INVALIDOS", "Dupla não encontrada");
  if (dupla.grupoRevisao.periodoId !== periodoId) {
    throw new GestaoErro("DADOS_INVALIDOS", "Dupla deve pertencer ao período do monitor");
  }
  const quantidade = await prisma.monitor.count({
    where: { duplaId, ...(monitorIdAtual ? { id: { not: monitorIdAtual } } : {}) },
  });
  if (quantidade >= 2) throw new GestaoErro("DADOS_INVALIDOS", "Esta dupla já tem 2 monitores");
}

// O unique constraint do banco já impede duas linhas com o mesmo número, mas o erro
// que ele gera (P2002) vira uma mensagem genérica pro usuário. Checar antes permite
// dizer de quem é o número, que é a informação que realmente importa pra resolver.
// Mantido por compatibilidade histórica com whatsappNumero (campo não obrigatório
// desde a migração para o Discord) — verificarDiscordDisponivel é o equivalente
// usado pela nova identidade do bot.
export async function verificarWhatsappDisponivel(
  prisma: PrismaClient,
  whatsappNumero: string,
  ignorarMonitorId?: string,
) {
  const existente = await prisma.monitor.findUnique({ where: { whatsappNumero } });
  if (existente && existente.id !== ignorarMonitorId) {
    throw new GestaoErro(
      "CONFLITO",
      `Esse número de WhatsApp já está cadastrado para ${existente.nome}`,
    );
  }
}

export async function verificarDiscordDisponivel(
  prisma: PrismaClient,
  discordUserId: string,
  ignorarMonitorId?: string,
) {
  const existente = await prisma.monitor.findUnique({ where: { discordUserId } });
  if (existente && existente.id !== ignorarMonitorId) {
    throw new GestaoErro(
      "CONFLITO",
      `Essa conta do Discord já está vinculada a ${existente.nome}`,
    );
  }
}

export async function atualizarMonitor(
  prisma: PrismaClient,
  monitorId: string,
  entrada: {
    nome?: string;
    whatsappNumero?: string;
    discordUserId?: string;
    discordUsername?: string;
    discordDisplayName?: string;
    discordAvatarUrl?: string;
    discordVinculadoEm?: Date;
    isChefe?: boolean;
    status?: MonitorStatus;
    duplaId?: string | null;
  },
) {
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) throw new GestaoErro("NAO_ENCONTRADO", "Monitor não encontrado");
  if (entrada.whatsappNumero !== undefined && entrada.whatsappNumero !== monitor.whatsappNumero) {
    await verificarWhatsappDisponivel(prisma, entrada.whatsappNumero, monitorId);
  }
  if (entrada.discordUserId !== undefined && entrada.discordUserId !== monitor.discordUserId) {
    await verificarDiscordDisponivel(prisma, entrada.discordUserId, monitorId);
  }
  if (entrada.isChefe === false && monitor.isChefe) {
    const grupos = await prisma.grupoRevisao.count({ where: { chefeId: monitor.id } });
    if (grupos > 0) {
      throw new GestaoErro(
        "DADOS_INVALIDOS",
        "Troque o chefe dos grupos vinculados antes de remover este papel",
      );
    }
  }
  if (entrada.duplaId !== undefined) {
    await validarMonitorDupla(prisma, monitor.periodoId, entrada.duplaId, monitor.id);
  }
  return prisma.$transaction(async (tx) => {
    if (entrada.duplaId !== undefined && entrada.duplaId !== monitor.duplaId) {
      await tx.aluno.updateMany({
        where: { monitorSemanaAId: monitor.id },
        data: { monitorSemanaAId: null },
      });
    }
    const atualizado = await tx.monitor.update({ where: { id: monitorId }, data: entrada });
    if (atualizado.status === MonitorStatus.INATIVO || !atualizado.isChefe) {
      await tx.sessaoChefe.deleteMany({ where: { contaChefe: { monitorId: atualizado.id } } });
    }
    return atualizado;
  });
}

export async function atualizarPrazosDaTurma(
  prisma: PrismaClient,
  turmaId: string,
  prazos: { listaId: string; prazoEntregaFeedback: Date }[],
) {
  const turma = await prisma.turma.findUnique({ where: { id: turmaId } });
  if (!turma) throw new GestaoErro("NAO_ENCONTRADO", "Turma não encontrada");
  const listaIds = [...new Set(prazos.map((prazo) => prazo.listaId))];
  const listas = await prisma.lista.findMany({ where: { id: { in: listaIds } } });
  if (
    listas.length !== listaIds.length ||
    listas.some((lista) => lista.periodoId !== turma.periodoId)
  ) {
    throw new GestaoErro("DADOS_INVALIDOS", "Todas as listas devem pertencer ao período da turma");
  }
  await prisma.$transaction(
    prazos.map((prazo) =>
      prisma.prazoLista.upsert({
        where: { listaId_turmaId: { listaId: prazo.listaId, turmaId } },
        create: { ...prazo, turmaId },
        update: { prazoEntregaFeedback: prazo.prazoEntregaFeedback },
      }),
    ),
  );
  return prazos.length;
}

export async function atualizarPrazosDoGrupo(
  prisma: PrismaClient,
  grupoPrazoId: string,
  prazos: { listaId: string; prazoEntregaFeedback: Date }[],
) {
  const grupo = await prisma.grupoPrazo.findUnique({ where: { id: grupoPrazoId } });
  if (!grupo) throw new GestaoErro("NAO_ENCONTRADO", "Grupo de prazo não encontrado");
  const listaIds = [...new Set(prazos.map((prazo) => prazo.listaId))];
  const listas = await prisma.lista.findMany({ where: { id: { in: listaIds } } });
  if (
    listas.length !== listaIds.length ||
    listas.some((lista) => lista.periodoId !== grupo.periodoId)
  ) {
    throw new GestaoErro(
      "DADOS_INVALIDOS",
      "Todas as listas devem pertencer ao período do grupo de prazo",
    );
  }
  await prisma.$transaction(
    prazos.map((prazo) =>
      prisma.prazoGrupoLista.upsert({
        where: { listaId_grupoPrazoId: { listaId: prazo.listaId, grupoPrazoId } },
        create: { ...prazo, grupoPrazoId },
        update: { prazoEntregaFeedback: prazo.prazoEntregaFeedback },
      }),
    ),
  );
  return prazos.length;
}

// Feedback é vinculado ao monitor que registrou (Feedback.monitorId), não à dupla —
// a dupla é só uma referência organizacional (quem atende quem). Por isso excluir
// grupo/dupla não é bloqueado por feedback: Feedback.duplaId é onDelete: SetNull no
// schema, então o histórico continua intacto, só perde essa referência.
export async function excluirGrupoRevisao(prisma: PrismaClient, id: string) {
  await prisma.$transaction([
    prisma.aluno.updateMany({
      where: { dupla: { grupoRevisaoId: id } },
      data: { monitorSemanaAId: null },
    }),
    prisma.grupoRevisao.delete({ where: { id } }),
  ]);
}

export async function excluirDupla(prisma: PrismaClient, id: string) {
  await prisma.$transaction([
    prisma.aluno.updateMany({ where: { duplaId: id }, data: { monitorSemanaAId: null } }),
    prisma.dupla.delete({ where: { id } }),
  ]);
}

// GrupoRevisao.chefeId é obrigatório e sem onDelete — apagar um monitor que ainda lidera
// um grupo bate no FK constraint e vira um 409 genérico do Postgres. Checa antes pra
// devolver uma mensagem que diga o que fazer, no lugar de deixar o delete falhar.
async function impedirExclusaoDeChefeDeGrupo(prisma: PrismaClient, ids: string[]) {
  const grupos = await prisma.grupoRevisao.count({ where: { chefeId: { in: ids } } });
  if (grupos > 0) {
    throw new GestaoErro(
      "DADOS_INVALIDOS",
      "Troque o chefe dos grupos vinculados antes de excluir este monitor",
    );
  }
}

// Feedback.monitorId é onDelete: SetNull no schema: o feedback é histórico do aluno,
// não do monitor — excluir o monitor não pode apagar isso, só perde a autoria.
export async function excluirMonitor(prisma: PrismaClient, id: string) {
  await impedirExclusaoDeChefeDeGrupo(prisma, [id]);
  await prisma.monitor.delete({ where: { id } });
}

// Um DELETE por monitor em lotes grandes estoura o rate limit da API (cada requisição
// conta pra cota) — deleteMany faz tudo numa única query, independente da quantidade.
export async function excluirMonitores(prisma: PrismaClient, ids: string[]) {
  await impedirExclusaoDeChefeDeGrupo(prisma, ids);
  const resultado = await prisma.monitor.deleteMany({ where: { id: { in: ids } } });
  return resultado.count;
}

export async function excluirPeriodo(prisma: PrismaClient, id: string) {
  // Turmas e listas são criadas automaticamente para todo período (ver criarPeriodo)
  // e não representam trabalho real do chefe — não faz sentido bloquear a exclusão só
  // por elas existirem. O que precisa impedir a exclusão é haver alunos, monitores,
  // grupos de revisão ou grupos de prazo já organizados no período. O onDelete: Cascade
  // de Turma/Lista no schema cuida de limpar esse scaffolding junto; Aluno.turma e
  // Feedback.lista continuam Restrict como rede de segurança caso esta checagem tenha
  // um buraco.
  const [alunos, monitores, grupos, gruposPrazo] = await Promise.all([
    prisma.aluno.count({ where: { turma: { periodoId: id } } }),
    prisma.monitor.count({ where: { periodoId: id } }),
    prisma.grupoRevisao.count({ where: { periodoId: id } }),
    prisma.grupoPrazo.count({ where: { periodoId: id } }),
  ]);
  if (alunos > 0 || monitores > 0 || grupos > 0 || gruposPrazo > 0) {
    throw new GestaoErro(
      "CONFLITO",
      "Só é possível excluir um período sem alunos, monitores ou grupos vinculados.",
    );
  }
  await prisma.periodo.delete({ where: { id } });
}
