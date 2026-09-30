import ExcelJS from "exceljs";
import { agruparAtrasosPorTurma } from "./atrasos-agrupados";
import type { Aluno, Atraso, Dupla, GrupoPrazo, GrupoRevisao, Monitor } from "./types";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export function linhasExportacaoAlunos(
  alunos: Aluno[],
  gruposRevisao: GrupoRevisao[],
  gruposPrazo: GrupoPrazo[],
): Record<string, unknown>[] {
  return alunos.map((aluno) => ({
    Nome: aluno.nome,
    Matrícula: aluno.matricula,
    Turma: aluno.turma.nome,
    "Grupo de revisão":
      gruposRevisao.find((g) => g.id === aluno.dupla?.grupoRevisaoId)?.nome ?? "—",
    Dupla: aluno.dupla?.label ?? "—",
    "Grupo de prazo": gruposPrazo.find((g) => g.id === aluno.grupoPrazoId)?.nome ?? "—",
    PCD: aluno.isPcd ? "Sim" : "Não",
  }));
}

export function linhasExportacaoMonitores(
  monitores: Monitor[],
  duplas: Dupla[],
  grupos: GrupoRevisao[],
): Record<string, unknown>[] {
  const duplaPorId = new Map(duplas.map((d) => [d.id, d]));
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));

  return monitores.map((monitor) => {
    const dupla = monitor.duplaId ? duplaPorId.get(monitor.duplaId) : undefined;
    const grupo = dupla ? grupoPorId.get(dupla.grupoRevisaoId) : undefined;
    return {
      Nome: monitor.nome,
      "Usuário Discord": monitor.discordUsername ?? "—",
      Chefe: monitor.isChefe ? "Sim" : "Não",
      Status: monitor.status,
      Grupo: grupo?.nome ?? "—",
      Dupla: dupla?.label ?? "—",
    };
  });
}

export function linhasExportacaoAtrasos(
  atrasos: Atraso[],
  alunos: Aluno[],
  duplas: Dupla[],
  grupos: GrupoRevisao[],
): Record<string, unknown>[] {
  const turmas = agruparAtrasosPorTurma(atrasos, alunos, duplas, grupos);
  const agora = Date.now();
  const linhas: Record<string, unknown>[] = [];
  for (const turma of turmas) {
    for (const grupo of turma.grupos) {
      for (const monitor of grupo.monitores) {
        for (const aluno of monitor.alunos) {
          for (const lista of aluno.listas) {
            const dias = Math.max(
              1,
              Math.ceil((agora - new Date(lista.prazoEntregaFeedback).getTime()) / UM_DIA_MS),
            );
            linhas.push({
              Aluno: aluno.alunoNome,
              Curso: turma.turmaNome,
              Grupo: grupo.grupoNome,
              Monitor: monitor.monitorNome,
              Lista: lista.listaNome,
              "Dias de atraso": dias,
            });
          }
        }
      }
    }
  }
  // Reordena por monitor (e aluno como desempate) em vez da ordem turma→grupo do
  // agrupamento original — sem isso, um monitor que atende alunos de turmas
  // diferentes fica com as linhas espalhadas pela planilha.
  return linhas.sort(
    (a, b) =>
      String(a.Monitor).localeCompare(String(b.Monitor), "pt-BR") ||
      String(a.Aluno).localeCompare(String(b.Aluno), "pt-BR"),
  );
}

const COR_CABECALHO = "FFBFDBFE";
const COR_CABECALHO_TEXTO = "FF1E3A8A";
const COR_COLUNA_AZUL = "FFEFF6FF";

function larguraColuna(cabecalho: string, linhas: Record<string, unknown>[]): number {
  const maiorConteudo = linhas.reduce(
    (maior, linha) => Math.max(maior, String(linha[cabecalho] ?? "").length),
    cabecalho.length,
  );
  return Math.min(Math.max(maiorConteudo + 2, 10), 40);
}

export async function exportarXlsx(
  nomeArquivo: string,
  linhas: Record<string, unknown>[],
): Promise<void> {
  if (!linhas.length) return;

  const cabecalhos = Object.keys(linhas[0]!);
  const livro = new ExcelJS.Workbook();
  const planilha = livro.addWorksheet("Dados", { views: [{ state: "frozen", ySplit: 1 }] });

  planilha.columns = cabecalhos.map((cabecalho) => ({
    header: cabecalho,
    key: cabecalho,
    width: larguraColuna(cabecalho, linhas),
  }));

  planilha.getRow(1).eachCell((celula) => {
    celula.font = { bold: true, color: { argb: COR_CABECALHO_TEXTO } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
    celula.alignment = { vertical: "middle" };
  });

  linhas.forEach((linha) => planilha.addRow(linha));

  // Divide visualmente as colunas (não as linhas) alternando azul claro e branco —
  // ajuda a acompanhar qual célula pertence a qual coluna numa planilha larga.
  cabecalhos.forEach((_, indiceColuna) => {
    if (indiceColuna % 2 !== 0) return;
    planilha.getColumn(indiceColuna + 1).eachCell({ includeEmpty: false }, (celula, numeroLinha) => {
      if (numeroLinha === 1) return;
      celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_COLUNA_AZUL } };
    });
  });

  planilha.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cabecalhos.length } };

  const buffer = await livro.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
