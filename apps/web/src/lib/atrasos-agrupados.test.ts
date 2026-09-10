import { describe, expect, it } from "vitest";
import { agruparAtrasosPorTurma } from "./atrasos-agrupados";
import type { Aluno, Atraso, Dupla, GrupoRevisao } from "./types";

function turma(id: string, nome: string) {
  return { id, periodoId: "periodo-1", nome, nomeAbaPlanilha: nome };
}

function aluno(id: string, nome: string, turmaId: string, turmaNome: string): Aluno {
  return {
    id,
    nome,
    matricula: `mat-${id}`,
    turmaId,
    duplaId: "dupla-1",
    isPcd: false,
    qtdQuestoesMeta: null,
    monitorSemanaAId: null,
    turma: turma(turmaId, turmaNome),
    dupla: null,
    prazosIndividuais: [],
  };
}

function dupla(id: string, grupoRevisaoId: string, label: string): Dupla {
  return { id, grupoRevisaoId, label };
}

function grupo(id: string, nome: string): GrupoRevisao {
  return {
    id,
    periodoId: "periodo-1",
    chefeId: "chefe-1",
    nome,
    whatsappGrupoId: null,
    whatsappGrupoNome: null,
  };
}

function atraso(alunoId: string, duplaId: string, listaId: string, monitorId: string): Atraso {
  return {
    alunoId,
    alunoNome: `Aluno ${alunoId}`,
    listaId,
    listaNome: `Lista ${listaId}`,
    monitorId,
    monitorNome: `Monitor ${monitorId}`,
    duplaId,
    prazoEntregaFeedback: "2026-08-01T00:00:00.000Z",
  };
}

describe("agrupamento de atrasos por turma/grupo/aluno", () => {
  const alunos = [
    aluno("a1", "Ana", "t1", "Turma 1"),
    aluno("a2", "Beto", "t1", "Turma 1"),
    aluno("a3", "Caio", "t2", "Turma 2"),
  ];
  const duplas = [dupla("d1", "g1", "Dupla 1"), dupla("d2", "g2", "Dupla 2")];
  const grupos = [grupo("g1", "Grupo 1"), grupo("g2", "Grupo 2")];

  it("agrupa por turma, grupo e aluno, somando os atrasos abertos", () => {
    const atrasos = [
      atraso("a1", "d1", "l1", "m1"),
      atraso("a1", "d1", "l2", "m1"),
      atraso("a2", "d1", "l1", "m2"),
      atraso("a3", "d2", "l1", "m3"),
    ];
    const resultado = agruparAtrasosPorTurma(atrasos, alunos, duplas, grupos);

    expect(resultado.map((t) => t.turmaId)).toEqual(["t1", "t2"]);
    const t1 = resultado[0]!;
    expect(t1.totalAtrasos).toBe(3);
    expect(t1.grupos).toHaveLength(1);
    expect(t1.grupos[0]!.alunos.map((a) => a.alunoId)).toEqual(["a1", "a2"]);
    expect(t1.grupos[0]!.alunos[0]!.itens).toHaveLength(2);
  });

  it("ordena turmas e grupos pela quantidade de atrasos, mais atrasados primeiro", () => {
    const atrasos = [
      atraso("a3", "d2", "l1", "m3"),
      atraso("a1", "d1", "l1", "m1"),
      atraso("a1", "d1", "l2", "m1"),
      atraso("a2", "d1", "l1", "m2"),
    ];
    const resultado = agruparAtrasosPorTurma(atrasos, alunos, duplas, grupos);
    expect(resultado.map((t) => t.turmaId)).toEqual(["t1", "t2"]);
  });

  it("ignora atrasos de alunos que não existem mais na lista carregada", () => {
    const resultado = agruparAtrasosPorTurma(
      [atraso("fantasma", "d1", "l1", "m1")],
      alunos,
      duplas,
      grupos,
    );
    expect(resultado).toEqual([]);
  });
});
