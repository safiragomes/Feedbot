import { describe, expect, it } from "vitest";
import { avatarColor, fimDoDiaIso, initials, noPrazo, pct, validarWhatsapp } from "./format";

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

  it("valida WhatsApp vazio, inválido, brasileiro sem o 9 e completo", () => {
    expect(validarWhatsapp("")).toContain("incompleto");
    expect(validarWhatsapp("123")).toContain("inválido");
    expect(validarWhatsapp("+55 81 3456-7890")).toContain("Falta o 9");
    expect(validarWhatsapp("+55 81 98765-4321")).toBeNull();
  });
});
