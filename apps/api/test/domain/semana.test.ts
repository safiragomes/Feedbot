import { describe, expect, it } from "vitest";
import { calcularSemana } from "../../src/domain/semana.js";

describe("calcularSemana", () => {
  it("retorna A para a primeira lista", () => {
    expect(calcularSemana({ posicaoLista: 1 })).toBe("A");
  });

  it("retorna B para a segunda lista", () => {
    expect(calcularSemana({ posicaoLista: 2 })).toBe("B");
  });

  it("alterna A/B por posição ímpar/par nas listas seguintes", () => {
    expect(calcularSemana({ posicaoLista: 3 })).toBe("A");
    expect(calcularSemana({ posicaoLista: 4 })).toBe("B");
    expect(calcularSemana({ posicaoLista: 5 })).toBe("A");
    expect(calcularSemana({ posicaoLista: 6 })).toBe("B");
  });

  it("respeita o semanaOverride da lista, ignorando a posição", () => {
    expect(calcularSemana({ posicaoLista: 1, semanaOverride: "B" })).toBe("B");
    expect(calcularSemana({ posicaoLista: 2, semanaOverride: "A" })).toBe("A");
  });

  it("trata semanaOverride nulo como ausente", () => {
    expect(calcularSemana({ posicaoLista: 2, semanaOverride: null })).toBe("B");
  });
});
