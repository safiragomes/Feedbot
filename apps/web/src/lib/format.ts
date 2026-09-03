const AVATAR_PALETTE: [string, string][] = [
  ["var(--gold)", "var(--gold-dim)"],
  ["var(--sage)", "var(--sage-dim)"],
  ["var(--plum)", "var(--plum-dim)"],
  ["var(--rose)", "var(--rose-dim)"],
  ["var(--sky)", "var(--sky-dim)"],
];

// Separa a letra do diacrítico via Unicode NFD e descarta o diacrítico — "José" casa com "jose".
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

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
