import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlunoDrawer } from "./Drawers";
import type { Aluno, Lista, Turma } from "../lib/types";

const turma: Turma = { id: "turma-1", periodoId: "periodo-1", nome: "Turma A", nomeAbaPlanilha: "Turma A" };

function aluno(overrides: Partial<Aluno> = {}): Aluno {
  return {
    id: "aluno-1",
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

function lista(overrides: Partial<Lista> = {}): Lista {
  return {
    id: "lista-1",
    periodoId: "periodo-1",
    nome: "Lista 1",
    qtdQuestoesTotal: 6,
    ordem: 1,
    semanaOverride: null,
    prazos: [],
    prazosGrupo: [],
    ...overrides,
  };
}

function renderDrawer(alunoAtual: Aluno, listas: Lista[]) {
  return render(
    <AlunoDrawer
      aluno={alunoAtual}
      alunos={[alunoAtual]}
      grupos={[]}
      duplas={[]}
      gruposPrazo={[{ id: "grupo-prazo-1", periodoId: "periodo-1", nome: "Rematrícula" }]}
      feedbacks={[]}
      listas={listas}
      atrasos={[]}
      token="token"
      onReload={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      onRequestRemove={vi.fn()}
    />,
  );
}

describe("AlunoDrawer — precedência de prazo efetivo", () => {
  it("usa o prazo da turma quando o aluno não pertence a um grupo de prazo", () => {
    renderDrawer(
      aluno({ grupoPrazoId: null }),
      [lista({ prazos: [{ turmaId: turma.id, prazoEntregaFeedback: "2026-09-10T23:59:59.999Z" }] })],
    );

    expect(screen.getByText("Turma: 10/09/2026")).toBeInTheDocument();
  });

  it("usa o prazo do grupo quando o aluno pertence a um grupo com prazo configurado para a lista, mesmo com prazo diferente na turma", () => {
    renderDrawer(
      aluno({ grupoPrazoId: "grupo-prazo-1" }),
      [
        lista({
          prazos: [{ turmaId: turma.id, prazoEntregaFeedback: "2026-09-10T23:59:59.999Z" }],
          prazosGrupo: [
            { grupoPrazoId: "grupo-prazo-1", prazoEntregaFeedback: "2026-09-20T23:59:59.999Z" },
          ],
        }),
      ],
    );

    expect(screen.getByText("Grupo: 20/09/2026")).toBeInTheDocument();
    expect(screen.queryByText(/^Turma:/)).not.toBeInTheDocument();
  });

  it("cai para o prazo da turma quando o grupo do aluno não tem prazo configurado para esta lista específica", () => {
    renderDrawer(
      aluno({ grupoPrazoId: "grupo-prazo-1" }),
      [
        lista({
          prazos: [{ turmaId: turma.id, prazoEntregaFeedback: "2026-09-10T23:59:59.999Z" }],
          prazosGrupo: [],
        }),
      ],
    );

    expect(screen.getByText("Turma: 10/09/2026")).toBeInTheDocument();
  });

  it("oferece 'Usar grupo' (não 'Usar turma') ao limpar uma exceção individual quando o grupo tem prazo para a lista", async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer(
      aluno({
        grupoPrazoId: "grupo-prazo-1",
        prazosIndividuais: [{ listaId: "lista-1", prazoEntregaFeedback: "2026-09-05T23:59:59.999Z" }],
      }),
      [
        lista({
          prazos: [{ turmaId: turma.id, prazoEntregaFeedback: "2026-09-10T23:59:59.999Z" }],
          prazosGrupo: [
            { grupoPrazoId: "grupo-prazo-1", prazoEntregaFeedback: "2026-09-20T23:59:59.999Z" },
          ],
        }),
      ],
    );

    await user.clear(container.querySelector('input[type="date"]')!);

    expect(screen.getByRole("button", { name: "Usar grupo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar turma" })).not.toBeInTheDocument();
  });

  it("oferece 'Usar turma' ao limpar uma exceção individual quando o aluno não tem grupo com prazo para a lista", async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer(
      aluno({
        grupoPrazoId: null,
        prazosIndividuais: [{ listaId: "lista-1", prazoEntregaFeedback: "2026-09-05T23:59:59.999Z" }],
      }),
      [lista({ prazos: [{ turmaId: turma.id, prazoEntregaFeedback: "2026-09-10T23:59:59.999Z" }] })],
    );

    await user.clear(container.querySelector('input[type="date"]')!);

    expect(screen.getByRole("button", { name: "Usar turma" })).toBeInTheDocument();
  });
});
