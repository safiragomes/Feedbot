import { useCallback, useEffect, useState } from "react";
import "./index.css";
import { api, ApiError } from "./lib/api";
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
  const [token, setToken] = useState(() => localStorage.getItem("feedbot-token") ?? "");
  const [chefe, setChefe] = useState<Chefe | null>(() => loadChefe());
  const [page, setPage] = useState<PageId>("alunos");
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
  const [bot, setBot] = useState<Bot | null>(null);

  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const periodosResp = await api.periodos(token);
      const id = periodoId || periodosResp[0]?.id || "";
      if (!id) {
        setPeriodos(periodosResp);
        setPeriodoId(id);
        setErro("");
        return;
      }
      const [turmasResp, gruposResp, duplasResp, monitoresResp, alunosResp, listasResp, feedbacksResp, botResp] =
        await Promise.all([
          api.turmas(token, id),
          api.grupos(token, id),
          api.duplas(token),
          api.monitores(token, id),
          api.alunos(token),
          api.listas(token, id),
          api.feedbacks(token, id),
          api.bot(token),
        ]);
      setPeriodos(periodosResp);
      setPeriodoId(id);
      setTurmas(turmasResp);
      setGrupos(gruposResp);
      setDuplas(duplasResp.filter((d) => d.grupoRevisao?.periodoId === id));
      setMonitores(monitoresResp);
      setAlunos(alunosResp.filter((a) => a.turma.periodoId === id));
      setListas(listasResp);
      setFeedbacks(feedbacksResp);
      setBot(botResp);
      setErro("");
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Falha ao carregar dados");
    }
  }, [token, periodoId]);

  useEffect(() => {
    // Data-fetching effect: `load` awaits before touching state, but the
    // compiler-based lint rule can't see across the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function handleLogin(newToken: string, newChefe: Chefe) {
    localStorage.setItem("feedbot-token", newToken);
    localStorage.setItem("feedbot-chefe", JSON.stringify(newChefe));
    setToken(newToken);
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
  const monitorAberto = drawer?.type === "monitor" ? monitores.find((m) => m.id === drawer.id) : undefined;

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={setPage} chefe={chefe} onLogout={handleLogout} />
      <div className="main">
        <Topbar periodos={periodos} periodoId={periodoId} onChangePeriodo={handleChangePeriodo} />
        <div className="content">
          {erro && <div className="error-banner">{erro}</div>}
          {page === "alunos" && (
            <AlunosDashboard alunos={alunos} grupos={grupos} listas={listas} feedbacks={feedbacks} />
          )}
          {page === "monitores" && (
            <MonitoresDashboard grupos={grupos} duplas={duplas} listas={listas} feedbacks={feedbacks} />
          )}
          {page === "diretorio-alunos" && (
            <DiretorioAlunos alunos={alunos} grupos={grupos} onOpenAluno={(id) => setDrawer({ type: "aluno", id })} />
          )}
          {page === "diretorio-monitores" && (
            <DiretorioMonitores
              monitores={monitores}
              grupos={grupos}
              onOpenMonitor={(id) => setDrawer({ type: "monitor", id })}
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
          {page === "bot" && <BotPage token={token} bot={bot} grupos={grupos} onReload={load} />}
        </div>
      </div>

      {alunoAberto && (
        <AlunoDrawer
          aluno={alunoAberto}
          grupos={grupos}
          feedbacks={feedbacks}
          listas={listas}
          onClose={() => setDrawer(null)}
          onRequestRemove={() =>
            setConfirm({
              title: `Remover ${alunoAberto.nome}?`,
              message: "O aluno será removido do acompanhamento deste período.",
              confirmLabel: "Remover",
              onConfirm: async () => {
                await api.excluirAluno(token, alunoAberto.id);
                setDrawer(null);
                await load();
              },
            })
          }
        />
      )}
      {monitorAberto && (
        <MonitorDrawer
          monitor={monitorAberto}
          feedbacks={feedbacks}
          listas={listas}
          onClose={() => setDrawer(null)}
          onRequestRemove={() => {
            if (!monitorAberto.dupla) return;
            const semana = monitorAberto.dupla.monitorSemanaAId === monitorAberto.id ? "A" : "B";
            setConfirm({
              title: "Remover monitor?",
              message: `O monitor da semana ${semana} será removido desta dupla. Você pode vincular outro monitor depois.`,
              confirmLabel: "Remover",
              onConfirm: async () => {
                await api.atualizarDupla(token, monitorAberto.dupla!.id, {
                  [semana === "A" ? "monitorSemanaAId" : "monitorSemanaBId"]: null,
                });
                setDrawer(null);
                await load();
              },
            });
          }}
        />
      )}
      {confirm && <ConfirmModal request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

export default App;
