import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NovoMonitorModal } from "./MonitorAccessModals";

// Cadastrar um monitor novo a partir do Discord (o fluxo que a chefe passa a usar depois da
// migração) não deve exigir digitar o nome duas vezes: escolher a conta do Discord preenche o
// campo de nome com o nome de exibição de lá, mas a chefe ainda pode editá-lo depois.

function stubFetchSemMembros() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    }),
  );
}

describe("NovoMonitorModal — preenchimento do nome a partir do Discord", () => {
  it("preenche o nome ao escolher a conta pelo ID manual, mas não sobrescreve um nome já digitado", async () => {
    stubFetchSemMembros();
    const user = userEvent.setup();
    render(
      <NovoMonitorModal
        token="token"
        periodoId="periodo"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    // Sem digitar nada, escolher o Discord preenche o nome.
    await user.click(screen.getByRole("button", { name: "Inserir o ID do Discord manualmente" }));
    await user.type(
      screen.getByPlaceholderText("ID numérico do usuário no Discord"),
      "123456789012345",
    );
    await user.click(screen.getByRole("button", { name: "Usar este ID" }));

    const campoNome = screen.getByPlaceholderText("Nome completo") as HTMLInputElement;
    expect(campoNome.value).toBe("123456789012345");

    // A chefe ajusta o nome manualmente depois — trocar de conta de novo não deve mais
    // sobrescrever o que ela digitou à mão.
    await user.clear(campoNome);
    await user.type(campoNome, "Nome Ajustado Pela Chefe");
    await user.click(screen.getByRole("button", { name: "Voltar para a busca na lista" }));
    await user.click(screen.getByRole("button", { name: "Inserir o ID do Discord manualmente" }));
    await user.type(
      screen.getByPlaceholderText("ID numérico do usuário no Discord"),
      "999999999999999",
    );
    await user.click(screen.getByRole("button", { name: "Usar este ID" }));

    expect(campoNome.value).toBe("Nome Ajustado Pela Chefe");
  });
});
