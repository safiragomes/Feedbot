import { describe, expect, it } from "vitest";
import {
  extrairAlunosDaAba,
  extrairIdPlanilha,
  localizarColunaNome,
  localizarColunaMatricula,
  localizarColunaQuestoes,
  normalizarMatricula,
} from "../../src/domain/planilha.js";

describe("mapeamento da planilha", () => {
  const cabecalhos = [
    ["ATENÇÃO"],
    ["", "", "Comandos", "", "", "", "Laços"],
    ["", "", "Lista 1", "", "", "", "Lista 2"],
    ["Aluno", "Matrícula", "Questões corretas", "Nota", "", "", "Questões corretas", "Nota"],
  ];

  it("extrai o ID de links do Google Sheets", () => {
    expect(
      extrairIdPlanilha(
        "https://docs.google.com/spreadsheets/d/1LIq24uiZy1qBP4IVmI1C1IrFwrhZjwNQn7kl6rSSI6E/edit?gid=1",
      ),
    ).toBe("1LIq24uiZy1qBP4IVmI1C1IrFwrhZjwNQn7kl6rSSI6E");
  });

  it("localiza somente as colunas de questões corretas", () => {
    expect(localizarColunaQuestoes(cabecalhos, "Lista 1")).toBe("C");
    expect(localizarColunaQuestoes(cabecalhos, "Lista 2")).toBe("G");
    expect(localizarColunaQuestoes(cabecalhos, "Lista 3")).toBeNull();
  });

  it("localiza a matrícula e normaliza valores numéricos", () => {
    expect(localizarColunaMatricula(cabecalhos)).toBe("B");
    expect(normalizarMatricula(20260048881)).toBe("20260048881");
    expect(normalizarMatricula("20260048881.0")).toBe("20260048881");
  });

  it("localiza a coluna de nome ignorando acentos e caixa", () => {
    expect(localizarColunaNome([["Matrícula", "NÔME DO ALUNO"]])).toBe("B");
  });

  it("extrai nome e matrícula a partir da linha real do cabeçalho", () => {
    expect(
      extrairAlunosDaAba([
        ["Relatório da turma"],
        ["Matrícula", "Nome"],
        [20260010001, "Ana Lima"],
        ["20260010002.0", "Bruno Melo"],
        ["", ""],
        ["sem matrícula", "Inválido"],
        ["1234567890", "Matrícula curta"],
        ["123456789012", "Matrícula longa"],
        ["20260010003", ""],
      ]),
    ).toEqual([
      { linha: 3, matricula: "20260010001", nome: "Ana Lima", valido: true },
      { linha: 4, matricula: "20260010002", nome: "Bruno Melo", valido: true },
      { linha: 9, matricula: "20260010003", nome: "", valido: false },
    ]);
  });
});
