import { describe, expect, it } from "vitest";
import { identificacaoPublicaAluno } from "../../src/domain/identificacao-aluno.js";

describe("identificacaoPublicaAluno", () => {
  it("exibe nome e turma sem expor a matrícula", () => {
    const aluno = {
      nome: "Maria da Silva Souza",
      matricula: "20260012345",
      turma: { nome: "CC/IA" },
    };

    expect(identificacaoPublicaAluno(aluno)).toBe("Maria da Silva Souza | CC/IA");
    expect(identificacaoPublicaAluno(aluno)).not.toContain(aluno.matricula);
  });
});
