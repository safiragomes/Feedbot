import { describe, expect, it } from "vitest";
import { calcularPrazoEfetivo } from "../../src/domain/prazo.js";

describe("calcularPrazoEfetivo", () => {
  it("sem grupo e sem exceção usa o prazo da turma", () => {
    const prazoTurma = new Date("2026-09-20T23:59:00");
    expect(
      calcularPrazoEfetivo({ prazoIndividual: undefined, prazoGrupo: undefined, prazoTurma }),
    ).toEqual(prazoTurma);
  });

  it("com grupo e sem exceção usa o prazo do grupo, mesmo com prazo diferente na turma", () => {
    const prazoGrupo = new Date("2026-09-25T23:59:00");
    const prazoTurma = new Date("2026-09-20T23:59:00");
    expect(
      calcularPrazoEfetivo({ prazoIndividual: undefined, prazoGrupo, prazoTurma }),
    ).toEqual(prazoGrupo);
  });

  it("exceção individual prevalece mesmo com o aluno em um grupo com prazo", () => {
    const prazoIndividual = new Date("2026-09-30T23:59:00");
    const prazoGrupo = new Date("2026-09-25T23:59:00");
    const prazoTurma = new Date("2026-09-20T23:59:00");
    expect(calcularPrazoEfetivo({ prazoIndividual, prazoGrupo, prazoTurma })).toEqual(
      prazoIndividual,
    );
  });

  it("nenhum nível configurado deixa o aluno sem prazo", () => {
    expect(
      calcularPrazoEfetivo({ prazoIndividual: undefined, prazoGrupo: undefined, prazoTurma: undefined }),
    ).toBeNull();
  });
});
