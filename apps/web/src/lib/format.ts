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

export function noPrazo(criadoEm: string, prazoEntregaFeedback: string): boolean {
  return new Date(criadoEm).getTime() <= new Date(prazoEntregaFeedback).getTime();
}
