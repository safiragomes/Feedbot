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
import { Login } from "./pages/Login";
import { AlunosDashboard } from "./pages/AlunosDashboard";
import { MonitoresDashboard } from "./pages/MonitoresDashboard";
import { DiretorioAlunos, DiretorioMonitores } from "./pages/Diretorios";
import { Gestao } from "./pages/Gestao";
import { BotPage } from "./pages/Bot";
import { solicitarRemocaoAluno } from "./lib/acoes";

type DrawerState = { type: "aluno"; id: string } | { type: "monitor"; id: string } | null;

function loadChefe(): Chefe | null {
  const raw = localStorage.getItem("feedbot-chefe");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Chefe;
  } catch {
    return null;
  }
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

  if (!token) return <Login onLogin={handleLogin} />;

  const alunoAberto = drawer?.type === "aluno" ? alunos.find((a) => a.id === drawer.id) : undefined;
  const monitorAberto =
    drawer?.type === "monitor" ? monitores.find((m) => m.id === drawer.id) : undefined;

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={setPage} chefe={chefe} onLogout={handleLogout} />
      <div className="main">
        <Topbar
          token={token}
          periodos={periodos}
          periodoId={periodoId}
          onChangePeriodo={handleChangePeriodo}
          onCriado={handleChangePeriodo}
        />
        <div className="content">
          {erro && <div className="error-banner">{erro}</div>}
          {page === "dashboard" && (
            <>
              <div className="filterbar" style={{ width: "fit-content", padding: 6 }}>
                <button
                  className={`btn sm${dashboardView === "alunos" ? " primary" : " ghost"}`}
                  onClick={() => setDashboardView("alunos")}
                >
                  Alunos
                </button>
                <button
                  className={`btn sm${dashboardView === "monitores" ? " primary" : " ghost"}`}
                  onClick={() => setDashboardView("monitores")}
                >
                  Monitores
                </button>
              </div>
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
              listas={listas}
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
            />
          )}
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
    </div>
  );
}

export default App;
