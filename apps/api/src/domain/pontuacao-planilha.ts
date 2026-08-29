export function calcularQuestoesEquivalentes({
  corretas,
  total,
  condicaoEspecial,
}: {
  corretas: number;
  total: number;
  condicaoEspecial: boolean;
}) {
  if (!condicaoEspecial) return corretas;
  const proporcional = Math.round((corretas / 0.75) * 100) / 100;
  return Math.min(total, proporcional);
}
