export type Periodo = {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  dataReferenciaRodizio: string;
  ativo: boolean;
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
  duplaId: string | null;
  periodoId: string;
  status: "ATIVO" | "INATIVO";
  dupla: (Dupla & { grupoRevisao: GrupoRevisao }) | null;
  contaChefe: { email: string } | null;
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
  monitorSemanaAId: string | null;
  monitorSemanaBId: string | null;
  label: string;
  grupoRevisao?: GrupoRevisao;
  monitorSemanaA?: Monitor | null;
  monitorSemanaB?: Monitor | null;
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
  turma: Turma;
  dupla: Dupla;
};

export type Lista = {
  id: string;
  periodoId: string;
  nome: string;
  qtdQuestoesTotal: number;
  prazoEntregaFeedback: string;
  semanaOverride: "A" | "B" | null;
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

export type Chefe = { id: string; nome: string; email: string };
