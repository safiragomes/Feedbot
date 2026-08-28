export interface CalcularSemanaParams {
  posicaoLista: number;
  semanaOverride?: "A" | "B" | null;
}

/**
 * A semana A/B é definida pela posição da lista na ordem do período, não pela
 * data: Lista 1 é sempre do monitor da semana A, Lista 2 da semana B, Lista 3
 * da semana A, e assim por diante (posição ímpar = A, par = B). `semanaOverride`
 * permite ao chefe forçar a semana de uma lista específica quando necessário.
 */
export function calcularSemana({ posicaoLista, semanaOverride }: CalcularSemanaParams): "A" | "B" {
  if (semanaOverride) return semanaOverride;
  return posicaoLista % 2 === 1 ? "A" : "B";
}
