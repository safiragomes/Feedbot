import { useMemo, useState } from "react";
import type { Aluno, Atraso, Dupla, Feedback, GrupoRevisao, Lista, Monitor } from "../lib/types";
import { IconPlus, IconSearch, IconTrash } from "../components/icons";
import { Avatar, Chip, EmptyState, type ConfirmRequest } from "../components/ui";
import { solicitarRemocaoAluno, solicitarRemocaoMonitor } from "../lib/acoes";
import { monitorSemanaB } from "../lib/dupla";
import { ConvidarChefeModal, NovoMonitorModal } from "../components/MonitorAccessModals";
import { api } from "../lib/api";

type TipoOcorrencia = "ia" | "plagio" | "proibicao";

export function DiretorioAlunos({
  token,
  alunos,
  grupos,
  listas,
  feedbacks,
  onOpenAluno,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  alunos: Aluno[];
  grupos: GrupoRevisao[];
  listas: Lista[];
  feedbacks: Feedback[];
  onOpenAluno: (id: string) => void;
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [turma, setTurma] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [listaId, setListaId] = useState("");
  const [ocorrencias, setOcorrencias] = useState<TipoOcorrencia[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");

  const turmas = useMemo(
    () => [...new Set(alunos.map((a) => a.turma.nome))].sort((a, b) => a.localeCompare(b)),
    [alunos],
  );

  const q = busca.trim().toLowerCase();
  const feedbacksCompativeis = feedbacks.filter(
    (feedback) => !listaId || feedback.listaId === listaId,
  );
  const feedbacksPorAluno = new Map<string, Feedback[]>();
  feedbacksCompativeis.forEach((feedback) => {
    const registros = feedbacksPorAluno.get(feedback.alunoId) ?? [];
    registros.push(feedback);
    feedbacksPorAluno.set(feedback.alunoId, registros);
  });

  function alunoAtendeOcorrencias(alunoId: string) {
    const registros = feedbacksPorAluno.get(alunoId) ?? [];
    return ocorrencias.every((tipo) =>
      registros.some((feedback) =>
        tipo === "ia"
          ? feedback.usouIa
          : tipo === "plagio"
            ? feedback.plagiou
            : feedback.usouProibicao,
      ),
    );
  }

  function alternarOcorrencia(tipo: TipoOcorrencia) {
    setOcorrencias((atuais) =>
      atuais.includes(tipo) ? atuais.filter((item) => item !== tipo) : [...atuais, tipo],
    );
  }

  const filtrados = alunos
    .filter(
      (a) =>
        (!turma || a.turma.nome === turma) &&
        (!grupoId || a.dupla?.grupoRevisaoId === grupoId) &&
        (!ocorrencias.length || alunoAtendeOcorrencias(a.id)) &&
        (!q || a.nome.toLowerCase().includes(q) || a.matricula.includes(q)),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const alunosComOcorrencias = filtrados.filter((aluno) =>
    feedbacksCompativeis.some(
      (feedback) =>
        feedback.alunoId === aluno.id &&
        (feedback.usouIa || feedback.plagiou || feedback.usouProibicao),
    ),
  ).length;
  const alunosSemDupla = filtrados.filter((aluno) => !aluno.duplaId).length;
  const filtrosAtivos = [turma, grupoId, listaId, busca.trim(), ocorrencias.join(",")].filter(
    Boolean,
  ).length;

  function limparFiltros() {
    setTurma("");
    setGrupoId("");
    setListaId("");
    setOcorrencias([]);
    setBusca("");
  }

  function confirmarExclusao(aluno: Aluno, event: React.MouseEvent) {
    event.stopPropagation();
    solicitarRemocaoAluno({ aluno, token, onRequestConfirm, onReload, onErro: setErro });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alunos</h1>
          <div className="subtitle">
            Diretório completo — encontre um aluno por turma, grupo ou busca direta.
          </div>
        </div>
        <div className="head-actions">
          <button className="btn sm ghost" onClick={limparFiltros} disabled={!filtrosAtivos}>
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="context-band">
        <div className="context-card">
          <span>Visíveis agora</span>
          <strong>{filtrados.length}</strong>
          <p>Alunos na seleção atual.</p>
        </div>
        <div className="context-card">
          <span>Com ocorrências</span>
          <strong>{alunosComOcorrencias}</strong>
          <p>IA, plágio ou proibição nas listas filtradas.</p>
        </div>
        <div className="context-card">
          <span>Sem dupla</span>
          <strong>{alunosSemDupla}</strong>
          <p>Cadastro ativo ainda sem alocação.</p>
        </div>
        <div className="context-card compact">
          <span>Filtros ativos</span>
          <strong>{filtrosAtivos}</strong>
          <p>{filtrosAtivos ? "Há restrições em vigor." : "Visão aberta do diretório."}</p>
        </div>
      </div>

      <div className="filterbar">
        <span className="flag">Turma</span>
        <select value={turma} onChange={(e) => setTurma(e.target.value)}>
          <option value="">todas as turmas</option>
          {turmas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="flag">Lista</span>
        <select value={listaId} onChange={(e) => setListaId(e.target.value)}>
          <option value="">todas as listas</option>
          {listas.map((lista) => (
            <option key={lista.id} value={lista.id}>
              {lista.nome}
            </option>
          ))}
        </select>
        <span className="flag">Ocorrências</span>
        <div className="occurrence-options">
          {(
            [
              ["ia", "IA"],
              ["plagio", "Plágio"],
              ["proibicao", "Proibição"],
            ] as const
          ).map(([tipo, label]) => (
            <label key={tipo}>
              <input
                type="checkbox"
                checked={ocorrencias.includes(tipo)}
                onChange={() => alternarOcorrencia(tipo)}
              />
              {label}
            </label>
          ))}
        </div>
        <span className="flag">Grupo</span>
        <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
          <option value="">todos os grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <div className="search-wrap">
          <div className="search-box">
            <IconSearch />
            <input
              placeholder="Buscar por nome ou matrícula"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Aluno</th>
              <th>Matrícula</th>
              <th>Turma</th>
              <th>Grupo de revisão</th>
              <th>Dupla</th>
              <th>Ocorrências</th>
              <th style={{ paddingRight: 20 }} />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id} className="clickable" onClick={() => onOpenAluno(a.id)}>
                <td style={{ paddingLeft: 20 }}>
                  <div className="person-cell">
                    <Avatar nome={a.nome} />
                    <span className="person-name">
                      {a.nome}
                      {a.isPcd && (
                        <span className="nd-icon" title="PCD ou neurodivergente">
                          ∞
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="mono-cell">{a.matricula}</td>
                <td>{a.turma.nome}</td>
                <td>{grupos.find((g) => g.id === a.dupla?.grupoRevisaoId)?.nome ?? "—"}</td>
                <td className="mono-cell">{a.dupla?.label ?? "sem dupla"}</td>
                <td>
                  <span className="flags-cell">
                    {feedbacksCompativeis.some((f) => f.alunoId === a.id && f.usouIa) && (
                      <Chip tone="info">IA</Chip>
                    )}
                    {feedbacksCompativeis.some((f) => f.alunoId === a.id && f.plagiou) && (
                      <Chip tone="danger">plágio</Chip>
                    )}
                    {feedbacksCompativeis.some((f) => f.alunoId === a.id && f.usouProibicao) && (
                      <Chip tone="warn">proibição</Chip>
                    )}
                    {!feedbacksCompativeis.some(
                      (f) => f.alunoId === a.id && (f.usouIa || f.plagiou || f.usouProibicao),
                    ) && <span className="mono-cell">—</span>}
                  </span>
                </td>
                <td style={{ paddingRight: 20, textAlign: "right" }}>
                  <button
                    className="x-btn"
                    title="Remover aluno"
                    onClick={(event) => confirmarExclusao(a, event)}
                  >
                    <IconTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtrados.length && (
          <EmptyState title="Nenhum aluno encontrado" hint="Ajuste os filtros ou a busca acima." />
        )}
      </div>
    </>
  );
}

export function DiretorioMonitores({
  token,
  periodoId,
  monitores,
  grupos,
  duplas,
  alunos,
  listas,
  atrasos,
  onOpenMonitor,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  periodoId: string;
  monitores: Monitor[];
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  alunos: Aluno[];
  listas: Lista[];
  atrasos: Atraso[];
  onOpenMonitor: (id: string) => void;
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [grupoId, setGrupoId] = useState("");
  const [listaId, setListaId] = useState("");
  const [somenteAtrasados, setSomenteAtrasados] = useState(false);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState<"novo" | Monitor | null>(null);

  const q = busca.trim().toLowerCase();
  const grupoDaDupla = new Map(duplas.map((d) => [d.id, d.grupoRevisaoId]));
  const duplaPorId = new Map(duplas.map((d) => [d.id, d]));
  const atrasosVisiveis = atrasos.filter((atraso) => !listaId || atraso.listaId === listaId);
  const monitoresAtrasados = new Set(atrasosVisiveis.map((atraso) => atraso.monitorId));
  const filtrados = monitores
    .filter((m) => {
      const pertenceAoGrupo = !grupoId || (!!m.duplaId && grupoDaDupla.get(m.duplaId) === grupoId);
      return (
        pertenceAoGrupo &&
        (!q || m.nome.toLowerCase().includes(q)) &&
        ((!listaId && !somenteAtrasados) || monitoresAtrasados.has(m.id))
      );
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const monitoresChefes = filtrados.filter((monitor) => monitor.isChefe).length;
  const convitesPendentes = filtrados.filter(
    (monitor) =>
      monitor.conviteContaChefe &&
      !monitor.conviteContaChefe.usadoEm &&
      new Date(monitor.conviteContaChefe.expiraEm) > new Date(),
  ).length;
  const filtrosAtivos = [grupoId, listaId, somenteAtrasados ? "atrasado" : "", busca.trim()].filter(
    Boolean,
  ).length;

  function limparFiltros() {
    setGrupoId("");
    setListaId("");
    setSomenteAtrasados(false);
    setBusca("");
  }

  function confirmarExclusao(monitor: Monitor, event: React.MouseEvent) {
    event.stopPropagation();
    solicitarRemocaoMonitor({ monitor, token, onRequestConfirm, onReload, onErro: setErro });
  }

  async function promoverChefe(monitor: Monitor, event: React.MouseEvent) {
    event.stopPropagation();
    setErro("");
    try {
      await api.atualizarMonitor(token, monitor.id, { isChefe: true });
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível promover o monitor");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monitores</h1>
          <div className="subtitle">
            Cadastre monitores, defina chefes e gerencie convites de acesso em um só lugar.
          </div>
        </div>
        <div className="head-actions">
          <button className="btn sm ghost" onClick={limparFiltros} disabled={!filtrosAtivos}>
            Limpar filtros
          </button>
          <button className="btn primary" onClick={() => setModal("novo")}>
            <IconPlus />
            Novo monitor
          </button>
        </div>
      </div>

      <div className="context-band">
        <div className="context-card">
          <span>Visíveis agora</span>
          <strong>{filtrados.length}</strong>
          <p>Monitores que atendem os filtros atuais.</p>
        </div>
        <div className="context-card">
          <span>Chefes ativos</span>
          <strong>{monitoresChefes}</strong>
          <p>Monitores com papel de liderança.</p>
        </div>
        <div className="context-card">
          <span>Atrasos abertos</span>
          <strong>{monitoresAtrasados.size}</strong>
          <p>Monitores com feedback não entregue após o prazo.</p>
        </div>
        <div className="context-card compact">
          <span>Convites abertos</span>
          <strong>{convitesPendentes}</strong>
          <p>Convites de acesso ainda válidos.</p>
        </div>
      </div>

      <div className="filterbar">
        <span className="flag">Grupo</span>
        <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
          <option value="">todos os grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <span className="flag">Lista em atraso</span>
        <select value={listaId} onChange={(e) => setListaId(e.target.value)}>
          <option value="">todas as listas</option>
          {listas.map((lista) => (
            <option key={lista.id} value={lista.id}>
              {lista.nome}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <input
            type="checkbox"
            checked={somenteAtrasados}
            onChange={(e) => setSomenteAtrasados(e.target.checked)}
          />
          <span className="flag">somente com atrasos</span>
        </label>
        <div className="search-wrap">
          <div className="search-box">
            <IconSearch />
            <input
              placeholder="Buscar por nome"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Monitor</th>
              <th>Alunos · semana A</th>
              <th>Alunos · semana B</th>
              <th>Papel</th>
              <th>Acesso</th>
              <th>Atrasos abertos</th>
              <th style={{ paddingRight: 20 }} />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m) => {
              const alunosDaDupla = m.duplaId ? alunos.filter((a) => a.duplaId === m.duplaId) : [];
              const monitoresDupla = (m.duplaId && duplaPorId.get(m.duplaId)?.monitores) || [];
              const alunosA = alunosDaDupla.filter((a) => a.monitorSemanaAId === m.id).length;
              const alunosB = alunosDaDupla.filter(
                (a) => monitorSemanaB(monitoresDupla, a.monitorSemanaAId)?.id === m.id,
              ).length;
              return (
                <tr key={m.id} className="clickable" onClick={() => onOpenMonitor(m.id)}>
                  <td style={{ paddingLeft: 20 }}>
                    <div className="person-cell">
                      <Avatar nome={m.nome} />
                      <span className="person-name">{m.nome}</span>
                    </div>
                  </td>
                  <td className="mono-cell">{alunosA}</td>
                  <td className="mono-cell">{alunosB}</td>
                  <td>
                    <Chip tone={m.isChefe ? "warn" : "off"}>{m.isChefe ? "chefe" : "monitor"}</Chip>
                  </td>
                  <td>
                    {!m.isChefe ? (
                      <button className="btn sm" onClick={(event) => void promoverChefe(m, event)}>
                        Tornar chefe
                      </button>
                    ) : m.contaChefe ? (
                      <Chip tone="ok">{m.contaChefe.email}</Chip>
                    ) : (
                      <button
                        className="btn sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setModal(m);
                        }}
                      >
                        {m.conviteContaChefe &&
                        !m.conviteContaChefe.usadoEm &&
                        new Date(m.conviteContaChefe.expiraEm) > new Date()
                          ? "Reenviar convite"
                          : "Enviar convite"}
                      </button>
                    )}
                  </td>
                  <td>
                    {atrasosVisiveis.filter((atraso) => atraso.monitorId === m.id).length ? (
                      <Chip tone="danger">
                        {atrasosVisiveis.filter((atraso) => atraso.monitorId === m.id).length}
                      </Chip>
                    ) : (
                      <span className="mono-cell">—</span>
                    )}
                  </td>
                  <td style={{ paddingRight: 20, textAlign: "right" }}>
                    <button
                      className="x-btn"
                      title="Excluir monitor"
                      onClick={(event) => confirmarExclusao(m, event)}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtrados.length && (
          <EmptyState
            title="Nenhum monitor encontrado"
            hint="Ajuste os filtros ou a busca acima."
          />
        )}
      </div>
      {modal === "novo" && (
        <NovoMonitorModal
          token={token}
          periodoId={periodoId}
          onClose={() => setModal(null)}
          onCreated={() => void onReload()}
        />
      )}
      {modal && modal !== "novo" && (
        <ConvidarChefeModal
          token={token}
          monitor={modal}
          onClose={() => setModal(null)}
          onSent={() => void onReload()}
        />
      )}
    </>
  );
}
