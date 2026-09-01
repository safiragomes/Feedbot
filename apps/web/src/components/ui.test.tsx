import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Modal } from "./ui";

describe("Modal", () => {
  it("renderiza o overlay diretamente no body para não herdar contextos de empilhamento", () => {
    const { container } = render(
      <aside>
        <Modal onClose={() => undefined}>Alterar senha</Modal>
      </aside>,
    );

    expect(container.querySelector(".overlay")).not.toBeInTheDocument();
    expect(screen.getByText("Alterar senha").closest(".overlay")?.parentElement).toBe(
      document.body,
    );
  });
});
