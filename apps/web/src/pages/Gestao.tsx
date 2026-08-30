import { useState } from "react";
import { api } from "../lib/api";
import type { Aluno, Dupla, GrupoRevisao, Monitor, Turma } from "../lib/types";
import { IconChevronDown, IconPlus, IconTrash, IconX } from "../components/icons";
import type { ConfirmRequest } from "../components/ui";
import { initials } from "../lib/format";
import { monitorSemanaB } from "../lib/dupla";
import { toast } from "../lib/toast";
import { AtribuirMonitorModal } from "../components/gestao/AtribuirMonitorModal";
import { NovaDuplaModal } from "../components/gestao/NovaDuplaModal";
import { NovoGrupoModal } from "../components/gestao/NovoGrupoModal";
import { VincularAlunoModal } from "../components/gestao/VincularAlunoModal";

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
  const alunosSemDupla = alunos.filter((aluno) => !aluno.duplaId).length;
  const monitoresSemDupla = monitores.filter(
    (monitor) => !monitor.duplaId && monitor.status === "ATIVO",
  ).length;

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
    try {
      await action();
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação");
    }
  }

  function confirmarExclusaoGrupo(grupo: GrupoRevisao) {
    const gd = duplas.filter((d) => d.grupoRevisaoId === grupo.id);
    const qtdAlunos = alunos.filter((a) => gd.some((d) => d.id === a.duplaId)).length;
    onRequestConfirm({
      title: `Excluir ${grupo.nome}?`,
      message: gd.length
        ? `Isso também remove ${gd.length} dupla(s). A operação será bloqueada se existir feedback no grupo. ${qtdAlunos} aluno(s) e os monitores serão preservados, mas ficarão sem dupla.`
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
        ? `A operação será bloqueada se existir feedback ligado à dupla. ${qtdAlunos} aluno(s) e os monitores serão preservados, mas ficarão sem dupla.`
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
                  <div className="av">{initials(grupo.chefe?.nome ?? "?")}</div>
                  <div>
                    <strong>{grupo.nome}</strong>
                    <span className="chefe">chefe: {grupo.chefe?.nome ?? "—"}</span>
                    <div className="grupo-meta-pills">
                      <span>{gd.length} duplas</span>
                      <span>{qtdAlunos} alunos</span>
                      <span>
                        {gd.reduce((acc, dupla) => acc + (dupla.monitores?.length ?? 0), 0)}{" "}
                        monitores
                      </span>
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
              <div className={`grupo-body-wrap${aberto ? " open" : ""}`}>
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
                        <div className={`aluno-list-wrap${alunosOpen ? " open" : ""}`}>
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
                        </div>
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
              </div>
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
        {initials(monitor.nome)}
      </span>
      {monitor.nome}
      <button className="x-btn" title="Remover monitor da dupla" onClick={onRemove}>
        <IconX />
      </button>
    </div>
  );
}
