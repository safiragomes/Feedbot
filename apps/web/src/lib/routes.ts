export type PageId =
  | "dashboard"
  | "diretorio-alunos"
  | "diretorio-monitores"
  | "atrasados"
  | "gestao"
  | "planilha"
  | "bot";

// Fora do mapa de PageId de propósito: não é uma página do app autenticado, é
// pra onde a URL aponta enquanto o gate de sessão (ver App.tsx) mostra o login.
export const LOGIN_PATH = "/login";

export const ROUTE_PATH: Record<PageId, string> = {
  dashboard: "/dashboard",
  "diretorio-alunos": "/alunos",
  "diretorio-monitores": "/monitores",
  atrasados: "/atrasados",
  gestao: "/gestao",
  planilha: "/planilha",
  bot: "/bot",
};

export function pageIdFromPath(pathname: string): PageId {
  const entry = (Object.entries(ROUTE_PATH) as [PageId, string][]).find(
    ([, path]) => path === pathname,
  );
  return entry?.[0] ?? "dashboard";
}
