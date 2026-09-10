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

/**
 * Inverso de fimDoDiaIso, pra reabrir um prazo salvo num `<input type="date">`.
 * Precisa ler ano/mês/dia locais (getFullYear/getMonth/getDate) em vez de
 * `.slice(0, 10)` no ISO: o ISO está em UTC, e um prazo salvo como "fim do dia
 * local" já virou o dia seguinte em UTC pra qualquer fuso atrás de UTC (ex.:
 * Brasil) — `.slice(0, 10)` reabriria o seletor um dia à frente do definido.
 */
export function paraInputDate(iso: string): string {
  const data = new Date(iso);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const formatadorData = new Intl.DateTimeFormat("pt-BR");

export function formatarData(iso: string | null | undefined): string | null {
  return iso ? formatadorData.format(new Date(iso)) : null;
}
