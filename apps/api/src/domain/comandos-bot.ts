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
