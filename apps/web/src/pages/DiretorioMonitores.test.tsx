import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Monitor } from "../lib/types";
import { DiretorioMonitores } from "./DiretorioMonitores";
import * as exportarPlanilha from "../lib/exportar-planilha";

vi.mock("../lib/exportar-planilha", () => ({
  exportarXlsx: vi.fn().mockResolvedValue(undefined),
  linhasExportacaoMonitores: vi.fn(() => []),
}));

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: `monitor-${Math.random()}`,
    nome: "Monitor Teste",
    whatsappNumero: null,
    discordUserId: null,
    discordUsername: null,
    discordDisplayName: null,
    discordAvatarUrl: null,
    isChefe: false,
    periodoId: "periodo-1",
    duplaId: null,
    status: "ATIVO",
    contaChefe: null,
    ...overrides,
  };
}

describe("DiretorioMonitores — exportação", () => {
  it("exporta todos os monitores filtrados quando nada está selecionado", async () => {
    const user = userEvent.setup();
    const monitores = [monitor({ id: "m1", nome: "Ana" }), monitor({ id: "m2", nome: "Bia" })];

    render(
      <DiretorioMonitores
        token="token"
        periodoId="periodo-1"
        monitores={monitores}
        grupos={[]}
        duplas={[]}
        alunos={[]}
        listas={[]}
        atrasos={[]}
        onOpenMonitor={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Exportar" }));

    expect(exportarPlanilha.linhasExportacaoMonitores).toHaveBeenCalledWith(monitores, [], []);
    expect(exportarPlanilha.exportarXlsx).toHaveBeenCalledWith("monitores.xlsx", []);
  });

  it("exporta só os monitores selecionados quando há seleção", async () => {
    const user = userEvent.setup();
    const monitores = [monitor({ id: "m1", nome: "Ana" }), monitor({ id: "m2", nome: "Bia" })];

    render(
      <DiretorioMonitores
        token="token"
        periodoId="periodo-1"
        monitores={monitores}
        grupos={[]}
        duplas={[]}
        alunos={[]}
        listas={[]}
        atrasos={[]}
        onOpenMonitor={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onRequestConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole("checkbox", { name: "Selecionar linha" })[0]!);
    await user.click(screen.getByRole("button", { name: "Exportar" }));

    expect(exportarPlanilha.linhasExportacaoMonitores).toHaveBeenCalledWith(
      [monitores[0]],
      [],
      [],
    );
  });
});
