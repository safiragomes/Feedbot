import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Aluno, Dupla, GrupoRevisao, Monitor, Turma } from "../lib/types";
import { IconChevronDown, IconPlus, IconTrash, IconX } from "../components/icons";
import type { ConfirmRequest } from "../components/ui";
import { Modal } from "../components/ui";
import { monitorSemanaB } from "../lib/dupla";
import { validarWhatsapp } from "../lib/format";

type ModalState =
  | { type: "novoGrupo" }
  | { type: "novaDupla"; grupoId: string }
  | { type: "vincularAluno"; grupoId: string }
  | { type: "atribuirMonitor"; duplaId: string };

export function Gestao({
  token,
  periodoId,
  grupos,
  duplas,
  monitores,
  alunos,
  turmas,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  periodoId: string;
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  monitores: Monitor[];
  alunos: Aluno[];
  turmas: Turma[];
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [abertos, setAbertos] = useState(new Set<string>());
  const [alunosAbertos, setAlunosAbertos] = useState(new Set<string>());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [erro, setErro] = useState("");
  const alunosSemDupla = alunos.filter((aluno) => !aluno.duplaId).length;
  const monitoresSemDupla = monitores.filter((monitor) => !monitor.duplaId && monitor.status === "ATIVO").length;

  function toggleGrupo(id: string) {
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAlunos(duplaId: string) {
    setAlunosAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(duplaId)) next.delete(duplaId);
      else next.add(duplaId);
      return next;
    });
  }

  async function run(action: () => Promise<unknown>) {
    setErro("");
    try {
      await action();
      await onReload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível concluir a ação");
    }
  }

  function confirmarExclusaoGrupo(grupo: GrupoRevisao) {
    const gd = duplas.filter((d) => d.grupoRevisaoId === grupo.id);
    const qtdAlunos = alunos.filter((a) => gd.some((d) => d.id === a.duplaId)).length;
    onRequestConfirm({
      title: `Excluir ${grupo.nome}?`,
      message: gd.length
        ? `Isso também apaga ${gd.length} dupla(s) e o histórico ligado a elas. ${qtdAlunos} aluno(s) e os monitores serão preservados, mas ficarão sem dupla. Esta ação não pode ser desfeita.`
        : "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir grupo",
      onConfirm: () => run(() => api.excluirGrupo(token, grupo.id)),
    });
  }
  function confirmarExclusaoDupla(dupla: Dupla) {
    const qtdAlunos = alunos.filter((a) => a.duplaId === dupla.id).length;
    onRequestConfirm({
      title: "Excluir dupla?",
      message: qtdAlunos
        ? `O histórico ligado à dupla será apagado. ${qtdAlunos} aluno(s) e os monitores serão preservados, mas ficarão sem dupla. Esta ação não pode ser desfeita.`
        : "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir dupla",
      onConfirm: () => run(() => api.excluirDupla(token, dupla.id)),
    });
  }
  function confirmarRemoverMonitor(monitor: Monitor) {
    onRequestConfirm({
      title: "Remover monitor da dupla?",
      message:
        "O monitor sai da dupla. Alunos que dependiam dele como semana A ficam sem monitor até uma nova escolha.",
      confirmLabel: "Remover",
      onConfirm: () => run(() => api.atualizarMonitor(token, monitor.id, { duplaId: null })),
    });
  }
  function confirmarDesvinculoAluno(aluno: Aluno) {
    onRequestConfirm({
      title: `Tirar ${aluno.nome} da dupla?`,
      message:
        "O aluno ficará sem dupla, mas seu cadastro e todo o histórico serão preservados. Você poderá vinculá-lo novamente depois.",
      confirmLabel: "Tirar da dupla",
      onConfirm: () => run(() => api.atualizarAluno(token, aluno.id, { duplaId: null })),
    });
  }
  async function escolherPapel(
    aluno: Aluno,
    monitoresDupla: Monitor[],
    slot: "A" | "B",
    monitorId: string,
  ) {
    const monitorSemanaAId =
      slot === "A" ? monitorId : (monitoresDupla.find((m) => m.id !== monitorId)?.id ?? null);
    await run(() => api.atualizarAluno(token, aluno.id, { monitorSemanaAId }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grupos &amp; duplas</h1>
          <div className="subtitle">
            Organize os chefes vigentes, as duplas de supervisão e os alunos atendidos no período.
          </div>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setModal({ type: "novoGrupo" })}>
            <IconPlus />
            Novo grupo
          </button>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <div className="context-band">
        <div className="context-card">
          <span>Grupos</span>
          <strong>{grupos.length}</strong>
          <p>Estruturas de revisão ativas neste período.</p>
        </div>
        <div className="context-card">
          <span>Duplas</span>
          <strong>{duplas.length}</strong>
          <p>Frentes operacionais cadastradas.</p>
        </div>
        <div className="context-card">
          <span>Alunos sem dupla</span>
          <strong>{alunosSemDupla}</strong>
          <p>Demandam redistribuição.</p>
        </div>
        <div className="context-card compact">
          <span>Monitores livres</span>
          <strong>{monitoresSemDupla}</strong>
          <p>Disponíveis para alocação.</p>
        </div>
      </div>

      <div className="grupo-grid">
        {grupos.map((grupo) => {
          const gd = duplas.filter((d) => d.grupoRevisaoId === grupo.id);
          const qtdAlunos = alunos.filter((a) => a.dupla?.grupoRevisaoId === grupo.id).length;
          const aberto = abertos.has(grupo.id);
          return (
            <div key={grupo.id} className={`grupo-card${aberto ? " open" : ""}`}>
              <div className="grupo-head" onClick={() => toggleGrupo(grupo.id)}>
                <div className="left">
                  <div className="av">{initialsOf(grupo.chefe?.nome ?? "?")}</div>
                  <div>
                    <strong>{grupo.nome}</strong>
                    <span className="chefe">chefe: {grupo.chefe?.nome ?? "—"}</span>
                    <div className="grupo-meta-pills">
                      <span>{gd.length} duplas</span>
                      <span>{qtdAlunos} alunos</span>
                      <span>{gd.reduce((acc, dupla) => acc + (dupla.monitores?.length ?? 0), 0)} monitores</span>
                    </div>
                  </div>
                </div>
                <div className="right">
                  <button
                    className="btn sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      confirmarExclusaoGrupo(grupo);
                    }}
                  >
                    <IconTrash />
                  </button>
                  <IconChevronDown className="icon chevron" />
                </div>
              </div>
              {aberto && (
                <div className="grupo-body">
                  {gd.map((dupla) => {
                    const dAlunos = alunos.filter((a) => a.duplaId === dupla.id);
                    const alunosOpen = alunosAbertos.has(dupla.id);
                    const monitoresDupla = dupla.monitores ?? [];
                    const [membro1, membro2] = monitoresDupla;
                    return (
                      <div key={dupla.id} className="dupla-row">
                        <div className="dupla-top">
                          <div className="dupla-label">
                            <strong>{dupla.label}</strong>
                            <span>{dAlunos.length} aluno(s)</span>
                          </div>
                          <MembroSlot
                            monitor={membro1 ?? null}
                            onAssign={() =>
                              setModal({ type: "atribuirMonitor", duplaId: dupla.id })
                            }
                            onRemove={() => membro1 && confirmarRemoverMonitor(membro1)}
                          />
                          <MembroSlot
                            monitor={membro2 ?? null}
                            onAssign={() =>
                              setModal({ type: "atribuirMonitor", duplaId: dupla.id })
                            }
                            onRemove={() => membro2 && confirmarRemoverMonitor(membro2)}
                          />
                          <button
                            type="button"
                            className="aluno-count"
                            aria-expanded={alunosOpen}
                            onClick={() => toggleAlunos(dupla.id)}
                          >
                            {alunosOpen ? "Ocultar" : "Ver alunos"} <IconChevronDown />
                          </button>
                          <button
                            className="x-btn"
                            title="Excluir dupla"
                            onClick={() => confirmarExclusaoDupla(dupla)}
                          >
                            <IconX />
                          </button>
                        </div>
                        {alunosOpen && (
                          <div className="aluno-list">
                            {dAlunos.length ? (
                              dAlunos.map((aluno) => {
                                const monitorAId = aluno.monitorSemanaAId;
                                const monitorBId =
                                  monitorSemanaB(monitoresDupla, monitorAId)?.id ?? "";
                                return (
                                  <span className="aluno-tag" key={aluno.id}>
                                    {aluno.nome}
                                    <span className="papel-tag">A</span>
                                    <select
                                      className={`select-papel${monitorAId ? "" : " vago"}`}
                                      value={monitorAId ?? ""}
                                      onChange={(e) =>
                                        e.target.value &&
                                        escolherPapel(aluno, monitoresDupla, "A", e.target.value)
                                      }
                                    >
                                      <option value="">vago</option>
                                      {monitoresDupla.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.nome}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="papel-tag">B</span>
                                    <select
                                      className={`select-papel${monitorBId ? "" : " vago"}`}
                                      value={monitorBId}
                                      disabled={monitoresDupla.length < 2}
                                      onChange={(e) =>
                                        e.target.value &&
                                        escolherPapel(aluno, monitoresDupla, "B", e.target.value)
                                      }
                                    >
                                      <option value="">vago</option>
                                      {monitoresDupla.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.nome}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      className="x-btn"
                                      title="Tirar aluno da dupla"
                                      onClick={() => confirmarDesvinculoAluno(aluno)}
                                    >
                                      <IconX />
                                    </button>
                                  </span>
                                );
                              })
                            ) : (
                              <span className="mono-cell">sem alunos vinculados</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="dupla-body-actions">
                    <button
                      className="btn sm"
                      onClick={() => setModal({ type: "novaDupla", grupoId: grupo.id })}
                    >
                      <IconPlus />
                      Nova dupla
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => setModal({ type: "vincularAluno", grupoId: grupo.id })}
                    >
                      <IconPlus />
                      Vincular aluno
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!grupos.length && (
          <p className="mono-cell">Nenhum grupo de revisão cadastrado neste período.</p>
        )}
      </div>

      {modal?.type === "novoGrupo" && (
        <NovoGrupoModal
          token={token}
          periodoId={periodoId}
          monitores={monitores}
          grupos={grupos}
          onClose={() => setModal(null)}
          onCreated={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "novaDupla" && (
        <NovaDuplaModal
          token={token}
          grupoRevisaoId={modal.grupoId}
          existentes={duplas.filter((d) => d.grupoRevisaoId === modal.grupoId).length}
          onClose={() => setModal(null)}
          onCreated={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "vincularAluno" && (
        <VincularAlunoModal
          token={token}
          alunos={alunos}
          turmas={turmas}
          duplas={duplas.filter((d) => d.grupoRevisaoId === modal.grupoId)}
          onClose={() => setModal(null)}
          onCreated={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "atribuirMonitor" && (
        <AtribuirMonitorModal
          token={token}
          periodoId={periodoId}
          duplaId={modal.duplaId}
          monitoresDisponiveis={monitores.filter((m) => !m.duplaId && m.status === "ATIVO")}
          onClose={() => setModal(null)}
          onAssigned={() => run(() => Promise.resolve())}
        />
      )}
    </>
  );
}

function initialsOf(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function MembroSlot({
  monitor,
  onAssign,
  onRemove,
}: {
  monitor: Monitor | null;
  onAssign: () => void;
  onRemove: () => void;
}) {
  if (!monitor)
    return (
      <button className="monitor-slot vago" onClick={onAssign}>
        vago
      </button>
    );
  return (
    <div className="monitor-slot">
      <span className="m-av" style={{ background: "var(--sky-dim)", color: "var(--sky)" }}>
        {initialsOf(monitor.nome)}
      </span>
      {monitor.nome}
      <button className="x-btn" title="Remover monitor da dupla" onClick={onRemove}>
        <IconX />
      </button>
    </div>
  );
}

function NovoGrupoModal({
  token,
  periodoId,
  monitores,
  grupos,
  onClose,
  onCreated,
}: {
  token: string;
  periodoId: string;
  monitores: Monitor[];
  grupos: GrupoRevisao[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const chefes = monitores.filter(
    (monitor) => monitor.isChefe && !grupos.some((grupo) => grupo.chefeId === monitor.id),
  );
  const [nome, setNome] = useState("");
  const [chefeId, setChefeId] = useState(chefes[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim() || !chefeId)
      return setErro("Informe o nome e selecione um chefe vigente disponível");
    setSalvando(true);
    setErro("");
    try {
      await api.criarGrupo(token, { periodoId, chefeId, nome: nome.trim() });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar o grupo");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h4>Novo grupo de revisão</h4>
        <p>Crie um grupo e defina o chefe responsável.</p>
        <div className="field">
          <label>Nome do grupo</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Grupo Helena"
          />
        </div>
        <div className="field">
          <label>Chefe responsável</label>
          <select value={chefeId} onChange={(e) => setChefeId(e.target.value)}>
            {!chefes.length && <option value="">Nenhum chefe disponível</option>}
            {chefes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        {!chefes.length && (
          <p>Cadastre ou promova um monitor na tela Monitores antes de criar este grupo.</p>
        )}
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando || !chefes.length}>
            Criar grupo
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NovaDuplaModal({
  token,
  grupoRevisaoId,
  existentes,
  onClose,
  onCreated,
}: {
  token: string;
  grupoRevisaoId: string;
  existentes: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState(`Dupla ${existentes + 1}`);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!label.trim()) return setErro("Informe o rótulo da dupla");
    setSalvando(true);
    try {
      await api.criarDupla(token, { grupoRevisaoId, label: label.trim() });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar a dupla");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h4>Nova dupla</h4>
        <p>Você pode vincular os monitores das semanas A e B depois de criar a dupla.</p>
        <div className="field">
          <label>Rótulo</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Dupla 3"
          />
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Criar dupla
          </button>
        </div>
      </form>
    </Modal>
  );
}

function VincularAlunoModal({
  token,
  alunos,
  turmas,
  duplas,
  onClose,
  onCreated,
}: {
  token: string;
  alunos: Aluno[];
  turmas: Turma[];
  duplas: Dupla[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [modo, setModo] = useState<"existentes" | "novo">("existentes");
  const [busca, setBusca] = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [selecionados, setSelecionados] = useState(new Set<string>());
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? "");
  const [duplaId, setDuplaId] = useState(duplas[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const alunosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return alunos.filter(
      (aluno) =>
        (!turmaFiltro || aluno.turmaId === turmaFiltro) &&
        (!termo ||
          aluno.nome.toLocaleLowerCase("pt-BR").includes(termo) ||
          aluno.matricula.includes(termo)),
    );
  }, [alunos, busca, turmaFiltro]);

  function alternarAluno(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  async function vincularExistentes() {
    if (!duplaId || selecionados.size === 0)
      return setErro("Selecione ao menos um aluno e uma dupla");
    setSalvando(true);
    setErro("");
    try {
      await api.atribuirAlunosDupla(token, [...selecionados], duplaId);
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular os alunos");
    } finally {
      setSalvando(false);
    }
  }

  async function cadastrarNovo() {
    if (!nome.trim() || !matricula.trim() || !turmaId || !duplaId)
      return setErro("Preencha todos os campos");
    setSalvando(true);
    try {
      await api.criarAluno(token, {
        nome: nome.trim(),
        matricula: matricula.trim(),
        turmaId,
        duplaId,
      });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o aluno");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h4>Vincular aluno</h4>
      <div className="student-link-tabs" role="tablist" aria-label="Forma de vínculo">
        <button
          type="button"
          className={`btn sm${modo === "existentes" ? " primary" : ""}`}
          onClick={() => setModo("existentes")}
        >
          Selecionar existentes
        </button>
        <button
          type="button"
          className={`btn sm${modo === "novo" ? " primary" : ""}`}
          onClick={() => setModo("novo")}
        >
          Cadastrar novo
        </button>
      </div>

      {modo === "existentes" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void vincularExistentes();
          }}
        >
          <p>
            Pesquise e selecione alunos já cadastrados. Um novo vínculo substitui a dupla atual.
          </p>
          <div className="student-link-filters">
            <div className="field">
              <label htmlFor="busca-aluno">Nome ou matrícula</label>
              <input
                id="busca-aluno"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Pesquisar aluno"
              />
            </div>
            <div className="field">
              <label htmlFor="filtro-turma-aluno">Turma</label>
              <select
                id="filtro-turma-aluno"
                value={turmaFiltro}
                onChange={(event) => setTurmaFiltro(event.target.value)}
              >
                <option value="">Todas as turmas</option>
                {turmas.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="student-link-selection-bar">
            <span>{selecionados.size} selecionado(s)</span>
            <span>
              <button
                className="btn sm ghost"
                type="button"
                onClick={() =>
                  setSelecionados(
                    (atuais) => new Set([...atuais, ...alunosFiltrados.map((aluno) => aluno.id)]),
                  )
                }
              >
                Selecionar visíveis
              </button>
              <button
                className="btn sm ghost"
                type="button"
                onClick={() => setSelecionados(new Set())}
              >
                Limpar
              </button>
            </span>
          </div>
          <div className="student-link-list">
            {alunosFiltrados.map((aluno) => (
              <label className="student-link-row" key={aluno.id}>
                <input
                  type="checkbox"
                  checked={selecionados.has(aluno.id)}
                  onChange={() => alternarAluno(aluno.id)}
                />
                <span className="student-link-identity">
                  <strong>{aluno.nome}</strong>
                  <small>{aluno.matricula}</small>
                </span>
                <span className="student-link-meta">
                  <small>{aluno.turma.nome}</small>
                  <small>{aluno.dupla?.label ?? "Sem dupla"}</small>
                </span>
              </label>
            ))}
            {!alunosFiltrados.length && <p>Nenhum aluno encontrado com esses filtros.</p>}
          </div>
          <div className="field">
            <label>Vincular à dupla</label>
            <select value={duplaId} onChange={(e) => setDuplaId(e.target.value)}>
              {duplas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={salvando || !duplas.length}>
              Vincular {selecionados.size || "alunos"}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void cadastrarNovo();
          }}
        >
          <p>Cadastre um aluno e já o adicione a uma dupla deste grupo.</p>
          <div className="field">
            <label>Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="field">
            <label>Matrícula</label>
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              placeholder="Ex: 20260099999"
            />
          </div>
          <div className="field">
            <label>Turma</label>
            <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Dupla</label>
            <select value={duplaId} onChange={(e) => setDuplaId(e.target.value)}>
              {duplas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={salvando}>
              Vincular aluno
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function AtribuirMonitorModal({
  token,
  periodoId,
  duplaId,
  monitoresDisponiveis,
  onClose,
  onAssigned,
}: {
  token: string;
  periodoId: string;
  duplaId: string;
  monitoresDisponiveis: Monitor[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [modo, setModo] = useState<"existente" | "novo">("existente");
  const [busca, setBusca] = useState("");
  const [monitorId, setMonitorId] = useState("");
  const [nome, setNome] = useState("");
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const monitoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return monitoresDisponiveis;
    const digitos = termo.replace(/\D/g, "");
    return monitoresDisponiveis.filter(
      (monitor) =>
        monitor.nome.toLocaleLowerCase("pt-BR").includes(termo) ||
        (digitos && monitor.whatsappNumero.replace(/\D/g, "").includes(digitos)),
    );
  }, [busca, monitoresDisponiveis]);
  const monitorSelecionadoVisivel = monitoresFiltrados.some((monitor) => monitor.id === monitorId);

  async function vincularExistente() {
    if (!monitorSelecionadoVisivel) return setErro("Selecione um monitor da lista");
    setSalvando(true);
    setErro("");
    try {
      await api.atualizarMonitor(token, monitorId, { duplaId });
      onAssigned();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o monitor");
    } finally {
      setSalvando(false);
    }
  }

  async function cadastrarEVincular() {
    if (!nome.trim() || !whatsappNumero.trim()) return setErro("Preencha nome e WhatsApp");
    const erroWhats = validarWhatsapp(whatsappNumero);
    if (erroWhats) return setErro(erroWhats);
    setSalvando(true);
    setErro("");
    try {
      await api.criarMonitor(token, {
        nome: nome.trim(),
        whatsappNumero: whatsappNumero.trim(),
        periodoId,
        duplaId,
      });
      onAssigned();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível cadastrar o monitor");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h4>Vincular monitor à dupla</h4>
      <div className="student-link-tabs" role="tablist" aria-label="Forma de vínculo">
        <button
          type="button"
          className={`btn sm${modo === "existente" ? " primary" : ""}`}
          onClick={() => {
            setModo("existente");
            setErro("");
          }}
        >
          Selecionar existente
        </button>
        <button
          type="button"
          className={`btn sm${modo === "novo" ? " primary" : ""}`}
          onClick={() => {
            setModo("novo");
            setErro("");
          }}
        >
          Cadastrar novo
        </button>
      </div>

      {modo === "existente" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void vincularExistente();
          }}
        >
          <p>Pesquise e selecione um monitor ativo que ainda não pertence a uma dupla.</p>
          <div className="field">
            <label htmlFor="busca-monitor">Nome ou WhatsApp</label>
            <input
              id="busca-monitor"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Pesquisar monitor"
            />
          </div>
          <div className="student-link-list monitor-link-list">
            {monitoresFiltrados.map((monitor) => (
              <label className="student-link-row" key={monitor.id}>
                <input
                  type="radio"
                  name="monitor"
                  checked={monitorId === monitor.id}
                  onChange={() => setMonitorId(monitor.id)}
                />
                <span className="student-link-identity">
                  <strong>{monitor.nome}</strong>
                  <small>{monitor.whatsappNumero}</small>
                </span>
                <span className="student-link-meta">
                  <small>{monitor.isChefe ? "Monitor-chefe" : "Monitor"}</small>
                  <small>Sem dupla</small>
                </span>
              </label>
            ))}
            {!monitoresFiltrados.length && (
              <p className="empty-selection-message">
                {monitoresDisponiveis.length
                  ? "Nenhum monitor encontrado com essa pesquisa."
                  : "Nenhum monitor ativo e sem dupla está disponível."}
              </p>
            )}
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn primary"
              type="submit"
              disabled={salvando || !monitorSelecionadoVisivel}
            >
              {salvando ? "Vinculando…" : "Vincular monitor"}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void cadastrarEVincular();
          }}
        >
          <p>Cadastre o monitor e vincule-o imediatamente a esta dupla.</p>
          <div className="field">
            <label htmlFor="novo-monitor-nome">Nome</label>
            <input
              id="novo-monitor-nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="field">
            <label htmlFor="novo-monitor-whatsapp">WhatsApp</label>
            <input
              id="novo-monitor-whatsapp"
              value={whatsappNumero}
              onChange={(event) => setWhatsappNumero(event.target.value)}
              placeholder="+55 81 9XXXX-XXXX"
            />
            <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
              Inclua DDI, DDD e o 9 do celular.
            </p>
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={salvando}>
              {salvando ? "Cadastrando…" : "Cadastrar e vincular"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
