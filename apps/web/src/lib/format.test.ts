import { describe, expect, it } from "vitest";
import { avatarColor, fimDoDiaIso, initials, noPrazo, pct } from "./format";

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
});
