import { describe, expect, it } from "vitest";
import { agruparAtrasosPorTurma, listarMonitoresEmAtraso } from "./atrasos-agrupados";
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

function atraso(
  alunoId: string,
  duplaId: string,
  listaId: string,
  monitorId: string,
  prazoEntregaFeedback = "2026-08-01T00:00:00.000Z",
): Atraso {
  return {
    alunoId,
    alunoNome: `Aluno ${alunoId}`,
    listaId,
    listaNome: `Lista ${listaId}`,
    monitorId,
    monitorNome: `Monitor ${monitorId}`,
    duplaId,
    prazoEntregaFeedback,
  };
}

describe("agrupamento de atrasos por turma/grupo/monitor/aluno", () => {
  const alunos = [
    aluno("a1", "Ana", "t1", "Turma 1"),
    aluno("a2", "Beto", "t1", "Turma 1"),
    aluno("a3", "Caio", "t2", "Turma 2"),
  ];
  const duplas = [dupla("d1", "g1", "Dupla 1"), dupla("d2", "g2", "Dupla 2")];
  const grupos = [grupo("g1", "Grupo 1"), grupo("g2", "Grupo 2")];

  it("agrupa por turma, grupo, monitor e aluno, somando os atrasos abertos", () => {
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
    // m1 (2 atrasos) vem antes de m2 (1 atraso) — ordenação padrão por pendências.
    expect(t1.grupos[0]!.monitores.map((m) => m.monitorId)).toEqual(["m1", "m2"]);
    expect(t1.grupos[0]!.monitores[0]!.alunos.map((a) => a.alunoId)).toEqual(["a1"]);
    expect(t1.grupos[0]!.monitores[0]!.alunos[0]!.listas).toHaveLength(2);
  });

  it("o mesmo aluno aparece sob monitores diferentes quando as listas pendentes são de monitores diferentes", () => {
    // Ex.: monitor da semana A ficou devendo a lista 1, monitor da semana B a lista 2.
    const atrasos = [atraso("a1", "d1", "l1", "m1"), atraso("a1", "d1", "l2", "m2")];
    const resultado = agruparAtrasosPorTurma(atrasos, alunos, duplas, grupos);
    const monitores = resultado[0]!.grupos[0]!.monitores;
    expect(monitores.map((m) => m.monitorId)).toEqual(["m1", "m2"]);
    expect(monitores[0]!.alunos.map((a) => a.alunoId)).toEqual(["a1"]);
    expect(monitores[1]!.alunos.map((a) => a.alunoId)).toEqual(["a1"]);
  });

  it("ordena por pendências (mais atrasos primeiro) por padrão", () => {
    const atrasos = [
      atraso("a3", "d2", "l1", "m3"),
      atraso("a1", "d1", "l1", "m1"),
      atraso("a1", "d1", "l2", "m1"),
      atraso("a2", "d1", "l1", "m2"),
    ];
    const resultado = agruparAtrasosPorTurma(atrasos, alunos, duplas, grupos);
    expect(resultado.map((t) => t.turmaId)).toEqual(["t1", "t2"]);
  });

  it("ordena por dias de atraso (prazo mais antigo primeiro) quando pedido", () => {
    const atrasos = [
      // m1 tem mais pendências (2), mas m2 está atrasado há mais tempo (prazo mais antigo).
      atraso("a1", "d1", "l1", "m1", "2026-08-10T00:00:00.000Z"),
      atraso("a1", "d1", "l2", "m1", "2026-08-11T00:00:00.000Z"),
      atraso("a2", "d1", "l1", "m2", "2026-08-01T00:00:00.000Z"),
    ];
    const porPendencias = agruparAtrasosPorTurma(atrasos, alunos, duplas, grupos, "pendencias");
    expect(porPendencias[0]!.grupos[0]!.monitores.map((m) => m.monitorId)).toEqual(["m1", "m2"]);

    const porDias = agruparAtrasosPorTurma(atrasos, alunos, duplas, grupos, "dias");
    expect(porDias[0]!.grupos[0]!.monitores.map((m) => m.monitorId)).toEqual(["m2", "m1"]);
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

describe("listarMonitoresEmAtraso", () => {
  it("responde ao mesmo ordenarPor da árvore, não só 'mais pendências'", () => {
    // Regressão: o ranking "quem cobrar primeiro" ficava preso em ordenar por
    // quantidade mesmo quando a chefe escolhia ordenar por dias de atraso — m1 tem
    // mais pendências, mas m2 está atrasado há mais tempo (prazo mais antigo).
    const atrasos = [
      atraso("a1", "d1", "l1", "m1", "2026-08-10T00:00:00.000Z"),
      atraso("a1", "d1", "l2", "m1", "2026-08-11T00:00:00.000Z"),
      atraso("a2", "d1", "l1", "m2", "2026-08-01T00:00:00.000Z"),
    ];

    const porPendencias = listarMonitoresEmAtraso(atrasos, "pendencias");
    expect(porPendencias.map((m) => m.monitorId)).toEqual(["m1", "m2"]);

    const porDias = listarMonitoresEmAtraso(atrasos, "dias");
    expect(porDias.map((m) => m.monitorId)).toEqual(["m2", "m1"]);
  });
});
