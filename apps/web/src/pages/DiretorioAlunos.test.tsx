import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Aluno, GrupoPrazo, Turma } from "../lib/types";
import { DiretorioAlunos } from "./DiretorioAlunos";
import * as exportarPlanilha from "../lib/exportar-planilha";

vi.mock("../lib/exportar-planilha", () => ({
  exportarXlsx: vi.fn().mockResolvedValue(undefined),
  linhasExportacaoAlunos: vi.fn(() => []),
}));

const turma: Turma = { id: "turma-1", periodoId: "periodo-1", nome: "Turma A", nomeAbaPlanilha: "Turma A" };
const grupoPrazo: GrupoPrazo = { id: "grupo-prazo-1", periodoId: "periodo-1", nome: "Rematrícula" };

function aluno(overrides: Partial<Aluno> = {}): Aluno {
  return {
    id: `aluno-${Math.random()}`,
    nome: "Aluno Teste",
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

describe("DiretorioAlunos — coluna e filtro de grupo de prazo", () => {
  it("mostra o nome do grupo de prazo do aluno e um traço para quem não tem grupo", () => {
    render(
      <DiretorioAlunos
        token="token"
        alunos={[
          aluno({ id: "com-grupo", nome: "Com Grupo", grupoPrazoId: grupoPrazo.id }),
          aluno({ id: "sem-grupo", nome: "Sem Grupo", grupoPrazoId: null }),
        ]}
        grupos={[]}
        gruposPrazo={[grupoPrazo]}
        listas={[]}
        feedbacks={[]}
        atrasos={[]}
        onOpenAluno={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Rematrícula")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Grupo de prazo" })).toBeInTheDocument();
  });

  it("expõe o filtro de grupo de prazo na barra de filtros", () => {
    render(
      <DiretorioAlunos
        token="token"
        alunos={[]}
        grupos={[]}
        gruposPrazo={[grupoPrazo]}
        listas={[]}
        feedbacks={[]}
        atrasos={[]}
        onOpenAluno={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Grupo de prazo", { selector: "span.flag" })).toBeInTheDocument();
  });
});

describe("DiretorioAlunos — exportação", () => {
  it("exporta todos os alunos filtrados quando nada está selecionado", async () => {
    const user = userEvent.setup();
    const alunos = [aluno({ id: "a1", nome: "Ana" }), aluno({ id: "a2", nome: "Bia" })];

    render(
      <DiretorioAlunos
        token="token"
        alunos={alunos}
        grupos={[]}
        gruposPrazo={[]}
        listas={[]}
        feedbacks={[]}
        atrasos={[]}
        onOpenAluno={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Exportar" }));

    expect(exportarPlanilha.linhasExportacaoAlunos).toHaveBeenCalledWith(alunos, [], []);
    expect(exportarPlanilha.exportarXlsx).toHaveBeenCalledWith("alunos.xlsx", []);
  });

  it("exporta só os alunos selecionados quando há seleção", async () => {
    const user = userEvent.setup();
    const alunos = [aluno({ id: "a1", nome: "Ana" }), aluno({ id: "a2", nome: "Bia" })];

    render(
      <DiretorioAlunos
        token="token"
        alunos={alunos}
        grupos={[]}
        gruposPrazo={[]}
        listas={[]}
        feedbacks={[]}
        atrasos={[]}
        onOpenAluno={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole("checkbox", { name: "Selecionar linha" })[0]!);

    await user.click(screen.getByRole("button", { name: "Exportar" }));

    expect(exportarPlanilha.linhasExportacaoAlunos).toHaveBeenCalledWith([alunos[0]], [], []);
  });
});
