import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";
import { api } from "./lib/api";
import type {
  Aluno,
  Atraso,
  Bot,
  Chefe,
  Dupla,
  Feedback,
  GrupoRevisao,
  Lista,
  Monitor,
  Periodo,
  Turma,
} from "./lib/types";
import { Sidebar, type PageId } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { AlunoDrawer, MonitorDrawer } from "./components/Drawers";
import { ConfirmModal, type ConfirmRequest } from "./components/ui";
import { Toaster } from "./components/ui/sonner";
import { Login } from "./pages/Login";
import { AlunosDashboard } from "./pages/AlunosDashboard";
import { MonitoresDashboard } from "./pages/MonitoresDashboard";
import { DiretorioAlunos, DiretorioMonitores } from "./pages/Diretorios";
import { Gestao } from "./pages/Gestao";
import { BotPage } from "./pages/Bot";
import { PlanilhaPage } from "./pages/Planilha";
import { solicitarRemocaoAluno } from "./lib/acoes";

type DrawerState = { type: "aluno"; id: string } | { type: "monitor"; id: string } | null;
type HeroAction = {
  label: string;
  onClick: () => void;
  active?: boolean;
};
type ThemeMode = "dark" | "light";

function loadChefe(): Chefe | null {
  const raw = localStorage.getItem("feedbot-chefe");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Chefe;
  } catch {
    return null;
  }
}

function loadTheme(): ThemeMode {
  const saved = localStorage.getItem("feedbot-theme");
  return saved === "light" ? "light" : "dark";
}

