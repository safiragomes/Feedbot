import { describe, expect, it } from "vitest";
import {
  comandoEncerraFluxo,
  comandoIniciaFluxo,
  comOpcaoDeSaida,
  validarQuestoesInformadas,
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

  it("aceita questões únicas dentro do total da lista", () => {
    expect(validarQuestoesInformadas("q1, 3 3, 10", 10)).toEqual({
      valido: true,
      questoes: [1, 3, 10],
    });
  });

  it.each(["", "0", "1, 11", "2, resposta", "1.5"])(
    "recusa imediatamente questões inválidas: %s",
    (entrada) => {
      expect(validarQuestoesInformadas(entrada, 10)).toEqual({ valido: false, questoes: [] });
    },
  );
});
