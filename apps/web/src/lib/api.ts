import type {
  Aluno,
  Bot,
  Chefe,
  Dupla,
  Feedback,
  GrupoRevisao,
  Lista,
  Monitor,
  Periodo,
  Turma,
} from "./types";

const base = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? "Falha na comunicação com a API");
  return body as T;
}

export async function login(email: string, senha: string) {
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message ?? "Não foi possível entrar");
  return body as { token: string; chefe: Chefe };
}

export function logout(token: string) {
  return request<void>("/auth/logout", token, { method: "POST" });
}

function post<T>(path: string, token: string, data: unknown) {
  return request<T>(path, token, { method: "POST", body: JSON.stringify(data) });
}
function patch<T>(path: string, token: string, data: unknown) {
  return request<T>(path, token, { method: "PATCH", body: JSON.stringify(data) });
}
function del(path: string, token: string) {
  return request<void>(path, token, { method: "DELETE" });
}

export const api = {
  login,
  logout,
  periodos: (token: string) => request<Periodo[]>("/periodos", token),
  turmas: (token: string, periodoId: string) =>
    request<Turma[]>(`/turmas?periodoId=${periodoId}`, token),
  criarTurma: (token: string, data: { periodoId: string; nome: string; nomeAbaPlanilha: string }) =>
    post<Turma>("/turmas", token, data),

  grupos: (token: string, periodoId: string) =>
    request<GrupoRevisao[]>(`/grupos-revisao?periodoId=${periodoId}`, token),
  criarGrupo: (token: string, data: { periodoId: string; chefeId: string; nome: string }) =>
    post<GrupoRevisao>("/grupos-revisao", token, data),
  excluirGrupo: (token: string, id: string) => del(`/grupos-revisao/${id}`, token),

  duplas: (token: string) => request<Dupla[]>("/duplas", token),
  criarDupla: (token: string, data: { grupoRevisaoId: string; label: string }) =>
    post<Dupla>("/duplas", token, data),
  atualizarDupla: (
    token: string,
    id: string,
    data: { monitorSemanaAId?: string | null; monitorSemanaBId?: string | null; label?: string },
  ) => patch<Dupla>(`/duplas/${id}`, token, data),
  excluirDupla: (token: string, id: string) => del(`/duplas/${id}`, token),

  monitores: (token: string, periodoId: string) =>
    request<Monitor[]>(`/monitores?periodoId=${periodoId}`, token),
  criarMonitor: (
    token: string,
    data: {
      nome: string;
      whatsappNumero: string;
      periodoId: string;
      duplaId?: string | null;
      isChefe?: boolean;
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
      duplaId: string;
      isPcd?: boolean;
      qtdQuestoesMeta?: number | null;
    },
  ) => post<Aluno>("/alunos", token, data),
  excluirAluno: (token: string, id: string) => del(`/alunos/${id}`, token),

  listas: (token: string, periodoId: string) =>
    request<Lista[]>(`/listas?periodoId=${periodoId}`, token),

  feedbacks: (token: string, periodoId: string) =>
    request<Feedback[]>(`/feedbacks?periodoId=${periodoId}`, token),
  reprocessarPlanilha: (token: string, id: string) =>
    post(`/feedbacks/${id}/reprocessar-planilha`, token, {}),

  bot: (token: string) => request<Bot>("/bot", token),
  conectarBot: (token: string) => post("/bot/conectar", token, {}),
  desconectarBot: (token: string) => request<void>("/bot/desconectar", token, { method: "POST" }),
  vincularGrupoWhatsapp: (token: string, grupoId: string, whatsappGrupoId: string) =>
    post<GrupoRevisao>(`/bot/grupos/${grupoId}`, token, { whatsappGrupoId }),
  desvincularGrupoWhatsapp: (token: string, grupoId: string) => del(`/bot/grupos/${grupoId}`, token),
};
