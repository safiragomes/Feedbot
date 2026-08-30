import { describe, expect, it } from "vitest";
import { classificarMonitoresComAtraso } from "./monitor-risco";
import type { Atraso } from "./types";

function atraso(monitorId: string, monitorNome: string, alunoId: string): Atraso {
  return {
    monitorId,
    monitorNome,
    alunoId,
    alunoNome: `Aluno ${alunoId}`,
    listaId: "lista-1",
    listaNome: "Lista 1",
    duplaId: "dupla-1",
    prazoEntregaFeedback: "2026-08-01T00:00:00.000Z",
  };
}

describe("classificação de monitores com atraso", () => {
  it("não inclui monitor sem atraso aberto, mesmo com histórico ruim", () => {
    const resultado = classificarMonitoresComAtraso(
      [atraso("m2", "Bruna", "a1")],
      [
        { id: "m1", nome: "Ana", comPrazo: 10, noPrazo: 0 },
        { id: "m2", nome: "Bruna", comPrazo: 10, noPrazo: 10 },
      ],
    );
    expect(resultado.map((item) => item.monitorId)).toEqual(["m2"]);
  });

  it("inclui monitor sem histórico e prioriza quem tem mais atrasos abertos", () => {
    const resultado = classificarMonitoresComAtraso(
      [atraso("m1", "Ana", "a1"), atraso("m1", "Ana", "a2"), atraso("m2", "Bruna", "a3")],
      [{ id: "m2", nome: "Bruna", comPrazo: 2, noPrazo: 1 }],
    );
    expect(resultado).toMatchObject([
      { monitorId: "m1", atrasosAbertos: 2, taxaPrazo: null },
      { monitorId: "m2", atrasosAbertos: 1, taxaPrazo: 50 },
    ]);
  });
});
