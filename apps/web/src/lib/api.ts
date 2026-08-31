import type {
  Aluno,
  Atraso,
  Bot,
  Chefe,
  ConfiguracaoPlanilha,
  Dupla,
  Feedback,
  GrupoRevisao,
  Lista,
  Monitor,
  Periodo,
  PreviaImportacaoAlunos,
  PrazoListaItem,
  Turma,
} from "./types";

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "x-feedbot-client": "web",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && token) window.dispatchEvent(new Event("feedbot:unauthorized"));
  if (!response.ok) throw new ApiError(body.message ?? "Falha na comunicação com a API");
  return body as T;
}

export async function login(email: string, senha: string) {
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-feedbot-client": "web" },
    body: JSON.stringify({ email, senha }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? "Não foi possível entrar");
  return body as { expiraEm: string; chefe: Chefe };
}

export function logout(token: string) {
  return request<void>("/auth/logout", token, { method: "POST" });
}

export function me() {
  return request<{ chefe: Chefe }>("/auth/me", "");
}

export function concluirConvite(tokenConvite: string, senha: string) {
  return request<void>("/auth/convites/concluir", "", {
    method: "POST",
    body: JSON.stringify({ token: tokenConvite, senha }),
  });
}

export function solicitarRecuperacaoSenha(email: string) {
  return request<void>("/auth/senha/solicitar-recuperacao", "", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function redefinirSenha(tokenRecuperacao: string, novaSenha: string) {
  return request<void>("/auth/senha/redefinir", "", {
    method: "POST",
    body: JSON.stringify({ token: tokenRecuperacao, novaSenha }),
  });
}

function post<T>(path: string, token: string, data: unknown) {
  return request<T>(path, token, { method: "POST", body: JSON.stringify(data) });
}
function patch<T>(path: string, token: string, data: unknown) {
  return request<T>(path, token, { method: "PATCH", body: JSON.stringify(data) });
}
function put<T>(path: string, token: string, data: unknown) {
  return request<T>(path, token, { method: "PUT", body: JSON.stringify(data) });
}
function del(path: string, token: string) {
  return request<void>(path, token, { method: "DELETE" });
}

export const api = {
  login,
  logout,
  me,
  concluirConvite,
  solicitarRecuperacaoSenha,
  redefinirSenha,
  alterarSenha: (token: string, senhaAtual: string, novaSenha: string) =>
    patch<void>("/auth/senha", token, { senhaAtual, novaSenha }),
  periodos: (token: string) => request<Periodo[]>("/periodos", token),
  criarPeriodo: (
    token: string,
    data: { nome: string; dataInicio: string; dataFim: string; dataReferenciaRodizio: string },
  ) => post<Periodo>("/periodos", token, data),
  excluirPeriodo: (token: string, id: string) => del(`/periodos/${id}`, token),
  configuracaoPlanilha: (token: string) =>
    request<ConfiguracaoPlanilha>("/planilha/configuracao", token),
  urlConectarGoogle: () => `${base}/google/oauth/iniciar`,
  desconectarGoogle: (token: string) => del("/google/oauth/conexao", token),
  vincularPlanilha: (token: string, periodoId: string, url: string) =>
    put<{ periodo: Periodo; titulo: string; abas: string[]; emailServico: string | null }>(
      `/periodos/${periodoId}/planilha`,
      token,
      { url },
    ),
  desvincularPlanilha: (token: string, periodoId: string) =>
    del(`/periodos/${periodoId}/planilha`, token),
  previaAlunosPlanilha: (token: string, periodoId: string) =>
    request<PreviaImportacaoAlunos>(`/periodos/${periodoId}/planilha/alunos/previa`, token),
  importarAlunosPlanilha: (token: string, periodoId: string, matriculasSelecionadas: string[]) =>
    post<{ criados: number; ignorados: number }>(
      `/periodos/${periodoId}/planilha/alunos/importar`,
      token,
      { matriculasSelecionadas },
    ),
  turmas: (token: string, periodoId: string) =>
    request<Turma[]>(`/turmas?periodoId=${periodoId}`, token),

  grupos: (token: string, periodoId: string) =>
    request<GrupoRevisao[]>(`/grupos-revisao?periodoId=${periodoId}`, token),
  criarGrupo: (token: string, data: { periodoId: string; chefeId: string; nome: string }) =>
    post<GrupoRevisao>("/grupos-revisao", token, data),
  excluirGrupo: (token: string, id: string) => del(`/grupos-revisao/${id}`, token),

  duplas: (token: string) => request<Dupla[]>("/duplas", token),
  criarDupla: (token: string, data: { grupoRevisaoId: string; label: string }) =>
    post<Dupla>("/duplas", token, data),
  atualizarDupla: (token: string, id: string, data: { label?: string }) =>
    patch<Dupla>(`/duplas/${id}`, token, data),
  excluirDupla: (token: string, id: string) => del(`/duplas/${id}`, token),

  monitores: (token: string, periodoId: string) =>
    request<Monitor[]>(`/monitores?periodoId=${periodoId}`, token),
  enviarConviteChefe: (token: string, monitorId: string, email: string) =>
    post<{ email: string; expiraEm: string }>("/auth/convites", token, { monitorId, email }),
  criarMonitor: (
    token: string,
    data: {
      nome: string;
      whatsappNumero: string;
      periodoId: string;
      isChefe?: boolean;
      duplaId?: string | null;
    },
  ) => post<Monitor>("/monitores", token, data),
  atualizarMonitor: (token: string, id: string, data: Record<string, unknown>) =>
    patch<Monitor>(`/monitores/${id}`, token, data),
  excluirMonitor: (token: string, id: string) => del(`/monitores/${id}`, token),

  alunos: (token: string) => request<Aluno[]>("/alunos", token),
  criarAluno: (
    token: string,
    data: {
      nome: string;
      matricula: string;
      turmaId: string;
      duplaId?: string | null;
      isPcd?: boolean;
      qtdQuestoesMeta?: number | null;
      monitorSemanaAId?: string | null;
    },
  ) => post<Aluno>("/alunos", token, data),
  atualizarAluno: (
    token: string,
    id: string,
    data: { duplaId?: string | null; isPcd?: boolean; monitorSemanaAId?: string | null },
  ) => patch<Aluno>(`/alunos/${id}`, token, data),
  atribuirAlunosDupla: (token: string, alunoIds: string[], duplaId: string) =>
    patch<{ atualizados: number }>("/alunos/atribuir-dupla", token, { alunoIds, duplaId }),
  salvarPrazoAluno: (
    token: string,
    alunoId: string,
    listaId: string,
    prazoEntregaFeedback: string | null,
  ) => put(`/alunos/${alunoId}/prazos-lista`, token, { listaId, prazoEntregaFeedback }),
  excluirAluno: (token: string, id: string) => del(`/alunos/${id}`, token),

  listas: (token: string, periodoId: string) =>
    request<Lista[]>(`/listas?periodoId=${periodoId}`, token),
  atualizarLista: (
    token: string,
    id: string,
    data: {
      nome?: string;
      qtdQuestoesTotal?: number;
      semanaOverride?: "A" | "B" | null;
      prazos?: { turmaId: string; prazoEntregaFeedback: string }[];
    },
  ) => patch<Lista>(`/listas/${id}`, token, data),

  prazosLista: (token: string, turmaId: string) =>
    request<PrazoListaItem[]>(`/prazos-lista?turmaId=${turmaId}`, token),
  salvarPrazosLista: (
    token: string,
    turmaId: string,
    prazos: { listaId: string; prazoEntregaFeedback: string }[],
  ) => put<{ atualizados: number }>("/prazos-lista", token, { turmaId, prazos }),

  feedbacks: (token: string, periodoId: string) =>
    request<Feedback[]>(`/feedbacks?periodoId=${periodoId}`, token),
  atrasos: (token: string, periodoId: string) =>
    request<Atraso[]>(`/atrasos?periodoId=${periodoId}`, token),
  reprocessarPlanilha: (token: string, id: string) =>
    post(`/feedbacks/${id}/reprocessar-planilha`, token, {}),

  bot: (token: string) => request<Bot>("/bot", token),
  conectarBot: (token: string) => post("/bot/conectar", token, {}),
  desconectarBot: (token: string) => request<void>("/bot/desconectar", token, { method: "POST" }),
  desvincularBot: (token: string) => request<void>("/bot/desvincular", token, { method: "POST" }),
  comunidadesWhatsappDisponiveis: (token: string) =>
    request<{ id: string; nome: string }[]>("/bot/comunidades-disponiveis", token),
  vincularComunidadeWhatsapp: (token: string, periodoId: string, whatsappAvisosId: string) =>
    put<Periodo>(`/bot/periodos/${periodoId}/comunidade`, token, { whatsappAvisosId }),
  desvincularComunidadeWhatsapp: (token: string, periodoId: string) =>
    del(`/bot/periodos/${periodoId}/comunidade`, token),
  enviarLinkComunidadeWhatsapp: (token: string, periodoId: string) =>
    post<{ link: string }>(`/bot/periodos/${periodoId}/enviar-link`, token, {}),
};
