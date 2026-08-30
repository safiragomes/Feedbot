import { parsePhoneNumberFromString } from "libphonenumber-js";

const AVATAR_PALETTE: [string, string][] = [
  ["var(--gold)", "var(--gold-dim)"],
  ["var(--sage)", "var(--sage-dim)"],
  ["var(--plum)", "var(--plum-dim)"],
  ["var(--rose)", "var(--rose-dim)"],
  ["var(--sky)", "var(--sky-dim)"],
];

export function initials(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function avatarColor(seed: string): [string, string] {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash]!;
}

export function pct(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

export function turmasUnicas(alunos: Array<{ turma: { nome: string } }>): string[] {
  return [...new Set(alunos.map((aluno) => aluno.turma.nome))].sort((a, b) => a.localeCompare(b));
}

export function noPrazo(criadoEm: string, prazoEntregaFeedback: string | null): boolean | null {
  if (!prazoEntregaFeedback) return null;
  return new Date(criadoEm).getTime() <= new Date(prazoEntregaFeedback).getTime();
}

/** O seletor informa só a data; o prazo vale até o fim daquele dia local. */
export function fimDoDiaIso(data: string) {
  return new Date(`${data}T23:59:59.999`).toISOString();
}

/**
 * Valida um número de WhatsApp e devolve uma mensagem de erro, ou null se estiver ok.
 * Usa libphonenumber (mesmo algoritmo usado pela API para casar o remetente das
 * mensagens do bot) em vez de checagem de tamanho de dígitos — aceita qualquer
 * formatação de entrada e detecta números com DDD ou DDI inválidos, não só o
 * comprimento. O bot ainda aceita o número brasileiro com ou sem o 9º dígito do
 * celular ao casar o remetente, mas orientamos a digitar com o 9 por ser o formato
 * atual.
 */
export function validarWhatsapp(numero: string): string | null {
  const digitos = numero.replace(/\D/g, "");
  if (!digitos) return "Número incompleto — inclua DDI, DDD e o número completo.";
  const parsed = parsePhoneNumberFromString(numero, "BR");
  if (!parsed?.isValid())
    return "Número inválido — confira o DDI, o DDD e a quantidade de dígitos.";
  if (parsed.country === "BR" && parsed.nationalNumber.length === 10) {
    return "Falta o 9 do celular — números do Brasil têm DDI + DDD + 9 dígitos (ex: +55 81 9XXXX-XXXX).";
  }
  return null;
}
