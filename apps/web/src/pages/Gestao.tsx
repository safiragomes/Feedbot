import { useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Aluno, Dupla, GrupoRevisao, Lista, Monitor, Turma } from "../lib/types";
import { IconChevronDown, IconPlus, IconTrash, IconX } from "../components/icons";
import type { ConfirmRequest } from "../components/ui";
import { Chip, Modal, Panel } from "../components/ui";
import { fimDoDiaIso, validarWhatsapp } from "../lib/format";
import { solicitarRemocaoAluno, solicitarRemocaoMonitor } from "../lib/acoes";
import { monitorSemanaB } from "../lib/dupla";

type ModalState =
  | { type: "novoGrupo" }
  | { type: "novaDupla"; grupoId: string }
  | { type: "vincularAluno"; grupoId: string }
  | { type: "atribuirMonitor"; duplaId: string }
  | { type: "novoMonitor" }
  | { type: "criarLogin"; monitor: Monitor }
  | { type: "editarLista"; lista: Lista };

export function Gestao({
  token,
  periodoId,
  grupos,
  duplas,
  monitores,
  alunos,
  turmas,
  listas,
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
  listas: Lista[];
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
  function confirmarExclusaoAluno(aluno: Aluno) {
    solicitarRemocaoAluno({ aluno, token, onRequestConfirm, onReload, onErro: setErro });
  }
  function confirmarExclusaoMonitor(monitor: Monitor) {
    if (monitor.duplaId) {
      setErro(`${monitor.nome} está vinculado a uma dupla — desvincule antes de excluir.`);
      return;
    }
    solicitarRemocaoMonitor({ monitor, token, onRequestConfirm, onReload, onErro: setErro });
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
            Estrutura de supervisão do período — crie, edite e remova grupos, duplas, monitores e
            alunos.
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

      <div className="panel-grid" style={{ marginBottom: 20 }}>
        <Panel
          title="Monitores"
          tag={`${monitores.length} no período`}
          legend={
            <button className="btn sm" onClick={() => setModal({ type: "novoMonitor" })}>
              <IconPlus />
              Novo monitor
            </button>
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {monitores.map((m) => (
              <div key={m.id} className="mini-row">
                <span className="l">
                  {m.nome} {m.isChefe && <Chip tone="warn">chefe</Chip>}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mono-cell">{m.dupla ? `${m.dupla.label}` : "sem dupla"}</span>
                  {m.isChefe &&
                    (m.contaChefe ? (
                      <Chip tone="ok">login: {m.contaChefe.email}</Chip>
                    ) : (
                      <button
                        className="btn sm"
                        onClick={() => setModal({ type: "criarLogin", monitor: m })}
                      >
                        Criar login
                      </button>
                    ))}
                  <button
                    className="x-btn"
                    title="Excluir monitor (apaga o cadastro — não confundir com remover da dupla)"
                    onClick={() => confirmarExclusaoMonitor(m)}
                  >
                    <IconTrash />
                  </button>
                </span>
              </div>
            ))}
            {!monitores.length && (
              <p className="mono-cell">Nenhum monitor cadastrado neste período.</p>
            )}
          </div>
        </Panel>
        <Panel title="Listas" tag={`${listas.length} no período`}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {[...listas]
              .sort((a, b) => a.ordem - b.ordem)
              .map((lista) => (
                <div key={lista.id} className="mini-row">
                  <span className="l">{lista.nome}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono-cell">{lista.qtdQuestoesTotal} questões</span>
                    <button
                      className="btn sm"
                      onClick={() => setModal({ type: "editarLista", lista })}
                    >
                      Editar
                    </button>
                  </span>
                </div>
              ))}
            {!listas.length && <p className="mono-cell">Nenhuma lista cadastrada neste período.</p>}
          </div>
        </Panel>
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
                    const monitoresDupla = dupla.monitores ?? [];
                    const [membro1, membro2] = monitoresDupla;
                    return (
                      <div key={dupla.id} className="dupla-row">
                        <div className="dupla-top">
                          <div className="dupla-label">{dupla.label}</div>
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
                          <button className="aluno-count" onClick={() => toggleAlunos(dupla.id)}>
                            {dAlunos.length} al. <IconChevronDown />
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
                                      title="Remover aluno"
                                      onClick={() => confirmarExclusaoAluno(aluno)}
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
          monitoresDisponiveis={monitores.filter((m) => !m.duplaId)}
          onClose={() => setModal(null)}
          onAssigned={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "novoMonitor" && (
        <NovoMonitorModal
          token={token}
          periodoId={periodoId}
          onClose={() => setModal(null)}
          onCreated={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "criarLogin" && (
        <CriarLoginModal
          token={token}
          monitor={modal.monitor}
          onClose={() => setModal(null)}
          onCreated={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "editarLista" && (
        <EditarListaModal
          token={token}
          lista={modal.lista}
          turmas={turmas}
          onClose={() => setModal(null)}
          onSaved={() => run(() => Promise.resolve())}
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
        const erroWhats = validarWhatsapp(novoChefeWhats);
        if (erroWhats) throw new ApiError(erroWhats);
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
              <input
                value={novoChefeNome}
                onChange={(e) => setNovoChefeNome(e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="field">
              <label>WhatsApp do novo chefe</label>
              <input
                value={novoChefeWhats}
                onChange={(e) => setNovoChefeWhats(e.target.value)}
                placeholder="+55 81 9XXXX-XXXX"
              />
              <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
                Não esqueça o 9 do celular — o bot só reconhece o número exatamente como aparece no
                WhatsApp.
              </p>
            </div>
          </>
        )}
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
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
    <Modal onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h4>Vincular aluno</h4>
        <p>Adicione um aluno a uma dupla deste grupo.</p>
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
  const [monitorId, setMonitorId] = useState(monitoresDisponiveis[0]?.id ?? "__novo__");
  const [novoNome, setNovoNome] = useState("");
  const [novoWhats, setNovoWhats] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    setSalvando(true);
    setErro("");
    try {
      if (monitorId === "__novo__") {
        if (!novoNome.trim() || !novoWhats.trim())
          throw new ApiError("Informe nome e WhatsApp do novo monitor");
        const erroWhats = validarWhatsapp(novoWhats);
        if (erroWhats) throw new ApiError(erroWhats);
        await api.criarMonitor(token, {
          nome: novoNome.trim(),
          whatsappNumero: novoWhats.trim(),
          periodoId,
          duplaId,
        });
      } else {
        await api.atualizarMonitor(token, monitorId, { duplaId });
      }
      onAssigned();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular o monitor");
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
        <h4>Vincular monitor à dupla</h4>
        <p>
          Escolha um monitor sem dupla neste período, ou cadastre um novo. Depois, escolha aluno a
          aluno quem é a semana A e quem é a semana B entre os dois monitores da dupla.
        </p>
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
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome do monitor"
              />
            </div>
            <div className="field">
              <label>WhatsApp</label>
              <input
                value={novoWhats}
                onChange={(e) => setNovoWhats(e.target.value)}
                placeholder="+55 81 9XXXX-XXXX"
              />
              <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
                Não esqueça o 9 do celular — o bot só reconhece o número exatamente como aparece no
                WhatsApp.
              </p>
            </div>
          </>
        )}
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Vincular
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NovoMonitorModal({
  token,
  periodoId,
  onClose,
  onCreated,
}: {
  token: string;
  periodoId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [isChefe, setIsChefe] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim() || !whatsappNumero.trim()) return setErro("Preencha nome e WhatsApp");
    const erroWhats = validarWhatsapp(whatsappNumero);
    if (erroWhats) return setErro(erroWhats);
    setSalvando(true);
    try {
      await api.criarMonitor(token, {
        nome: nome.trim(),
        whatsappNumero: whatsappNumero.trim(),
        periodoId,
        isChefe,
      });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar o monitor");
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
        <h4>Novo monitor</h4>
        <p>Cadastre um monitor no período. Vincule a uma dupla depois, na tela de grupos.</p>
        <div className="field">
          <label>Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
          />
        </div>
        <div className="field">
          <label>WhatsApp</label>
          <input
            value={whatsappNumero}
            onChange={(e) => setWhatsappNumero(e.target.value)}
            placeholder="+55 81 9XXXX-XXXX"
          />
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
            Não esqueça o 9 do celular — o bot só reconhece o número exatamente como aparece no
            WhatsApp.
          </p>
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
            <input
              type="checkbox"
              checked={isChefe}
              onChange={(e) => setIsChefe(e.target.checked)}
            />
            É chefe de monitoria
          </label>
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Criar monitor
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditarListaModal({
  token,
  lista,
  turmas,
  onClose,
  onSaved,
}: {
  token: string;
  lista: Lista;
  turmas: Turma[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(lista.nome);
  const [qtdQuestoesTotal, setQtdQuestoesTotal] = useState(String(lista.qtdQuestoesTotal));
  const [prazos, setPrazos] = useState(
    new Map(
      turmas.map((turma) => [
        turma.id,
        lista.prazos.find((p) => p.turmaId === turma.id)?.prazoEntregaFeedback.slice(0, 10) ?? "",
      ]),
    ),
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    const qtd = Number(qtdQuestoesTotal);
    if (!nome.trim() || !Number.isInteger(qtd) || qtd <= 0)
      return setErro("Informe um nome e uma quantidade de questões válida");
    setSalvando(true);
    try {
      if ([...prazos.values()].some((valor) => !valor))
        return setErro("Defina o prazo de todas as turmas");
      await api.atualizarLista(token, lista.id, {
        nome: nome.trim(),
        qtdQuestoesTotal: qtd,
        prazos: [...prazos].map(([turmaId, valor]) => ({
          turmaId,
          prazoEntregaFeedback: fimDoDiaIso(valor),
        })),
      });
      onSaved();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar a lista");
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
        <h4>Editar {lista.nome}</h4>
        <p>Defina a quantidade de questões e o prazo de feedback de cada turma.</p>
        <div className="field">
          <label>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Lista 1" />
        </div>
        {turmas.map((turma) => (
          <div className="field" key={turma.id}>
            <label>Prazo — {turma.nome}</label>
            <input
              type="date"
              value={prazos.get(turma.id) ?? ""}
              onChange={(e) => setPrazos((prev) => new Map(prev).set(turma.id, e.target.value))}
            />
          </div>
        ))}
        <div className="field">
          <label>Quantidade de questões</label>
          <input
            type="number"
            min={1}
            value={qtdQuestoesTotal}
            onChange={(e) => setQtdQuestoesTotal(e.target.value)}
          />
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CriarLoginModal({
  token,
  monitor,
  onClose,
  onCreated,
}: {
  token: string;
  monitor: Monitor;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!email.trim() || senha.length < 12)
      return setErro("E-mail válido e senha de ao menos 12 caracteres são obrigatórios");
    setSalvando(true);
    try {
      await api.criarContaChefe(token, { monitorId: monitor.id, email: email.trim(), senha });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar o login");
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
        <h4>Criar login para {monitor.nome}</h4>
        <p>Cria uma conta de acesso ao dashboard para este chefe de monitoria.</p>
        <div className="field">
          <label>E-mail institucional</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="nome@instituicao.edu.br"
          />
        </div>
        <div className="field">
          <label>Senha (mínimo 12 caracteres)</label>
          <input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" />
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            Criar login
          </button>
        </div>
      </form>
    </Modal>
  );
}
