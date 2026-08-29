import { describe, expect, it } from "vitest";
import { parseCsvAlunos } from "../../src/application/alunos/alunos-service.js";

describe("parseCsvAlunos", () => {
  it("converte um CSV válido sem depender da camada HTTP ou do banco", () => {
    const [aluno] = parseCsvAlunos(
      'nome,matricula,turmaId,duplaId,isPcd,qtdQuestoesMeta\n"Silva, Ana",2026001,turma-1,dupla-1,sim,8',
    );

    expect(aluno).toEqual({
      nome: "Silva, Ana",
      matricula: "2026001",
      turmaId: "turma-1",
      duplaId: "dupla-1",
      isPcd: true,
      qtdQuestoesMeta: 8,
    });
  });

  it("recusa colunas obrigatórias ausentes", () => {
    expect(() => parseCsvAlunos("nome,matricula\nAna,2026001")).toThrow(
      "CSV requer a coluna turmaid",
    );
  });

  it("recusa aspas não fechadas", () => {
    expect(() =>
      parseCsvAlunos('nome,matricula,turmaId,duplaId\n"Ana,2026001,turma-1,dupla-1'),
    ).toThrow("CSV possui aspas não fechadas");
  });
});
