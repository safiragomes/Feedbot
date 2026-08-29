import { describe, expect, it } from "vitest";
import {
  classificarImportacaoAlunos,
  selecionarNovosParaImportacao,
} from "../../src/application/planilha/classificar-importacao.js";

const linha = (matricula: string, linhaNumero: number) => ({
  turmaId: "turma-1",
  turmaNome: "CC/IA",
  linha: linhaNumero,
  matricula,
  nome: `Aluno ${linhaNumero}`,
  valido: true,
});

describe("classificação da importação", () => {
  it("separa novos, cadastrados, duplicados e conflitos sem acessar infraestrutura", () => {
    const previa = classificarImportacaoAlunos(
      [
        linha("20260000001", 2),
        linha("20260000002", 3),
        linha("20260000003", 4),
        linha("20260000003", 5),
      ],
      [
        { matricula: "20260000001", periodoId: "periodo-atual" },
        { matricula: "20260000002", periodoId: "outro-periodo" },
      ],
      "periodo-atual",
    );
    expect(previa.itens.map((item) => item.status)).toEqual([
      "cadastrado",
      "conflito",
      "duplicado",
      "duplicado",
    ]);
    expect(previa.resumo).toEqual({ novos: 0, cadastrados: 1, invalidos: 3 });
  });

  it("autoriza somente novos explicitamente selecionados", () => {
    const previa = classificarImportacaoAlunos(
      [linha("20260000001", 2), linha("20260000002", 3)],
      [{ matricula: "20260000002", periodoId: "periodo-atual" }],
      "periodo-atual",
    );
    expect(
      selecionarNovosParaImportacao(previa, ["20260000001", "20260000002", "99999999999"]),
    ).toEqual([expect.objectContaining({ matricula: "20260000001", status: "novo" })]);
  });
});