function App() {
  const [token, setToken] = useState(() => {
    localStorage.removeItem("feedbot-token");
    return loadChefe() ? "cookie-session" : "";
  });
  const [chefe, setChefe] = useState<Chefe | null>(() => loadChefe());
  const [page, setPage] = useState<PageId>("dashboard");
  const [dashboardView, setDashboardView] = useState<"alunos" | "monitores">("alunos");
  const [periodoId, setPeriodoId] = useState("");
  const [erro, setErro] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [grupos, setGrupos] = useState<GrupoRevisao[]>([]);
  const [duplas, setDuplas] = useState<Dupla[]>([]);
  const [monitores, setMonitores] = useState<Monitor[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [atrasos, setAtrasos] = useState<Atraso[]>([]);
  const [bot, setBot] = useState<Bot | null>(null);

  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // Ações no painel disparam `load()` em sequência rápida (ex.: escolher o papel de
  // vários alunos seguidos, sem esperar o carregamento anterior terminar) — sem essa
  // guarda, uma resposta mais antiga pode chegar depois de uma mais nova e sobrescrever
  // o estado fresco com dados desatualizados (ex.: uma dupla "perde" os monitores que
  // acabaram de ser vinculados). `loadRequestId` garante que só a última chamada em
  // curso tem permissão de aplicar seu resultado ao estado.
  const loadRequestId = useRef(0);
  const load = useCallback(async () => {
    if (!token) return;
    const requestId = ++loadRequestId.current;
    try {
      const periodosResp = await api.periodos(token);
      const id = periodoId || periodosResp[0]?.id || "";
      if (!id) {
        if (requestId !== loadRequestId.current) return;
        setPeriodos(periodosResp);
        setPeriodoId(id);
        setErro("");
        return;
      }
      const [
        turmasResp,
        gruposResp,
        duplasResp,
        monitoresResp,
        alunosResp,
        listasResp,
        feedbacksResp,
        atrasosResp,
        botResp,
      ] = await Promise.all([
        api.turmas(token, id),
        api.grupos(token, id),
        api.duplas(token),
        api.monitores(token, id),
        api.alunos(token),
        api.listas(token, id),
        api.feedbacks(token, id),
        api.atrasos(token, id),
        api.bot(token),
      ]);
      if (requestId !== loadRequestId.current) return;
      setPeriodos(periodosResp);
      setPeriodoId(id);
      setTurmas(turmasResp);
      setGrupos(gruposResp);
      setDuplas(duplasResp.filter((d) => d.grupoRevisao?.periodoId === id));
      setMonitores(monitoresResp);
      setAlunos(alunosResp.filter((a) => a.turma.periodoId === id));
      setListas(listasResp);
      setFeedbacks(feedbacksResp);
      setAtrasos(atrasosResp);
      setBot(botResp);
      setErro("");
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      setErro(error instanceof Error ? error.message : "Falha ao carregar dados");
    }
  }, [token, periodoId]);

  useEffect(() => {
    // Data-fetching effect: `load` awaits before touching state, but the
    // compiler-based lint rule can't see across the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const encerrarSessaoInvalida = () => {
      localStorage.removeItem("feedbot-token");
      localStorage.removeItem("feedbot-chefe");
      setToken("");
      setChefe(null);
      setPeriodoId("");
    };
    window.addEventListener("feedbot:unauthorized", encerrarSessaoInvalida);
    return () => window.removeEventListener("feedbot:unauthorized", encerrarSessaoInvalida);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("feedbot-theme", theme);
  }, [theme]);

  function handleLogin(newChefe: Chefe) {
    localStorage.setItem("feedbot-chefe", JSON.stringify(newChefe));
    setToken("cookie-session");
    setChefe(newChefe);
  }
  function handleLogout() {
    void api.logout(token).catch(() => undefined);
    localStorage.removeItem("feedbot-token");
    localStorage.removeItem("feedbot-chefe");
    setToken("");
    setChefe(null);
    setPeriodoId("");
  }
  function handleChangePeriodo(id: string) {
    setDrawer(null);
    setPeriodoId(id);
  }
  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  if (!token)
    return <Login onLogin={handleLogin} theme={theme} onToggleTheme={handleToggleTheme} />;

  const alunoAberto = drawer?.type === "aluno" ? alunos.find((a) => a.id === drawer.id) : undefined;
  const monitorAberto =
    drawer?.type === "monitor" ? monitores.find((m) => m.id === drawer.id) : undefined;
  const periodoAtual = periodos.find((item) => item.id === periodoId) ?? null;
  const pageMeta = {
    dashboard: {
      eyebrow: "Visão operacional",
      title:
        dashboardView === "alunos"
          ? "Visão geral dos alunos"
          : "Visão geral da equipe de monitoria",
      subtitle:
        dashboardView === "alunos"
          ? "Acompanhe progresso, distribuição e pendências por grupo."
          : "Monitore cobertura, atrasos e carga operacional por dupla.",
    },
    "diretorio-alunos": {
      eyebrow: "Diretório acadêmico",
      title: "Base de alunos",
      subtitle: "Gerencie vínculos, histórico de listas e ocorrências da turma ativa.",
    },
    "diretorio-monitores": {
      eyebrow: "Operação da monitoria",
      title: "Base de monitores",
      subtitle: "Veja alocação, alunos vinculados, atrasos e desempenho da equipe.",
    },
    gestao: {
      eyebrow: "Configuração do período",
      title: "Grupos, duplas e turmas",
      subtitle: "Ajuste a estrutura operacional do período sem perder contexto.",
    },
    planilha: {
      eyebrow: "Fluxo de importação",
      title: "Planilha e pontuação",
      subtitle: "Concilie notas, regras e listas com a operação atual.",
    },
    bot: {
      eyebrow: "Comunicação automatizada",
      title: "Bot do WhatsApp",
      subtitle: "Controle sessão, número ativo e estado de atendimento do bot.",
    },
  }[page];
  const heroActions: HeroAction[] =
    page === "dashboard"
      ? [
          {
            label: "Alunos",
            active: dashboardView === "alunos",
            onClick: () => setDashboardView("alunos"),
          },
          {
            label: "Monitores",
            active: dashboardView === "monitores",
            onClick: () => setDashboardView("monitores"),
          },
        ]
      : page === "diretorio-alunos"
        ? [
            { label: "Ir para gestão", onClick: () => setPage("gestao") },
            { label: "Abrir planilha", onClick: () => setPage("planilha") },
          ]
        : page === "diretorio-monitores"
          ? [
              { label: "Ver dashboard", onClick: () => setPage("dashboard") },
              { label: "Abrir bot", onClick: () => setPage("bot") },
            ]
          : page === "gestao"
            ? [
                { label: "Diretório monitores", onClick: () => setPage("diretorio-monitores") },
                { label: "Abrir planilha", onClick: () => setPage("planilha") },
              ]
            : page === "planilha"
              ? [
                  { label: "Voltar para gestão", onClick: () => setPage("gestao") },
                  { label: "Ver dashboard", onClick: () => setPage("dashboard") },
                ]
              : [
                  { label: "Ver dashboard", onClick: () => setPage("dashboard") },
                  { label: "Diretório monitores", onClick: () => setPage("diretorio-monitores") },
                ];
  const heroStats = [
    { label: "Período ativo", value: periodoAtual?.nome ?? "Sem período" },
    { label: "Alunos visíveis", value: String(alunos.length) },
    { label: "Monitores", value: String(monitores.length) },
    { label: "Listas", value: String(listas.length) },
  ];

  return (
    <div className="app">
      <Sidebar
        page={page}
        onNavigate={setPage}
        chefe={chefe}
        token={token}
        onLogout={handleLogout}
      />
      <div className="main">
        <Topbar
          token={token}
          periodos={periodos}
          periodoId={periodoId}
          onChangePeriodo={handleChangePeriodo}
          onCriado={handleChangePeriodo}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
        <div className="content-shell">
          <section className="hero-panel">
            <div className="hero-content">
              <div className="hero-eyebrow">{pageMeta.eyebrow}</div>
              <h1>{pageMeta.title}</h1>
              <p className="subtitle hero-subtitle">{pageMeta.subtitle}</p>
              <div className="hero-actions">
                {heroActions.map((item) => (
                  <button
                    key={item.label}
                    className={`hero-action${item.active ? " active" : ""}`}
                    onClick={item.onClick}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="hero-stats">
              {heroStats.map((item) => (
                <div key={item.label} className="hero-stat">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="hero-orbit" aria-hidden="true" />
          </section>
          <div className="content">
            {erro && <div className="error-banner">{erro}</div>}
            {page === "dashboard" && (
              <>
                {dashboardView === "alunos" ? (
                  <AlunosDashboard
                    alunos={alunos}
                    grupos={grupos}
                    listas={listas}
                    feedbacks={feedbacks}
                  />
                ) : (
                  <MonitoresDashboard
                    grupos={grupos}
                    duplas={duplas}
                    listas={listas}
                    feedbacks={feedbacks}
                    atrasos={atrasos}
                  />
                )}
              </>
            )}
            {page === "diretorio-alunos" && (
              <DiretorioAlunos
                token={token}
                alunos={alunos}
                grupos={grupos}
                listas={listas}
                feedbacks={feedbacks}
                onOpenAluno={(id) => setDrawer({ type: "aluno", id })}
                onReload={load}
                onRequestConfirm={setConfirm}
              />
            )}
            {page === "diretorio-monitores" && (
              <DiretorioMonitores
                token={token}
                periodoId={periodoId}
                monitores={monitores}
                grupos={grupos}
                duplas={duplas}
                alunos={alunos}
                listas={listas}
                atrasos={atrasos}
                onOpenMonitor={(id) => setDrawer({ type: "monitor", id })}
                onReload={load}
                onRequestConfirm={setConfirm}
              />
            )}
            {page === "gestao" && (
              <Gestao
                token={token}
                periodoId={periodoId}
                grupos={grupos}
                duplas={duplas}
                monitores={monitores}
                alunos={alunos}
                turmas={turmas}
                onReload={load}
                onRequestConfirm={setConfirm}
              />
            )}
            {page === "bot" && (
              <BotPage
                token={token}
                bot={bot}
                periodo={periodos.find((p) => p.id === periodoId)!}
                onReload={load}
                onRequestConfirm={setConfirm}
              />
            )}
            {page === "planilha" && periodos.find((p) => p.id === periodoId) && (
              <PlanilhaPage
                key={periodoId}
                token={token}
                periodo={periodos.find((p) => p.id === periodoId)!}
                turmas={turmas}
                listas={listas}
                onReload={load}
                onRequestConfirm={setConfirm}
              />
            )}
          </div>
        </div>
      </div>

      {alunoAberto && (
        <AlunoDrawer
          aluno={alunoAberto}
          grupos={grupos}
          duplas={duplas}
          feedbacks={feedbacks}
          listas={listas}
          token={token}
          onReload={load}
          onClose={() => setDrawer(null)}
          onRequestRemove={() =>
            solicitarRemocaoAluno({
              aluno: alunoAberto,
              token,
              onRequestConfirm: setConfirm,
              onReload: async () => {
                setDrawer(null);
                await load();
              },
              onErro: setErro,
            })
          }
        />
      )}
      {monitorAberto && (
        <MonitorDrawer
          monitor={monitorAberto}
          alunos={alunos}
          duplas={duplas}
          feedbacks={feedbacks}
          atrasos={atrasos}
          listas={listas}
          token={token}
          onClose={() => setDrawer(null)}
          onReload={load}
          onErro={setErro}
        />
      )}
      {confirm && <ConfirmModal request={confirm} onClose={() => setConfirm(null)} />}
      <Toaster theme={theme} />
    </div>
  );
}

export default App;
