import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import { LOGIN_PATH, ROUTE_PATH, pageIdFromPath } from "./lib/routes";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { AlunoDrawer, MonitorDrawer } from "./components/Drawers";
import { ConfirmModal } from "./components/ui";
import type { ConfirmRequest } from "./lib/types";
import { Toaster } from "./components/ui/sonner";
import { PageSkeleton } from "./components/PageSkeleton";
import { Login } from "./pages/Login";
import { AlunosDashboard } from "./pages/AlunosDashboard";
import { MonitoresDashboard } from "./pages/MonitoresDashboard";
import { DiretorioAlunos } from "./pages/DiretorioAlunos";
import { DiretorioMonitores } from "./pages/DiretorioMonitores";
import { AtrasadosOverview } from "./pages/AtrasadosOverview";
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
  const raw = sessionStorage.getItem("feedbot-chefe");
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

function AppInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => {
    localStorage.removeItem("feedbot-token");
    localStorage.removeItem("feedbot-chefe");
    return loadChefe() ? "cookie-session" : "";
  });
  const [chefe, setChefe] = useState<Chefe | null>(() => loadChefe());
  const page = pageIdFromPath(location.pathname);
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
  const [carregando, setCarregando] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Ações no painel disparam `load()` em sequência rápida (ex.: escolher o papel de
  // vários alunos seguidos, sem esperar o carregamento anterior terminar) — sem essa
  // guarda, uma resposta mais antiga pode chegar depois de uma mais nova e sobrescrever
  // o estado fresco com dados desatualizados (ex.: uma dupla "perde" os monitores que
  // acabaram de ser vinculados). `loadRequestId` garante que só a última chamada em
  // curso tem permissão de aplicar seu resultado ao estado.
  const loadRequestId = useRef(0);
  // Guarda o caso "load() resolveu o período padrão sozinho" (periodoId estava vazio)
  // pra distinguir do usuário trocando de período de propósito — só o segundo caso
  // deve disparar um novo load() pelo efeito de baixo (senão login/refresh sempre
  // faziam duas rodadas completas de requisições, uma delas jogada fora).
  const periodoResolvidoAoCarregar = useRef(false);
  // O efeito de periodoId roda também na primeira montagem (com periodoId ainda
  // vazio) — nesse instante o efeito de token já cobre o carregamento, então essa
  // primeira execução deve ser ignorada. Mas ao contrário do que um simples
  // `if (!periodoId) return` faria, transições PARA "" depois da montagem (ex.:
  // excluir o período ativo, ver Topbar) continuam precisando recarregar.
  const periodoEfeitoMontado = useRef(false);
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
      if (!periodoId) periodoResolvidoAoCarregar.current = true;
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
    } finally {
      if (requestId === loadRequestId.current) setCarregando(false);
    }
  }, [token, periodoId]);

  useEffect(() => {
    // Dispara o carregamento inicial quando a sessão fica disponível (login ou
    // restauração por cookie). Não depende de `load` inteiro — só de `token` — pra
    // não duplicar essa rodada quando load() resolve o período padrão logo em
    // seguida (ver periodoResolvidoAoCarregar abaixo).
    if (!token) return;
    // Data-fetching effect: `load` awaits before touching state, but the
    // compiler-based lint rule can't see across the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    // Recarrega quando o usuário troca de período pela UI (inclusive para "" — ex.:
    // excluiu o período ativo e precisa recair num novo padrão). Ignora só a
    // primeira execução (montagem) e a mudança que o próprio load() já fez ao
    // resolver o padrão (efeito de cima já cobriu essa rodada).
    if (!periodoEfeitoMontado.current) {
      periodoEfeitoMontado.current = true;
      return;
    }
    if (periodoResolvidoAoCarregar.current) {
      periodoResolvidoAoCarregar.current = false;
      return;
    }
    setCarregando(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoId]);

  useEffect(() => {
    if (chefe) return;
    // sessionStorage some ao fechar a aba, mas o cookie de sessão (httpOnly) dura
    // 12h — sem isso, qualquer fechamento de aba força um novo login desnecessário.
    api
      .me()
      .then(({ chefe: chefeAtual }) => handleLogin(chefeAtual))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const encerrarSessaoInvalida = () => {
      localStorage.removeItem("feedbot-token");
      sessionStorage.removeItem("feedbot-chefe");
      setToken("");
      setChefe(null);
      setPeriodoId("");
      navigate(LOGIN_PATH, { replace: true });
    };
    window.addEventListener("feedbot:unauthorized", encerrarSessaoInvalida);
    return () => window.removeEventListener("feedbot:unauthorized", encerrarSessaoInvalida);
    // navigate() do react-router é estável entre renders; não precisa recriar o listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("feedbot-theme", theme);
  }, [theme]);

  function handleLogin(newChefe: Chefe) {
    sessionStorage.setItem("feedbot-chefe", JSON.stringify(newChefe));
    setToken("cookie-session");
    setChefe(newChefe);
    // Uma tentativa silenciosa de restaurar sessão anterior (ver api.me() acima) pode
    // ter deixado erro de sessão expirada no ar — sem isso, ele pisca na tela assim
    // que o painel novo aparece, mesmo com o login atual válido.
    setErro("");
  }
  function handleLogout() {
    void api.logout(token).catch(() => undefined);
    localStorage.removeItem("feedbot-token");
    sessionStorage.removeItem("feedbot-chefe");
    setToken("");
    setChefe(null);
    setPeriodoId("");
    navigate(LOGIN_PATH, { replace: true });
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
    atrasados: {
      eyebrow: "Acompanhamento de prazos",
      title: "Feedbacks atrasados",
      subtitle: "Veja pendências vencidas por turma, grupo, aluno e monitor responsável.",
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
      title: "Bot do Discord",
      subtitle: "Acompanhe a conexão e o canal de registro de feedback do bot.",
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
            { label: "Ir para gestão", onClick: () => navigate(ROUTE_PATH["gestao"]) },
            { label: "Abrir planilha", onClick: () => navigate(ROUTE_PATH["planilha"]) },
          ]
        : page === "diretorio-monitores"
          ? [
              { label: "Ver dashboard", onClick: () => navigate(ROUTE_PATH["dashboard"]) },
              { label: "Abrir bot", onClick: () => navigate(ROUTE_PATH["bot"]) },
            ]
          : page === "atrasados"
            ? [
                { label: "Diretório alunos", onClick: () => navigate(ROUTE_PATH["diretorio-alunos"]) },
                { label: "Diretório monitores", onClick: () => navigate(ROUTE_PATH["diretorio-monitores"]) },
              ]
            : page === "gestao"
            ? [
                { label: "Diretório monitores", onClick: () => navigate(ROUTE_PATH["diretorio-monitores"]) },
                { label: "Abrir planilha", onClick: () => navigate(ROUTE_PATH["planilha"]) },
              ]
            : page === "planilha"
              ? [
                  { label: "Voltar para gestão", onClick: () => navigate(ROUTE_PATH["gestao"]) },
                  { label: "Ver dashboard", onClick: () => navigate(ROUTE_PATH["dashboard"]) },
                ]
              : [
                  { label: "Ver dashboard", onClick: () => navigate(ROUTE_PATH["dashboard"]) },
                  { label: "Diretório monitores", onClick: () => navigate(ROUTE_PATH["diretorio-monitores"]) },
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
        chefe={chefe}
        token={token}
        onLogout={handleLogout}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
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
          onOpenMenu={() => setSidebarOpen(true)}
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
            {carregando ? (
              <PageSkeleton />
            ) : (
              <Routes>
                <Route path="/" element={<Navigate to={ROUTE_PATH.dashboard} replace />} />
                <Route
                  path={ROUTE_PATH.dashboard}
                  element={
                    dashboardView === "alunos" ? (
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
                    )
                  }
                />
                <Route
                  path={ROUTE_PATH["diretorio-alunos"]}
                  element={
                    <DiretorioAlunos
                      token={token}
                      alunos={alunos}
                      grupos={grupos}
                      listas={listas}
                      feedbacks={feedbacks}
                      atrasos={atrasos}
                      onOpenAluno={(id) => setDrawer({ type: "aluno", id })}
                      onReload={load}
                      onRequestConfirm={setConfirm}
                    />
                  }
                />
                <Route
                  path={ROUTE_PATH["diretorio-monitores"]}
                  element={
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
                  }
                />
                <Route
                  path={ROUTE_PATH.atrasados}
                  element={
                    <AtrasadosOverview
                      turmas={turmas}
                      grupos={grupos}
                      duplas={duplas}
                      alunos={alunos}
                      listas={listas}
                      monitores={monitores}
                      atrasos={atrasos}
                    />
                  }
                />
                <Route
                  path={ROUTE_PATH.gestao}
                  element={
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
                  }
                />
                <Route
                  path={ROUTE_PATH.bot}
                  element={
                    periodoAtual ? (
                      <BotPage token={token} bot={bot} periodo={periodoAtual} onReload={load} />
                    ) : null
                  }
                />
                <Route
                  path={ROUTE_PATH.planilha}
                  element={
                    periodoAtual ? (
                      <PlanilhaPage
                        key={periodoId}
                        token={token}
                        periodo={periodoAtual}
                        turmas={turmas}
                        listas={listas}
                        onReload={load}
                        onRequestConfirm={setConfirm}
                      />
                    ) : null
                  }
                />
                <Route path="*" element={<Navigate to={ROUTE_PATH.dashboard} replace />} />
              </Routes>
            )}
          </div>
        </div>
      </div>

      {alunoAberto && (
        <AlunoDrawer
          aluno={alunoAberto}
          alunos={alunos}
          grupos={grupos}
          duplas={duplas}
          feedbacks={feedbacks}
          listas={listas}
          atrasos={atrasos}
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

function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

export default App;
