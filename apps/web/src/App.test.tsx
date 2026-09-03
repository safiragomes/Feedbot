import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Mock mínimo do backend cobrindo login + os 9 endpoints que App.tsx carrega em
 * sequência ao entrar. Serve pra exercitar o fluxo login → load() → dashboard sem
 * depender de uma API real — inclusive os dois efeitos novos (token/periodoId) que
 * corrigiram o carregamento duplicado no boot.
 */
function mockarBackend() {
  const chefe = { id: "chefe-1", nome: "Chefe Teste", email: "chefe@teste.dev" };
  const periodo = {
    id: "periodo-1",
    nome: "2026.2",
    dataInicio: "2026-08-01T00:00:00.000Z",
    dataFim: "2026-12-01T00:00:00.000Z",
    dataReferenciaRodizio: "2026-08-01T00:00:00.000Z",
    ativo: true,
    discordGuildId: null,
    discordMonitoresRoleId: null,
    discordAvisosCanalId: null,
    discordAvisosCanalNome: null,
    planilhaId: null,
    planilhaUrl: null,
    planilhaVinculadaEm: null,
  };

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";

    if (path === "/auth/login" && method === "POST") {
      return jsonResponse({ expiraEm: new Date().toISOString(), chefe });
    }
    if (path === "/periodos") return jsonResponse([periodo]);
    if (
      [
        "/turmas",
        "/grupos-revisao",
        "/duplas",
        "/monitores",
        "/alunos",
        "/listas",
        "/feedbacks",
        "/atrasos",
      ].includes(path)
    )
      return jsonResponse([]);
    if (path === "/bot") return jsonResponse({ sessao: null });
    return jsonResponse({ message: `endpoint não mockado: ${path}` }, 404);
  });
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the centered login form with the Feedbot brand", () => {
    const { container } = render(<App />);

    expect(screen.getByRole("heading", { name: "Entrar no painel" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail institucional")).toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/feedbot-logo.png"]')).toBeInTheDocument();
  });

  it("inicia no modo noturno e permite escolher o modo diurno no login", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    const alternarTema = screen.getByRole("button", { name: "Ativar modo diurno" });
    await user.click(alternarTema);

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("feedbot-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Ativar modo noturno" })).toBeInTheDocument();
  });

  it("faz login, carrega o painel uma única vez e não deixa erro de sessão anterior grudado", async () => {
    const fetchMock = mockarBackend();
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("E-mail institucional"), "chefe@teste.dev");
    await user.type(screen.getByLabelText("Senha"), "senha-de-teste-1234");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByText("Período ativo")).toBeInTheDocument());

    // handleLogin limpa qualquer erro de sessão que a restauração silenciosa
    // anterior (api.me()) possa ter deixado — não pode piscar no painel novo.
    expect(screen.queryByText(/Sessão inválida/)).not.toBeInTheDocument();

    // O efeito de token dispara load() uma vez; load() resolve o período padrão e
    // seta periodoResolvidoAoCarregar, que faz o efeito de periodoId ignorar a
    // rodada extra — sem isso, cada uma dessas 10 chamadas (períodos + os 9 do
    // Promise.all) aconteceria duas vezes.
    const chamadasDeDados = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input.toString();
      return !url.includes("/auth/");
    });
    expect(chamadasDeDados).toHaveLength(10);
  });
});
