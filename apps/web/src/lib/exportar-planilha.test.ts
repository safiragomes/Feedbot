import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  exportarXlsx,
  linhasExportacaoAlunos,
  linhasExportacaoAtrasos,
  linhasExportacaoMonitores,
} from "./exportar-planilha";
import type { Aluno, Atraso, Dupla, GrupoPrazo, GrupoRevisao, Monitor, Turma } from "./types";

function turma(id: string, nome: string): Turma {
  return { id, periodoId: "periodo-1", nome, nomeAbaPlanilha: nome };
}

function aluno(overrides: Partial<Aluno> = {}): Aluno {
  return {
    id: "aluno-1",
    nome: "Ana",
    matricula: "20260001",
    turmaId: "turma-1",
    duplaId: null,
    grupoPrazoId: null,
    isPcd: false,
    qtdQuestoesMeta: null,
    monitorSemanaAId: null,
    turma: turma("turma-1", "Turma A"),
    dupla: null,
    prazosIndividuais: [],
    ...overrides,
  };
}

function grupoRevisao(id: string, nome: string): GrupoRevisao {
  return {
    id,
    periodoId: "periodo-1",
    chefeId: "chefe-1",
    nome,
    whatsappGrupoId: null,
    whatsappGrupoNome: null,
  };
}

function grupoPrazo(id: string, nome: string): GrupoPrazo {
  return { id, periodoId: "periodo-1", nome };
}

function dupla(id: string, grupoRevisaoId: string, label: string): Dupla {
  return { id, grupoRevisaoId, label };
}

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "monitor-1",
    nome: "Bruno",
    whatsappNumero: null,
    discordUserId: "discord-1",
    discordUsername: "bruno",
    discordDisplayName: "Bruno Monitor",
    discordAvatarUrl: null,
    isChefe: false,
    periodoId: "periodo-1",
    duplaId: null,
    status: "ATIVO",
    contaChefe: null,
    ...overrides,
  };
}

describe("linhasExportacaoAlunos", () => {
  it("resolve grupo de revisão (via dupla) e grupo de prazo pelo nome", () => {
    const dupla1 = dupla("dupla-1", "grupo-revisao-1", "Dupla 1");
    const linhas = linhasExportacaoAlunos(
      [
        aluno({
          nome: "Ana",
          matricula: "1",
          duplaId: "dupla-1",
          dupla: dupla1,
          grupoPrazoId: "grupo-prazo-1",
        }),
      ],
      [grupoRevisao("grupo-revisao-1", "Grupo Helena")],
      [grupoPrazo("grupo-prazo-1", "Rematrícula")],
    );

    expect(linhas).toEqual([
      {
        Nome: "Ana",
        Matrícula: "1",
        Turma: "Turma A",
        "Grupo de revisão": "Grupo Helena",
        Dupla: "Dupla 1",
        "Grupo de prazo": "Rematrícula",
        PCD: "Não",
      },
    ]);
  });

  it("usa travessão para aluno sem dupla e sem grupo de prazo", () => {
    const linhas = linhasExportacaoAlunos([aluno({ isPcd: true })], [], []);

    expect(linhas).toEqual([
      {
        Nome: "Ana",
        Matrícula: "20260001",
        Turma: "Turma A",
        "Grupo de revisão": "—",
        Dupla: "—",
        "Grupo de prazo": "—",
        PCD: "Sim",
      },
    ]);
  });
});

describe("linhasExportacaoMonitores", () => {
  it("resolve o grupo do monitor pela dupla dele", () => {
    const duplas = [dupla("dupla-1", "grupo-revisao-1", "Dupla 1")];
    const grupos = [grupoRevisao("grupo-revisao-1", "Grupo Helena")];
    const linhas = linhasExportacaoMonitores(
      [monitor({ nome: "Bruno", duplaId: "dupla-1", isChefe: true })],
      duplas,
      grupos,
    );

    expect(linhas).toEqual([
      {
        Nome: "Bruno",
        "Usuário Discord": "bruno",
        Chefe: "Sim",
        Status: "ATIVO",
        Grupo: "Grupo Helena",
        Dupla: "Dupla 1",
      },
    ]);
  });

  it("usa travessão para monitor sem dupla", () => {
    const linhas = linhasExportacaoMonitores([monitor({ duplaId: null })], [], []);

    expect(linhas[0]).toMatchObject({ Grupo: "—", Dupla: "—" });
  });
});

