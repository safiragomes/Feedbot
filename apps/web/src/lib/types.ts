export type Periodo = {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  dataReferenciaRodizio: string;
  ativo: boolean;
  whatsappAvisosId: string | null;
  whatsappComunidadeNome: string | null;
  planilhaId: string | null;
  planilhaUrl: string | null;
  planilhaVinculadaEm: string | null;
};

export type ConfiguracaoPlanilha = {
  credencialConfigurada: boolean;
  email: string | null;
  tipo: "oauth" | "servico" | null;
  oauthConfigurado: boolean;
};

export type ItemPreviaImportacaoAluno = {
  turmaId: string;
  turmaNome: string;
  linha: number;
  matricula: string;
  nome: string;
  status: "novo" | "cadastrado" | "invalido" | "duplicado" | "conflito";
  motivo?: string;
};

export type PreviaImportacaoAlunos = {
  itens: ItemPreviaImportacaoAluno[];
  resumo: {
    novos: number;
    cadastrados: number;
    invalidos: number;
  };
};

export type Turma = {
  id: string;
  periodoId: string;
  nome: string;
  nomeAbaPlanilha: string;
};

export type Monitor = {
  id: string;
  nome: string;
  whatsappNumero: string;
  isChefe: boolean;
  periodoId: string;
  duplaId: string | null;
  status: "ATIVO" | "INATIVO";
  contaChefe: { email: string } | null;
  conviteContaChefe?: { email: string; expiraEm: string; usadoEm: string | null } | null;
  dupla?: { id: string; label: string; grupoRevisaoId: string } | null;
};

export type GrupoRevisao = {
  id: string;
  periodoId: string;
  chefeId: string;
  nome: string;
  whatsappGrupoId: string | null;
  whatsappGrupoNome: string | null;
  chefe?: Monitor;
  duplas?: Dupla[];
};

export type Dupla = {
  id: string;
  grupoRevisaoId: string;
  label: string;
  grupoRevisao?: GrupoRevisao;
  monitores?: Monitor[];
  _count?: { alunos: number };
};

export type Aluno = {
  id: string;
  nome: string;
  matricula: string;
  turmaId: string;
  duplaId: string | null;
  isPcd: boolean;
  qtdQuestoesMeta: number | null;
  monitorSemanaAId: string | null;
  turma: Turma;
  dupla: Dupla | null;
  monitorSemanaA?: Monitor | null;
  prazosIndividuais: { listaId: string; prazoEntregaFeedback: string }[];
};

export type Lista = {
  id: string;
  periodoId: string;
  nome: string;
  qtdQuestoesTotal: number;
  ordem: number;
  semanaOverride: "A" | "B" | null;
  prazos: { turmaId: string; prazoEntregaFeedback: string }[];
};

export type PrazoListaItem = {
  listaId: string;
  listaNome: string;
  ordem: number;
  qtdQuestoesTotal: number;
  prazoEntregaFeedback: string | null;
};

export type Feedback = {
  id: string;
  alunoId: string;
  monitorId: string;
  listaId: string;
  duplaId: string;
  semana: "A" | "B";
  qtdQuestoesPontuadas: number;
  usouIa: boolean;
  plagiou: boolean;
  usouProibicao: boolean;
  criadoEm: string;
  sincronizadoPlanilha: boolean;
  prazoEntregaFeedback: string | null;
  aluno: { id: string; nome: string; turma: Turma };
  monitor: { id: string; nome: string };
  lista: Lista;
  questoesIa: { numeroQuestao: number }[];
  questoesPlagio: {
    numeroQuestao: number;
    alunoEnvolvidoId: string;
    alunoEnvolvido: { id: string; nome: string };
  }[];
  questoesProibicao: { numeroQuestao: number }[];
};

export type Bot = {
  sessao: { status: "DESCONECTADO" | "CONECTANDO" | "CONECTADO"; numeroConectado?: string } | null;
  qr?: string;
};

export type Atraso = {
  alunoId: string;
  alunoNome: string;
  listaId: string;
  listaNome: string;
  monitorId: string;
  monitorNome: string;
  duplaId: string;
  prazoEntregaFeedback: string;
};

export type Chefe = { id: string; nome: string; email: string };
