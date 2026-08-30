import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
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
});
