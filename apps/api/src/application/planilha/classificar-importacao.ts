export type LinhaAlunoPlanilha = {
  turmaId: string;
  turmaNome: string;
  linha: number;
  matricula: string;
  nome: string;
  valido: boolean;
};

export type AlunoExistenteImportacao = {
  matricula: string;
  periodoId: string;
};

export type ItemPreviaImportacaoAluno = Omit<LinhaAlunoPlanilha, "valido"> & {
  status: "novo" | "cadastrado" | "invalido" | "duplicado" | "conflito";
  motivo?: string;
};

export type PreviaImportacaoAlunos = {
  itens: ItemPreviaImportacaoAluno[];
  resumo: { novos: number; cadastrados: number; invalidos: number };
};

export function classificarImportacaoAlunos(
  linhas: LinhaAlunoPlanilha[],
  existentes: AlunoExistenteImportacao[],
  periodoId: string,
): PreviaImportacaoAlunos {
  const ocorrencias = new Map<string, number>();
  for (const aluno of linhas)
    ocorrencias.set(aluno.matricula, (ocorrencias.get(aluno.matricula) ?? 0) + 1);
  const porMatricula = new Map(existentes.map((aluno) => [aluno.matricula, aluno]));
  const itens: ItemPreviaImportacaoAluno[] = linhas.map(({ valido, ...base }) => {
    if (!valido) return { ...base, status: "invalido", motivo: "Nome ausente" };
    if ((ocorrencias.get(base.matricula) ?? 0) > 1)
      return { ...base, status: "duplicado", motivo: "Matrícula repetida na planilha" };
    const existente = porMatricula.get(base.matricula);
    if (!existente) return { ...base, status: "novo" };
    if (existente.periodoId !== periodoId)
      return { ...base, status: "conflito", motivo: "Matrícula já usada em outro período" };
    return { ...base, status: "cadastrado" };
  });
  return {
    itens,
    resumo: {
      novos: itens.filter((item) => item.status === "novo").length,
      cadastrados: itens.filter((item) => item.status === "cadastrado").length,
      invalidos: itens.filter((item) => ["invalido", "duplicado", "conflito"].includes(item.status))
        .length,
    },
  };
}

export function selecionarNovosParaImportacao(
  previa: PreviaImportacaoAlunos,
  matriculasSelecionadas: string[],
) {
  const selecionadas = new Set(matriculasSelecionadas);
  return previa.itens.filter((item) => item.status === "novo" && selecionadas.has(item.matricula));
}