describe("linhasExportacaoAtrasos", () => {
  afterEach(() => vi.useRealTimers());

  it("prioriza o aluno como primeira coluna e calcula dias de atraso a partir de agora", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00.000Z"));

    const alunos = [aluno({ id: "a1", nome: "Ana", turmaId: "t1", turma: turma("t1", "Turma A") })];
    const duplas = [dupla("d1", "g1", "Dupla 1")];
    const grupos = [grupoRevisao("g1", "Grupo Helena")];
    const atrasos: Atraso[] = [
      {
        alunoId: "a1",
        alunoNome: "Ana",
        listaId: "l1",
        listaNome: "Lista 1",
        monitorId: "m1",
        monitorNome: "Bruno",
        duplaId: "d1",
        prazoEntregaFeedback: "2026-08-01T12:00:00.000Z",
      },
    ];

    const linhas = linhasExportacaoAtrasos(atrasos, alunos, duplas, grupos);

    expect(linhas).toEqual([
      {
        Aluno: "Ana",
        Curso: "Turma A",
        Grupo: "Grupo Helena",
        Monitor: "Bruno",
        Lista: "Lista 1",
        "Dias de atraso": 4,
      },
    ]);
    expect(Object.keys(linhas[0]!)).toEqual([
      "Aluno",
      "Curso",
      "Grupo",
      "Monitor",
      "Lista",
      "Dias de atraso",
    ]);
  });

  it("retorna lista vazia quando não há atrasos", () => {
    expect(linhasExportacaoAtrasos([], [], [], [])).toEqual([]);
  });

  it("agrupa os alunos do mesmo monitor de forma contígua, mesmo em turmas diferentes", () => {
    const alunos = [
      aluno({ id: "ana", nome: "Ana", turmaId: "t1", turma: turma("t1", "Turma A") }),
      aluno({ id: "beto", nome: "Beto", turmaId: "t2", turma: turma("t2", "Turma B") }),
      aluno({ id: "zeca", nome: "Zeca", turmaId: "t3", turma: turma("t3", "Turma Z") }),
    ];
    const duplas = [
      dupla("d1", "g1", "Dupla 1"),
      dupla("d2", "g1", "Dupla 2"),
      dupla("d3", "g1", "Dupla 3"),
    ];
    const grupos = [grupoRevisao("g1", "Grupo Helena")];
    // Turma A e Turma Z ficam com o monitor Bruno; Turma B fica com a monitora
    // Carla — sem o agrupamento por monitor, a ordem por turma intercalaria os
    // alunos de Bruno com o de Carla no meio.
    const atrasos: Atraso[] = [
      {
        alunoId: "ana",
        alunoNome: "Ana",
        listaId: "l1",
        listaNome: "Lista 1",
        monitorId: "m1",
        monitorNome: "Bruno",
        duplaId: "d1",
        prazoEntregaFeedback: "2026-08-01T12:00:00.000Z",
      },
      {
        alunoId: "beto",
        alunoNome: "Beto",
        listaId: "l1",
        listaNome: "Lista 1",
        monitorId: "m2",
        monitorNome: "Carla",
        duplaId: "d2",
        prazoEntregaFeedback: "2026-08-01T12:00:00.000Z",
      },
      {
        alunoId: "zeca",
        alunoNome: "Zeca",
        listaId: "l1",
        listaNome: "Lista 1",
        monitorId: "m1",
        monitorNome: "Bruno",
        duplaId: "d3",
        prazoEntregaFeedback: "2026-08-01T12:00:00.000Z",
      },
    ];

    const linhas = linhasExportacaoAtrasos(atrasos, alunos, duplas, grupos);

    expect(linhas.map((linha) => [linha.Monitor, linha.Aluno])).toEqual([
      ["Bruno", "Ana"],
      ["Bruno", "Zeca"],
      ["Carla", "Beto"],
    ]);
  });
});

describe("exportarXlsx", () => {
  let ultimoBlob: Blob | undefined;

  beforeEach(() => {
    ultimoBlob = undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        ultimoBlob = blob;
        return "blob:mock";
      }),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("gera cabeçalho estilizado, autofiltro e faixas azul/branco alternadas por coluna", async () => {
    await exportarXlsx("atrasados.xlsx", [
      { Aluno: "Ana", Curso: "Turma A" },
      { Aluno: "Bia", Curso: "Turma B" },
    ]);

    expect(ultimoBlob).toBeDefined();
    const buffer = await ultimoBlob!.arrayBuffer();
    const livroLido = new ExcelJS.Workbook();
    await livroLido.xlsx.load(buffer);
    const planilha = livroLido.getWorksheet("Dados")!;

    expect(planilha.getCell("A1").font?.bold).toBe(true);
    expect(planilha.getCell("A1").fill).toMatchObject({ fgColor: { argb: "FFBFDBFE" } });
    expect(planilha.autoFilter).toBeTruthy();
    // Coluna A (1ª, índice par) fica azul claro; coluna B (2ª, índice ímpar) fica
    // sem preenchimento (branco), sem herdar a cor azul.
    expect(planilha.getCell("A2").fill).toMatchObject({ fgColor: { argb: "FFEFF6FF" } });
    expect(planilha.getCell("A3").fill).toMatchObject({ fgColor: { argb: "FFEFF6FF" } });
    const corDaColunaBranca = (planilha.getCell("B2").fill as { fgColor?: { argb: string } })
      ?.fgColor?.argb;
    expect(corDaColunaBranca).not.toBe("FFEFF6FF");
  });

  it("não gera nem baixa nada quando não há linhas", async () => {
    await exportarXlsx("vazio.xlsx", []);

    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
