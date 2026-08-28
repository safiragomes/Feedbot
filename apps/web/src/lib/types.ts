export type Periodo = {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  dataReferenciaRodizio: string;
  ativo: boolean;
  whatsappAvisosId: string | null;
  whatsappComunidadeNome: string | null;
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
  duplaId: string;
  isPcd: boolean;
  qtdQuestoesMeta: number | null;
  monitorSemanaAId: string | null;
  turma: Turma;
  dupla: Dupla;
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
  alunoId: string; alunoNome: string; listaId: string; listaNome: string;
  monitorId: string; monitorNome: string; duplaId: string; prazoEntregaFeedback: string;
};

export type Chefe = { id: string; nome: string; email: string };
