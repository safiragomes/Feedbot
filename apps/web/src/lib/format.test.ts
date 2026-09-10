import { describe, expect, it } from "vitest";
import { avatarColor, fimDoDiaIso, initials, noPrazo, paraInputDate, pct } from "./format";

describe("formatação compartilhada", () => {
  it("gera iniciais, cor determinística e percentual", () => {
    expect(initials("  Maria da Silva ")).toBe("MD");
    expect(avatarColor("Maria")).toEqual(avatarColor("Maria"));
    expect(pct(3, 4)).toBe(75);
    expect(pct(1, 0)).toBe(0);
  });

  it("compara prazo e converte a data para o fim do dia local", () => {
    expect(noPrazo("2026-08-30T10:00:00Z", "2026-08-30T11:00:00Z")).toBe(true);
    expect(noPrazo("2026-08-30T12:00:00Z", "2026-08-30T11:00:00Z")).toBe(false);
    expect(noPrazo("2026-08-30T12:00:00Z", null)).toBeNull();
    expect(new Date(fimDoDiaIso("2026-08-30")).getHours()).toBe(23);
  });

  it("paraInputDate desfaz fimDoDiaIso sem perder o dia de calendário local", () => {
    // Regressão: .slice(0, 10) no ISO pega a data em UTC, que já virou o dia
    // seguinte pra fusos atrás de UTC — paraInputDate precisa devolver o
    // mesmo dia que foi passado pra fimDoDiaIso.
    for (const dia of ["2026-01-01", "2026-08-30", "2026-12-31"]) {
      expect(paraInputDate(fimDoDiaIso(dia))).toBe(dia);
    }
  });
});
