function normalizarComando(texto: string) {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const COMANDOS_INICIO = new Set(["registrar feedback", "menu", "oi"]);
const COMANDOS_SAIDA = new Set(["sair", "desistir", "cancelar"]);

export function comandoIniciaFluxo(texto: string) {
  return COMANDOS_INICIO.has(normalizarComando(texto));
}

export function comandoEncerraFluxo(texto: string) {
  return COMANDOS_SAIDA.has(normalizarComando(texto));
}

export function comOpcaoDeSaida(mensagem: string) {
  return `${mensagem}\n\nDigite SAIR para desistir.`;
}

export type ValidacaoQuestoes =
  { valido: true; questoes: number[] } | { valido: false; questoes: number[] };

export function validarQuestoesInformadas(texto: string, totalQuestoes: number): ValidacaoQuestoes {
  const itens = texto
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const questoes = [...new Set(itens.map((item) => Number(item.replace(/^q/i, ""))))];
  const valido =
    itens.length > 0 &&
    Number.isInteger(totalQuestoes) &&
    totalQuestoes > 0 &&
    questoes.every(
      (questao) => Number.isInteger(questao) && questao >= 1 && questao <= totalQuestoes,
    );
  return { valido, questoes: valido ? questoes : [] };
}
