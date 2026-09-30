import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Aluno, GrupoPrazo, Turma } from "../lib/types";
import { GruposPrazo } from "./GruposPrazo";

const grupo: GrupoPrazo = { id: "grupo-prazo-1", periodoId: "periodo-1", nome: "Rematrícula" };
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

describe("GruposPrazo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("cria um novo grupo de prazo e recarrega a lista", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(api, "criarGrupoPrazo").mockResolvedValue(grupo);

    render(
      <GruposPrazo
        token="token"
        periodoId="periodo-1"
        gruposPrazo={[]}
        alunos={[]}
        listas={[]}
        turmas={[]}
        onReload={onReload}
        onRequestConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Novo grupo de prazo" }));
    await user.type(screen.getByPlaceholderText("Ex: Rematrícula"), "Rematrícula");
    await user.click(screen.getByRole("button", { name: "Criar grupo" }));

    await waitFor(() =>
      expect(api.criarGrupoPrazo).toHaveBeenCalledWith("token", {
        periodoId: "periodo-1",
        nome: "Rematrícula",
      }),
    );
    await waitFor(() => expect(onReload).toHaveBeenCalled());
  });

  it("carrega e permite editar os prazos do grupo por lista", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "prazosGrupo").mockResolvedValue([
      { listaId: "lista-1", listaNome: "Lista 1", ordem: 1, qtdQuestoesTotal: 6, prazoEntregaFeedback: null },
    ]);

    render(
      <GruposPrazo
        token="token"
        periodoId="periodo-1"
        gruposPrazo={[grupo]}
        alunos={[]}
        listas={[]}
        turmas={[]}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Prazos por lista" }));

    await waitFor(() => expect(api.prazosGrupo).toHaveBeenCalledWith("token", grupo.id));
    expect(await screen.findByText("Lista 1")).toBeInTheDocument();
  });

  it("pede confirmação sem mencionar bloqueio ao excluir um grupo de prazo", async () => {
    const user = userEvent.setup();
    const onRequestConfirm = vi.fn();

    render(
      <GruposPrazo
        token="token"
        periodoId="periodo-1"
        gruposPrazo={[grupo]}
        alunos={[]}
        listas={[]}
        turmas={[]}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={onRequestConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: `Excluir grupo de prazo ${grupo.nome}` }));

    expect(onRequestConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Esta ação não pode ser desfeita"),
      }),
    );
  });

  it("mantém os botões de ação sempre visíveis e expande a lista de alunos ao clicar em 'Ver alunos'", async () => {
    const user = userEvent.setup();
    const alunoDoGrupo = aluno({ id: "aluno-do-grupo", nome: "Ana", grupoPrazoId: grupo.id });

    render(
      <GruposPrazo
        token="token"
        periodoId="periodo-1"
        gruposPrazo={[grupo]}
        alunos={[alunoDoGrupo]}
        listas={[]}
        turmas={[]}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Renomear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prazos por lista" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alunos do grupo/ })).toBeInTheDocument();

    const verAlunos = screen.getByRole("button", { name: /Ver alunos/ });
    expect(verAlunos).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Ana")).toBeInTheDocument();

    await user.click(verAlunos);

    expect(screen.getByRole("button", { name: /Ocultar/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("pede confirmação e remove o aluno do grupo de prazo ao clicar no x da lista", async () => {
    const user = userEvent.setup();
    const onRequestConfirm = vi.fn();
    const alunoDoGrupo = aluno({ id: "aluno-do-grupo", nome: "Ana", grupoPrazoId: grupo.id });
    vi.spyOn(api, "atribuirAlunosGrupoPrazo").mockResolvedValue({ atualizados: 1 });

    render(
      <GruposPrazo
        token="token"
        periodoId="periodo-1"
        gruposPrazo={[grupo]}
        alunos={[alunoDoGrupo]}
        listas={[]}
        turmas={[]}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={onRequestConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tirar Ana do grupo de prazo" }));

    expect(onRequestConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tirar Ana do grupo de prazo?" }),
    );

    const { onConfirm } = onRequestConfirm.mock.calls[0]![0];
    await onConfirm();

    expect(api.atribuirAlunosGrupoPrazo).toHaveBeenCalledWith("token", ["aluno-do-grupo"], null);
  });
});
