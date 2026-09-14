/**
 * Prazo efetivo de entrega de feedback de um aluno para uma lista: a exceção
 * individual do aluno tem prioridade sobre o prazo do grupo de prazo do
 * aluno, que por sua vez tem prioridade sobre o prazo da turma. A ausência de
 * qualquer um deles é "sem prazo configurado" nesse nível, nunca um erro — só
 * quando nenhum dos três existe o aluno fica de fato sem prazo (não conta
 * como atraso). Função pura para poder ser testada sem banco e para ser a
 * única fonte da regra (antes duplicada entre services/atrasos.ts e
 * routes/feedback.ts).
 */
export function calcularPrazoEfetivo(input: {
  prazoIndividual: Date | null | undefined;
  prazoGrupo: Date | null | undefined;
  prazoTurma: Date | null | undefined;
}): Date | null {
  return input.prazoIndividual ?? input.prazoGrupo ?? input.prazoTurma ?? null;
}
