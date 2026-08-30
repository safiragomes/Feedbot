export function identificacaoPublicaAluno(aluno: { nome: string; turma: { nome: string } }) {
  return `${aluno.nome} | ${aluno.turma.nome}`;
}
