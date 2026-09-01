import type { PrismaClient } from "../../generated/prisma/client.js";

export interface AlunoImportado {
  nome: string;
  matricula: string;
  turmaId: string;
  duplaId: string;
  isPcd: boolean;
  qtdQuestoesMeta: number | null;
}

function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV possui aspas não fechadas");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseCsvAlunos(csv: string): AlunoImportado[] {
  if (Buffer.byteLength(csv, "utf8") > 512 * 1024) throw new Error("CSV excede o limite de 512 KB");
  const [header, ...rows] = csvRows(csv);
  if (!header) throw new Error("CSV vazio");
  if (rows.length > 2_000) throw new Error("CSV excede o limite de 2.000 alunos");
  const columns = new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));
  for (const required of ["nome", "matricula", "turmaid", "duplaid"]) {
    if (!columns.has(required)) throw new Error(`CSV requer a coluna ${required}`);
  }
  const value = (row: string[], name: string) => row[columns.get(name)!]?.trim();
  return rows.map((row, index) => {
    const nome = value(row, "nome");
    const matricula = value(row, "matricula");
    const turmaId = value(row, "turmaid");
    const duplaId = value(row, "duplaid");
    if (
      !nome ||
      !matricula ||
      !turmaId ||
      !duplaId ||
      nome.length > 200 ||
      matricula.length > 100 ||
      turmaId.length > 200 ||
      duplaId.length > 200
    ) {
      throw new Error(`Linha ${index + 2} incompleta`);
    }
    const pcd = value(row, "ispcd")?.toLowerCase();
    const metaValue = value(row, "qtdquestoesmeta");
    const qtdQuestoesMeta = metaValue ? Number(metaValue) : null;
    if (pcd && !["true", "false", "sim", "nao", "não", "1", "0"].includes(pcd)) {
      throw new Error(`isPcd inválido na linha ${index + 2}`);
    }
    if (metaValue && (!Number.isInteger(qtdQuestoesMeta) || qtdQuestoesMeta! < 1)) {
      throw new Error(`qtdQuestoesMeta inválida na linha ${index + 2}`);
    }
    return {
      nome,
      matricula,
      turmaId,
      duplaId,
      isPcd: ["true", "sim", "1"].includes(pcd ?? ""),
      qtdQuestoesMeta,
    };
  });
}

export async function validarVinculosAluno(
  prisma: PrismaClient,
  turmaId: string,
  duplaId: string | null,
) {
  if (!duplaId) {
    if (!(await prisma.turma.findUnique({ where: { id: turmaId } })))
      throw new Error("Turma não encontrada");
    return;
  }
  const [turma, dupla] = await Promise.all([
    prisma.turma.findUnique({ where: { id: turmaId } }),
    prisma.dupla.findUnique({ where: { id: duplaId }, include: { grupoRevisao: true } }),
  ]);
  if (!turma || !dupla) throw new Error("Turma ou dupla não encontrada");
  if (turma.periodoId !== dupla.grupoRevisao.periodoId) {
    throw new Error("Turma e dupla devem pertencer ao mesmo período");
  }
}

export async function validarMonitorSemanaA(
  prisma: PrismaClient,
  duplaId: string | null,
  monitorId: string | null | undefined,
) {
  if (!monitorId) return;
  if (!duplaId) throw new Error("Atribua uma dupla antes de escolher o monitor");
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) throw new Error("Monitor não encontrado");
  if (monitor.duplaId !== duplaId) throw new Error("Monitor deve pertencer à dupla do aluno");
}

export async function atribuirAlunosADupla(
  prisma: PrismaClient,
  alunoIds: string[],
  duplaId: string,
) {
  const ids = [...new Set(alunoIds)];
  const [dupla, alunos] = await Promise.all([
    prisma.dupla.findUnique({
      where: { id: duplaId },
      include: { grupoRevisao: true },
    }),
    prisma.aluno.findMany({
      where: { id: { in: ids } },
      include: { turma: true },
    }),
  ]);

  if (!dupla) throw new Error("Dupla não encontrada");
  if (alunos.length !== ids.length) throw new Error("Um ou mais alunos não foram encontrados");
  if (alunos.some((aluno) => aluno.turma.periodoId !== dupla.grupoRevisao.periodoId)) {
    throw new Error("Todos os alunos devem pertencer ao mesmo período da dupla");
  }

  const resultado = await prisma.aluno.updateMany({
    where: { id: { in: ids } },
    data: { duplaId, monitorSemanaAId: null },
  });
  return resultado.count;
}

export async function importarAlunos(prisma: PrismaClient, csv: string) {
  const alunos = parseCsvAlunos(csv);
  await Promise.all(
    alunos.map((aluno) => validarVinculosAluno(prisma, aluno.turmaId, aluno.duplaId)),
  );
  await prisma.$transaction(alunos.map((aluno) => prisma.aluno.create({ data: aluno })));
  return alunos.length;
}

// Feedback.alunoId é onDelete: Cascade no schema: excluir o aluno apaga em cascata
// todo o histórico de feedback dele. Decisão do chefe de monitoria: a exclusão deve
// funcionar mesmo com histórico, sem bloqueio — não há fluxo de anonimização exposto
// na interface hoje para justificar impedir a exclusão.
export async function excluirAluno(prisma: PrismaClient, alunoId: string) {
  await prisma.aluno.delete({ where: { id: alunoId } });
}

// Um DELETE por aluno em lotes grandes estoura o rate limit da API (cada requisição
// conta pra cota) — deleteMany faz tudo numa única query, independente da quantidade.
export async function excluirAlunos(prisma: PrismaClient, alunoIds: string[]) {
  const resultado = await prisma.aluno.deleteMany({ where: { id: { in: alunoIds } } });
  return resultado.count;
}
