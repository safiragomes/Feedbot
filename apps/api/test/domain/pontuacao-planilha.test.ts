import { describe, expect, it } from "vitest";
import { calcularQuestoesEquivalentes } from "../../src/domain/pontuacao-planilha.js";

describe("pontuação equivalente enviada à planilha", () => {
  it("mantém os acertos reais de aluno comum", () => {
    expect(calcularQuestoesEquivalentes({ corretas: 4, total: 6, condicaoEspecial: false })).toBe(
      4,
    );
  });

  it("aumenta proporcionalmente os acertos de PCD/ND", () => {
    expect(calcularQuestoesEquivalentes({ corretas: 3, total: 6, condicaoEspecial: true })).toBe(4);
    expect(calcularQuestoesEquivalentes({ corretas: 4, total: 6, condicaoEspecial: true })).toBe(
      5.33,
    );
  });

  it("limita o equivalente ao total da lista", () => {
    expect(calcularQuestoesEquivalentes({ corretas: 5, total: 6, condicaoEspecial: true })).toBe(6);
    expect(calcularQuestoesEquivalentes({ corretas: 6, total: 6, condicaoEspecial: true })).toBe(6);
  });
});
