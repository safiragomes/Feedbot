import { describe, expect, it } from "vitest";
import {
  comandoEncerraFluxo,
  comandoIniciaFluxo,
  comOpcaoDeSaida,
} from "../../src/domain/comandos-bot.js";

describe("comandos do bot", () => {
  it.each(["Registrar feedback", " REGISTRAR FEEDBACK ", "menu", "OI"])(
    "reinicia o fluxo com %s",
    (comando) => expect(comandoIniciaFluxo(comando)).toBe(true),
  );

  it.each(["sair", "DESISTIR", " cancelar "])("encerra o fluxo com %s", (comando) =>
    expect(comandoEncerraFluxo(comando)).toBe(true),
  );

  it("inclui uma saída explícita nas perguntas", () => {
    expect(comOpcaoDeSaida("Qual lista?")).toContain("Digite SAIR para desistir.");
  });
});
