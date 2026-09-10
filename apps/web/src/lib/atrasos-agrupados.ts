import type { Aluno, Atraso, Dupla, GrupoRevisao } from "./types";

export type AtrasoAgrupadoItem = {
  listaId: string;
  listaNome: string;
  monitorId: string;
  monitorNome: string;
  prazoEntregaFeedback: string;
};

export type AlunoAgrupado = {
  alunoId: string;
  alunoNome: string;
  duplaId: string;
  duplaLabel: string;
  itens: AtrasoAgrupadoItem[];
};

export type GrupoAgrupado = {
  grupoId: string;
  grupoNome: string;
  alunos: AlunoAgrupado[];
  totalAtrasos: number;
};

export type TurmaAgrupada = {
  turmaId: string;
  turmaNome: string;
  grupos: GrupoAgrupado[];
  totalAtrasos: number;
};

export function agruparAtrasosPorTurma(
  atrasos: Atraso[],
  alunos: Aluno[],
  duplas: Dupla[],
  grupos: GrupoRevisao[],
): TurmaAgrupada[] {
  const alunoPorId = new Map(alunos.map((a) => [a.id, a]));
  const duplaPorId = new Map(duplas.map((d) => [d.id, d]));
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));

  const turmas = new Map<string, TurmaAgrupada>();

  for (const atraso of atrasos) {
    const aluno = alunoPorId.get(atraso.alunoId);
    if (!aluno) continue;
    const dupla = duplaPorId.get(atraso.duplaId);
    const grupoId = dupla?.grupoRevisaoId ?? "sem-grupo";
    const grupoNome = grupoPorId.get(grupoId)?.nome ?? "Sem grupo";

    let turma = turmas.get(aluno.turmaId);
    if (!turma) {
      turma = { turmaId: aluno.turmaId, turmaNome: aluno.turma.nome, grupos: [], totalAtrasos: 0 };
      turmas.set(aluno.turmaId, turma);
    }
    turma.totalAtrasos += 1;

    let grupo = turma.grupos.find((g) => g.grupoId === grupoId);
    if (!grupo) {
      grupo = { grupoId, grupoNome, alunos: [], totalAtrasos: 0 };
      turma.grupos.push(grupo);
    }
    grupo.totalAtrasos += 1;

    let alunoAgrupado = grupo.alunos.find((a) => a.alunoId === atraso.alunoId);
    if (!alunoAgrupado) {
      alunoAgrupado = {
        alunoId: atraso.alunoId,
        alunoNome: atraso.alunoNome,
        duplaId: atraso.duplaId,
        duplaLabel: dupla?.label ?? "—",
        itens: [],
      };
      grupo.alunos.push(alunoAgrupado);
    }
    alunoAgrupado.itens.push({
      listaId: atraso.listaId,
      listaNome: atraso.listaNome,
      monitorId: atraso.monitorId,
      monitorNome: atraso.monitorNome,
      prazoEntregaFeedback: atraso.prazoEntregaFeedback,
    });
  }

  const turmasArr = [...turmas.values()];
  turmasArr.forEach((turma) => {
    turma.grupos.sort(
      (a, b) => b.totalAtrasos - a.totalAtrasos || a.grupoNome.localeCompare(b.grupoNome, "pt-BR"),
    );
    turma.grupos.forEach((grupo) => {
      grupo.alunos.sort(
        (a, b) => b.itens.length - a.itens.length || a.alunoNome.localeCompare(b.alunoNome, "pt-BR"),
      );
    });
  });
  turmasArr.sort(
    (a, b) => b.totalAtrasos - a.totalAtrasos || a.turmaNome.localeCompare(b.turmaNome, "pt-BR"),
  );

  return turmasArr;
}
