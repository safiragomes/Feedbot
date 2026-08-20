const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function trueMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export interface CalcularSemanaParams {
  hoje: Date;
  dataReferenciaRodizio: Date;
  semanaOverride?: "A" | "B" | null;
}

/**
 * Espelha a fórmula da spec mestra § 2.2:
 * semana = lista.semana_override OR (FLOOR(DATEDIFF(hoje, data_referencia_rodizio) / 7) % 2 == 0 ? 'A' : 'B')
 */
export function calcularSemana({
  hoje,
  dataReferenciaRodizio,
  semanaOverride,
}: CalcularSemanaParams): "A" | "B" {
  if (semanaOverride) {
    return semanaOverride;
  }

  const diffDias = Math.floor(
    (toUtcMidnight(hoje) - toUtcMidnight(dataReferenciaRodizio)) / MS_PER_DAY,
  );
  const semanaIndex = trueMod(Math.floor(diffDias / 7), 2);

  return semanaIndex === 0 ? "A" : "B";
}
