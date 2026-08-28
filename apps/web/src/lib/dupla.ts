/**
 * O monitor da semana B de um aluno nunca é armazenado — é sempre "o outro
 * monitor da dupla", ou o próprio monitor da semana A quando a dupla não tem
 * um segundo monitor (chefe sem parceiro; ver mesma regra no backend em
 * apps/api/src/domain/monitorSemana.ts).
 */
export function monitorSemanaB<M extends { id: string }>(
  monitoresDupla: M[],
  monitorSemanaAId: string | null,
): M | null {
  if (!monitorSemanaAId) return null;
  return (
    monitoresDupla.find((m) => m.id !== monitorSemanaAId) ??
    monitoresDupla.find((m) => m.id === monitorSemanaAId) ??
    null
  );
}
