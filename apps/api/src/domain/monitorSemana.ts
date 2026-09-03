/**
 * Regra única de "quem cobre a semana X" de um aluno: semana A é sempre
 * `monitorSemanaAId`; semana B é o outro monitor da dupla, ou o próprio
 * `monitorSemanaAId` quando a dupla não tem um segundo monitor (chefe sem
 * parceiro). `outroMonitorId` é responsabilidade do chamador resolver via
 * Prisma — esta função é pura para poder ser testada sem banco e para ser a
 * única fonte da regra (antes duplicada entre services/feedback.ts e
 * services/discord-bot.ts).
 *
 * Assume que `monitorSemanaAId`, quando não nulo, sempre pertence à dupla do
 * aluno — invariante garantida por `validateAlunoMonitorA` em
 * routes/management.ts (POST /alunos e PATCH /alunos/:id).
 */
export function monitorDaSemana(
  input: { monitorSemanaAId: string | null; outroMonitorId: string | null },
  semana: "A" | "B",
): string | null {
  if (semana === "A") return input.monitorSemanaAId;
  if (!input.monitorSemanaAId) return null;
  return input.outroMonitorId ?? input.monitorSemanaAId;
}

export function semanasCobertasPorMonitor(
  input: { monitorSemanaAId: string | null; outroMonitorId: string | null },
  monitorId: string,
): Set<"A" | "B"> {
  const semanas = new Set<"A" | "B">();
  if (monitorDaSemana(input, "A") === monitorId) semanas.add("A");
  if (monitorDaSemana(input, "B") === monitorId) semanas.add("B");
  return semanas;
}

/**
 * Resolve o papel usando todos os membros da dupla. O "outro monitor" é sempre
 * relativo ao monitor A do aluno, e não ao monitor que está consultando. Essa
 * diferença é essencial quando o próprio consulente é o monitor B.
 */
export function semanasCobertasPorMonitorNaDupla(
  input: { monitorSemanaAId: string | null; monitorIds: string[] },
  monitorId: string,
) {
  const outroMonitorId = input.monitorSemanaAId
    ? (input.monitorIds.find((id) => id !== input.monitorSemanaAId) ?? null)
    : null;
  return semanasCobertasPorMonitor(
    { monitorSemanaAId: input.monitorSemanaAId, outroMonitorId },
    monitorId,
  );
}
