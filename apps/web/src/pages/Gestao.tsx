import { useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Aluno, Dupla, GrupoRevisao, Monitor, Turma } from "../lib/types";
import { IconChevronDown, IconPlus, IconTrash, IconX } from "../components/icons";
import type { ConfirmRequest } from "../components/ui";
import { Modal } from "../components/ui";

type ModalState =
  | { type: "novoGrupo" }
  | { type: "novaDupla"; grupoId: string }
  | { type: "vincularAluno"; grupoId: string }
  | { type: "atribuirMonitor"; duplaId: string; semana: "A" | "B" };

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
      setErro(error instanceof ApiError ? error.message : "Não foi possível concluir a ação");
    }
  }

  function confirmarExclusaoGrupo(grupo: GrupoRevisao) {
    const gd = duplas.filter((d) => d.grupoRevisaoId === grupo.id);
    onRequestConfirm({
      title: `Excluir ${grupo.nome}?`,
      message: gd.length
        ? "Este grupo tem duplas vinculadas — remova-as primeiro. Esta ação não pode ser desfeita."
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
        ? "Esta dupla tem alunos vinculados — remova-os primeiro. Esta ação não pode ser desfeita."
        : "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir dupla",
      onConfirm: () => run(() => api.excluirDupla(token, dupla.id)),
    });
  }
  function confirmarRemoverMonitor(dupla: Dupla, semana: "A" | "B") {
    onRequestConfirm({
      title: "Remover monitor?",
      message: `O monitor da semana ${semana} será removido desta dupla. Você pode vincular outro monitor depois.`,
      confirmLabel: "Remover",
      onConfirm: () =>
        run(() =>
          api.atualizarDupla(token, dupla.id, {
            [semana === "A" ? "monitorSemanaAId" : "monitorSemanaBId"]: null,
          }),
        ),
    });
  }
  function confirmarExclusaoAluno(aluno: Aluno) {
    onRequestConfirm({
      title: `Remover ${aluno.nome}?`,
      message: "O aluno será removido do acompanhamento deste período.",
      confirmLabel: "Remover",
      onConfirm: () => run(() => api.excluirAluno(token, aluno.id)),
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grupos &amp; duplas</h1>
          <div className="subtitle">
            Estrutura de supervisão do período — crie, edite e remova grupos, duplas, monitores e alunos.
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

      <div className="grupo-grid">
        {grupos.map((grupo) => {
          const gd = duplas.filter((d) => d.grupoRevisaoId === grupo.id);
          const qtdAlunos = alunos.filter((a) => a.dupla.grupoRevisaoId === grupo.id).length;
          const aberto = abertos.has(grupo.id);
          return (
            <div key={grupo.id} className={`grupo-card${aberto ? " open" : ""}`}>
              <div className="grupo-head" onClick={() => toggleGrupo(grupo.id)}>
                <div className="left">
                  <div className="av">{initialsOf(grupo.chefe?.nome ?? "?")}</div>
                  <div>
                    <strong>{grupo.nome}</strong>
                    <span className="chefe">chefe: {grupo.chefe?.nome ?? "—"}</span>
                  </div>
                </div>
                <div className="right">
                  <div className="grupo-stats">
                    <span>{gd.length} duplas</span>
                    <span>{qtdAlunos} alunos</span>
                  </div>
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
                    return (
                      <div key={dupla.id} className="dupla-row">
                        <div className="dupla-top">
                          <div className="dupla-label">{dupla.label}</div>
                          <MonitorSlot
                            semana="A"
                            monitor={dupla.monitorSemanaA ?? null}
                            onAssign={() => setModal({ type: "atribuirMonitor", duplaId: dupla.id, semana: "A" })}
                            onRemove={() => confirmarRemoverMonitor(dupla, "A")}
                          />
                          <MonitorSlot
                            semana="B"
                            monitor={dupla.monitorSemanaB ?? null}
                            onAssign={() => setModal({ type: "atribuirMonitor", duplaId: dupla.id, semana: "B" })}
                            onRemove={() => confirmarRemoverMonitor(dupla, "B")}
                          />
                          <button className="aluno-count" onClick={() => toggleAlunos(dupla.id)}>
                            {dAlunos.length} al. <IconChevronDown />
                          </button>
                          <button className="x-btn" title="Excluir dupla" onClick={() => confirmarExclusaoDupla(dupla)}>
                            <IconX />
                          </button>
                        </div>
                        {alunosOpen && (
                          <div className="aluno-list">
                            {dAlunos.length ? (
                              dAlunos.map((aluno) => (
                                <span className="aluno-tag" key={aluno.id}>
                                  {aluno.nome}
                                  <button
                                    className="x-btn"
                                    title="Remover aluno"
                                    onClick={() => confirmarExclusaoAluno(aluno)}
                                  >
                                    <IconX />
                                  </button>
                                </span>
                              ))
                            ) : (
                              <span className="mono-cell">sem alunos vinculados</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="dupla-body-actions">
                    <button className="btn sm" onClick={() => setModal({ type: "novaDupla", grupoId: grupo.id })}>
                      <IconPlus />
                      Nova dupla
                    </button>
                    <button className="btn sm" onClick={() => setModal({ type: "vincularAluno", grupoId: grupo.id })}>
                      <IconPlus />
                      Vincular aluno
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!grupos.length && <p className="mono-cell">Nenhum grupo de revisão cadastrado neste período.</p>}
      </div>

      {modal?.type === "novoGrupo" && (
        <NovoGrupoModal
          token={token}
          periodoId={periodoId}
          monitores={monitores}
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
          semana={modal.semana}
          monitoresDisponiveis={monitores.filter((m) => !m.duplaId)}
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

function MonitorSlot({
  semana,
  monitor,
  onAssign,
  onRemove,
}: {
  semana: "A" | "B";
  monitor: Monitor | null;
  onAssign: () => void;
  onRemove: () => void;
}) {
  if (!monitor)
    return (
      <button className="monitor-slot vago" onClick={onAssign}>
        <span className="wk">sem {semana}</span>vago
      </button>
    );
  return (
    <div className="monitor-slot">
      <span className="wk">sem {semana}</span>
      <span className="m-av" style={{ background: "var(--sky-dim)", color: "var(--sky)" }}>
        {initialsOf(monitor.nome)}
      </span>
      {monitor.nome}
      <button className="x-btn" title="Remover monitor" onClick={onRemove}>
        <IconX />
      </button>
    </div>
  );
}

function NovoGrupoModal({
  token,
  periodoId,
  monitores,
  onClose,
  onCreated,
}: {
  token: string;
  periodoId: string;
  monitores: Monitor[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const chefes = monitores.filter((m) => m.isChefe);
  const [nome, setNome] = useState("");
  const [chefeId, setChefeId] = useState(chefes[0]?.id ?? "__novo__");
  const [novoChefeNome, setNovoChefeNome] = useState("");
  const [novoChefeWhats, setNovoChefeWhats] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim()) return setErro("Informe o nome do grupo");
    setSalvando(true);
    setErro("");
    try {
      let id = chefeId;
      if (chefeId === "__novo__") {
        if (!novoChefeNome.trim() || !novoChefeWhats.trim())
          throw new ApiError("Informe nome e WhatsApp do novo chefe");
        const criado = await api.criarMonitor(token, {
          nome: novoChefeNome.trim(),
          whatsappNumero: novoChefeWhats.trim(),
          periodoId,
          isChefe: true,
        });
        id = criado.id;
      }
      await api.criarGrupo(token, { periodoId, chefeId: id, nome: nome.trim() });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar o grupo");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h4>Novo grupo de revisão</h4>
      <p>Crie um grupo e defina o chefe responsável.</p>
      <div className="field">
        <label>Nome do grupo</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Grupo Helena" />
      </div>
      <div className="field">
        <label>Chefe responsável</label>
        <select value={chefeId} onChange={(e) => setChefeId(e.target.value)}>
          {chefes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
          <option value="__novo__">+ Criar novo chefe</option>
        </select>
      </div>
      {chefeId === "__novo__" && (
        <>
          <div className="field">
            <label>Nome do novo chefe</label>
            <input value={novoChefeNome} onChange={(e) => setNovoChefeNome(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="field">
            <label>WhatsApp do novo chefe</label>
            <input
              value={novoChefeWhats}
              onChange={(e) => setNovoChefeWhats(e.target.value)}
              placeholder="+55 81 9XXXX-XXXX"
            />
          </div>
        </>
      )}
      {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={salvando} onClick={submit}>
          Criar grupo
        </button>
      </div>
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
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar a dupla");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h4>Nova dupla</h4>
      <p>Você pode vincular os monitores das semanas A e B depois de criar a dupla.</p>
      <div className="field">
        <label>Rótulo</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Dupla 3" />
      </div>
      {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={salvando} onClick={submit}>
          Criar dupla
        </button>
      </div>
    </Modal>
  );
}

function VincularAlunoModal({
  token,
  turmas,
  duplas,
  onClose,
  onCreated,
}: {
  token: string;
  turmas: Turma[];
  duplas: Dupla[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? "");
  const [duplaId, setDuplaId] = useState(duplas[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim() || !matricula.trim() || !turmaId || !duplaId)
      return setErro("Preencha todos os campos");
    setSalvando(true);
    try {
      await api.criarAluno(token, { nome: nome.trim(), matricula: matricula.trim(), turmaId, duplaId });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível vincular o aluno");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h4>Vincular aluno</h4>
      <p>Adicione um aluno a uma dupla deste grupo.</p>
      <div className="field">
        <label>Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
      </div>
      <div className="field">
        <label>Matrícula</label>
        <input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Ex: 20260099999" />
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
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={salvando} onClick={submit}>
          Vincular aluno
        </button>
      </div>
    </Modal>
  );
}

function AtribuirMonitorModal({
  token,
  periodoId,
  duplaId,
  semana,
  monitoresDisponiveis,
  onClose,
  onAssigned,
}: {
  token: string;
  periodoId: string;
  duplaId: string;
  semana: "A" | "B";
  monitoresDisponiveis: Monitor[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [monitorId, setMonitorId] = useState(monitoresDisponiveis[0]?.id ?? "__novo__");
  const [novoNome, setNovoNome] = useState("");
  const [novoWhats, setNovoWhats] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    setSalvando(true);
    setErro("");
    try {
      let id = monitorId;
      if (monitorId === "__novo__") {
        if (!novoNome.trim() || !novoWhats.trim())
          throw new ApiError("Informe nome e WhatsApp do novo monitor");
        const criado = await api.criarMonitor(token, {
          nome: novoNome.trim(),
          whatsappNumero: novoWhats.trim(),
          periodoId,
        });
        id = criado.id;
      }
      await api.atualizarDupla(token, duplaId, {
        [semana === "A" ? "monitorSemanaAId" : "monitorSemanaBId"]: id,
      });
      onAssigned();
      onClose();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível vincular o monitor");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h4>Vincular monitor · semana {semana}</h4>
      <p>Escolha um monitor sem dupla neste período, ou cadastre um novo.</p>
      <div className="field">
        <label>Monitor</label>
        <select value={monitorId} onChange={(e) => setMonitorId(e.target.value)}>
          {monitoresDisponiveis.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
          <option value="__novo__">+ Cadastrar novo monitor</option>
        </select>
      </div>
      {monitorId === "__novo__" && (
        <>
          <div className="field">
            <label>Nome</label>
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do monitor" />
          </div>
          <div className="field">
            <label>WhatsApp</label>
            <input value={novoWhats} onChange={(e) => setNovoWhats(e.target.value)} placeholder="+55 81 9XXXX-XXXX" />
          </div>
        </>
      )}
      {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={salvando} onClick={submit}>
          Vincular
        </button>
      </div>
    </Modal>
  );
}
