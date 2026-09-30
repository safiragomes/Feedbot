import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Aluno, Atraso, Turma } from "../lib/types";
import { AtrasadosOverview } from "./AtrasadosOverview";
import * as exportarPlanilha from "../lib/exportar-planilha";

vi.mock("../lib/exportar-planilha", () => ({
  exportarXlsx: vi.fn().mockResolvedValue(undefined),
  linhasExportacaoAtrasos: vi.fn(() => []),
}));

const turma: Turma = { id: "turma-1", periodoId: "periodo-1", nome: "Turma A", nomeAbaPlanilha: "Turma A" };

function aluno(overrides: Partial<Aluno> = {}): Aluno {
  return {
    id: "aluno-1",
    nome: "Ana",
    matricula: "20260001",
    turmaId: turma.id,
    duplaId: null,
    grupoPrazoId: null,
    isPcd: false,
    qtdQuestoesMeta: null,
    monitorSemanaAId: null,
    turma,
    dupla: null,
    prazosIndividuais: [],
    ...overrides,
  };
}

function atraso(overrides: Partial<Atraso> = {}): Atraso {
  return {
    alunoId: "aluno-1",
    alunoNome: "Ana",
    listaId: "lista-1",
    listaNome: "Lista 1",
    monitorId: "monitor-1",
    monitorNome: "Bruno",
    duplaId: "dupla-1",
    prazoEntregaFeedback: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("AtrasadosOverview — exportação", () => {
  it("exporta os atrasos filtrados ao clicar em Exportar", async () => {
    const user = userEvent.setup();
    const atrasos = [atraso()];
    const alunos = [aluno()];

    render(
      <AtrasadosOverview
        turmas={[turma]}
        grupos={[]}
        duplas={[]}
        alunos={alunos}
        listas={[]}
        monitores={[]}
        atrasos={atrasos}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Exportar" }));

    expect(exportarPlanilha.linhasExportacaoAtrasos).toHaveBeenCalledWith(atrasos, alunos, [], []);
    expect(exportarPlanilha.exportarXlsx).toHaveBeenCalledWith("atrasados.xlsx", []);
  });

  it("desabilita o botão Exportar quando não há atrasos", () => {
    render(
      <AtrasadosOverview
        turmas={[]}
        grupos={[]}
        duplas={[]}
        alunos={[]}
        listas={[]}
        monitores={[]}
        atrasos={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  });
});
