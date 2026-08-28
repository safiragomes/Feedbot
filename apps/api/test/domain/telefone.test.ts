import { describe, expect, it } from "vitest";
import { normalizarWhatsapp, variantesWhatsapp } from "../../src/domain/telefone.js";

describe("normalizarWhatsapp", () => {
  it("normaliza várias formatações do mesmo número BR para o mesmo E.164", () => {
    const esperado = "+5581987654321";
    expect(normalizarWhatsapp("+55 81 98765-4321")).toBe(esperado);
    expect(normalizarWhatsapp("81987654321")).toBe(esperado);
    expect(normalizarWhatsapp("(81) 98765-4321")).toBe(esperado);
    expect(normalizarWhatsapp("5581987654321")).toBe(esperado);
    expect(normalizarWhatsapp("+5581987654321")).toBe(esperado);
  });

  it("aceita o prefixo de tronco 0 (discagem interurbana nacional)", () => {
    expect(normalizarWhatsapp("081987654321")).toBe("+5581987654321");
  });

  it("retorna null para entrada inválida ou curta demais", () => {
    expect(normalizarWhatsapp("abc")).toBeNull();
    expect(normalizarWhatsapp("123")).toBeNull();
    expect(normalizarWhatsapp("")).toBeNull();
  });
});

describe("variantesWhatsapp", () => {
  it("número BR com o 9º dígito do celular gera a variante sem o 9 também", () => {
    const variantes = variantesWhatsapp("+55 81 98765-4321");
    expect(variantes).toContain("5581987654321");
    expect(variantes).toContain("558187654321");
  });

  it("número BR sem o 9º dígito do celular gera a variante com o 9 também", () => {
    const variantes = variantesWhatsapp("8187654321");
    expect(variantes).toContain("558187654321");
    expect(variantes).toContain("5581987654321");
  });

  it("retorna array vazio para entrada inválida", () => {
    expect(variantesWhatsapp("abc")).toEqual([]);
  });

  it(
    "comportamento conhecido: um número BR de 8 dígitos (nunca foi celular) ainda " +
      "ganha uma variante espúria de 9 dígitos, já que a função só olha tamanho/prefixo, " +
      "não se o número é de fato um celular",
    () => {
      // "3222-1234" é um formato típico de fixo (DDD + 8 dígitos começando em dígito
      // baixo) — mesmo assim, variantesWhatsapp gera as duas variantes.
      const variantes = variantesWhatsapp("81 3222-1234");
      expect(variantes).toContain("558132221234");
      expect(variantes).toContain("5581932221234");
    },
  );
});
