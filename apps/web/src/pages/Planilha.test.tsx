import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Periodo } from "../lib/types";
import { PlanilhaPage } from "./Planilha";

const periodo: Periodo = {
  id: "periodo",
  nome: "2026.2",
  dataInicio: "2026-08-01T00:00:00Z",
  dataFim: "2026-12-01T00:00:00Z",
  dataReferenciaRodizio: "2026-08-03T00:00:00Z",
  ativo: true,
  whatsappAvisosId: null,
  whatsappComunidadeNome: null,
  planilhaId: "planilha",
  planilhaUrl: "https://docs.google.com/spreadsheets/d/teste/edit",
  planilhaVinculadaEm: "2026-08-30T00:00:00Z",
};

describe("PlanilhaPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mostra o status da planilha dentro do card de vínculo do período", async () => {
    vi.spyOn(api, "configuracaoPlanilha").mockResolvedValue({
      credencialConfigurada: true,
      email: "feedbot@gmail.com",
      tipo: "oauth",
      oauthConfigurado: true,
    });
    const { container } = render(
      <PlanilhaPage
        token="token"
        periodo={periodo}
        turmas={[]}
        listas={[]}
        onReload={vi.fn()}
        onRequestConfirm={vi.fn()}
      />,
    );

    await waitFor(() => expect(api.configuracaoPlanilha).toHaveBeenCalled());
    const tituloCard = screen.getByRole("heading", { name: "Vínculo do período" });
    const card = tituloCard.closest(".panel");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Vinculada")).toBeInTheDocument();
    expect(container.querySelector(".page-head .chip")).not.toBeInTheDocument();
  });
});
