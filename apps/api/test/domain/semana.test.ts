import { describe, expect, it } from "vitest";
import { calcularSemana } from "../../src/domain/semana.js";

const referencia = new Date("2026-08-03T00:00:00Z"); // uma segunda-feira

describe("calcularSemana", () => {
  it("retorna o override quando a lista define semana_override, ignorando as datas", () => {
    expect(
      calcularSemana({
        hoje: new Date("2026-01-01T00:00:00Z"),
        dataReferenciaRodizio: referencia,
        semanaOverride: "B",
      }),
    ).toBe("B");
  });

  it("retorna A no dia exato da data de referência", () => {
    expect(
      calcularSemana({ hoje: referencia, dataReferenciaRodizio: referencia, semanaOverride: null }),
    ).toBe("A");
  });

  it("retorna A durante toda a primeira semana (dias 0 a 6)", () => {
    const dia6 = new Date("2026-08-09T00:00:00Z");
    expect(
      calcularSemana({ hoje: dia6, dataReferenciaRodizio: referencia, semanaOverride: null }),
    ).toBe("A");
  });

  it("retorna B na segunda semana (dias 7 a 13)", () => {
    const dia7 = new Date("2026-08-10T00:00:00Z");
    const dia13 = new Date("2026-08-16T00:00:00Z");
    expect(
      calcularSemana({ hoje: dia7, dataReferenciaRodizio: referencia, semanaOverride: null }),
    ).toBe("B");
    expect(
      calcularSemana({ hoje: dia13, dataReferenciaRodizio: referencia, semanaOverride: null }),
    ).toBe("B");
  });

  it("volta para A na terceira semana (dia 14)", () => {
    const dia14 = new Date("2026-08-17T00:00:00Z");
    expect(
      calcularSemana({ hoje: dia14, dataReferenciaRodizio: referencia, semanaOverride: null }),
    ).toBe("A");
  });

  it("calcula corretamente para datas anteriores à referência", () => {
    const seteDiasAntes = new Date("2026-07-27T00:00:00Z");
    const catorzeDiasAntes = new Date("2026-07-20T00:00:00Z");
    expect(
      calcularSemana({
        hoje: seteDiasAntes,
        dataReferenciaRodizio: referencia,
        semanaOverride: null,
      }),
    ).toBe("B");
    expect(
      calcularSemana({
        hoje: catorzeDiasAntes,
        dataReferenciaRodizio: referencia,
        semanaOverride: null,
      }),
    ).toBe("A");
  });
});
