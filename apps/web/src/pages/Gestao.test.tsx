import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GrupoRevisao, Monitor } from "../lib/types";
import { Gestao } from "./Gestao";

const chefe: Monitor = {
  id: "chefe",
  nome: "Chefe Atual",
  whatsappNumero: "+5581999999990",
  discordUserId: "discord-chefe",
  discordUsername: "chefe",
  discordDisplayName: "Chefe Atual",
  discordAvatarUrl: null,
  isChefe: true,
  periodoId: "periodo",
  duplaId: null,
  status: "ATIVO",
  contaChefe: null,
};
const disponivel: Monitor = {
  ...chefe,
  id: "monitor",
  nome: "Bruno Disponível",
  whatsappNumero: "+5581988888888",
  isChefe: false,
};
const grupo: GrupoRevisao = {
  id: "grupo",
  periodoId: "periodo",
  chefeId: chefe.id,
  nome: "Grupo Principal",
  whatsappGrupoId: null,
  whatsappGrupoNome: null,
  chefe,
};

describe("Gestao", () => {
  it("permite pesquisar monitor existente ou abrir o cadastro durante o vínculo", async () => {
    const user = userEvent.setup();
    render(
      <Gestao
        token="token"
        periodoId="periodo"
        grupos={[grupo]}
        duplas={[{ id: "dupla", grupoRevisaoId: grupo.id, label: "Dupla 1", monitores: [] }]}
        monitores={[chefe, disponivel]}
        alunos={[]}
        turmas={[]}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Grupo Principal"));
    await user.click(screen.getAllByRole("button", { name: "vago" })[0]!);

    expect(screen.getByRole("heading", { name: "Vincular monitor à dupla" })).toBeInTheDocument();
    const busca = screen.getByRole("textbox", { name: "Nome ou Discord" });
    await user.type(busca, "Bruno");
    expect(screen.getByText("Bruno Disponível")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cadastrar novo" }));
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeInTheDocument();
    expect(screen.getByText("Conta do Discord")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar e vincular" })).toBeInTheDocument();
  });
});
