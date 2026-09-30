import { useState } from "react";
import { api } from "../lib/api";
import type { Aluno, GrupoPrazo, Lista, Turma } from "../lib/types";
import { IconChevronDown, IconPlus, IconTrash, IconX } from "../components/icons";
import type { ConfirmRequest } from "../components/ui";
import { toast } from "../lib/toast";
import { ListasPanel } from "../components/ListasPanel";
import { NovoGrupoPrazoModal } from "../components/gestao-prazo/NovoGrupoPrazoModal";
import { RenomearGrupoPrazoModal } from "../components/gestao-prazo/RenomearGrupoPrazoModal";
import { VincularAlunoGrupoPrazoModal } from "../components/gestao-prazo/VincularAlunoGrupoPrazoModal";
import { EditarPrazosGrupoModal } from "../components/gestao-prazo/EditarPrazosGrupoModal";

type ModalState =
  | { type: "novoGrupoPrazo" }
  | { type: "renomearGrupoPrazo"; grupo: GrupoPrazo }
  | { type: "editarPrazosGrupo"; grupo: GrupoPrazo }
  | { type: "vincularAlunosGrupoPrazo"; grupo: GrupoPrazo };

export function GruposPrazo({
  token,
  periodoId,
  gruposPrazo,
  alunos,
  listas,
  turmas,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  periodoId: string;
  gruposPrazo: GrupoPrazo[];
  alunos: Aluno[];
  listas: Lista[];
  turmas: Turma[];
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [alunosAbertos, setAlunosAbertos] = useState(new Set<string>());
  const alunosSemGrupoPrazo = alunos.filter((aluno) => !aluno.grupoPrazoId).length;

  function toggleAlunos(id: string) {
    setAlunosAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  function confirmarRemoverDoGrupo(aluno: Aluno) {
    onRequestConfirm({
      title: `Tirar ${aluno.nome} do grupo de prazo?`,
      message:
        "O aluno fica sem grupo de prazo. Se ele já tinha uma exceção individual, ela continua valendo normalmente (tem prioridade sobre o grupo); caso contrário, passa a usar o prazo da turma. Você poderá atribuí-lo a outro grupo depois.",
      confirmLabel: "Tirar do grupo",
      onConfirm: () => run(() => api.atribuirAlunosGrupoPrazo(token, [aluno.id], null)),
    });
  }

  function confirmarExclusao(grupo: GrupoPrazo) {
    const qtdAlunos = alunos.filter((a) => a.grupoPrazoId === grupo.id).length;
    onRequestConfirm({
      title: `Excluir ${grupo.nome}?`,
      message: qtdAlunos
        ? `Isso remove o grupo e os prazos configurados nele. ${qtdAlunos} aluno(s) ficarão sem grupo de prazo, mas continuam com seu cadastro normal.`
        : "Isso remove o grupo e os prazos configurados nele. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir grupo",
      onConfirm: () => run(() => api.excluirGrupoPrazo(token, grupo.id)),
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prazos</h1>
          <div className="subtitle">
            Configure o prazo de entrega de feedback por turma ou por grupo de alunos.
          </div>
        </div>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setModal({ type: "novoGrupoPrazo" })}>
            <IconPlus />
            Novo grupo de prazo
          </button>
        </div>
      </div>

      <ListasPanel token={token} listas={listas} turmas={turmas} onReload={onReload} />

      <h2 className="section-title">Prazos por grupo</h2>

      <div className="context-band">
        <div className="context-card">
          <span>Grupos de prazo</span>
          <strong>{gruposPrazo.length}</strong>
          <p>Grupos cadastrados neste período.</p>
        </div>
        <div className="context-card">
          <span>Alunos sem grupo de prazo</span>
          <strong>{alunosSemGrupoPrazo}</strong>
          <p>Usam o prazo da turma ou uma exceção individual.</p>
        </div>
        <div className="context-card compact">
          <span>Listas no período</span>
          <strong>{listas.length}</strong>
          <p>Disponíveis para configurar prazo por grupo.</p>
        </div>
      </div>

      <div className="grupo-grid">
        {gruposPrazo.map((grupo) => {
          const alunosDoGrupo = alunos.filter((a) => a.grupoPrazoId === grupo.id);
          const alunosOpen = alunosAbertos.has(grupo.id);
          return (
            <div key={grupo.id} className="grupo-card open">
              <div className="grupo-head" style={{ cursor: "default" }}>
                <div className="left">
                  <div>
                    <strong>{grupo.nome}</strong>
                    <div className="grupo-meta-pills">
                      <span>{alunosDoGrupo.length} aluno(s)</span>
                    </div>
                  </div>
                </div>
                <div className="right">
                  <button
                    className="btn sm"
                    title="Excluir grupo de prazo"
                    aria-label={`Excluir grupo de prazo ${grupo.nome}`}
                    onClick={() => confirmarExclusao(grupo)}
                  >
                    <IconTrash aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="grupo-body-wrap open">
                <div className="grupo-body">
                  <div className="dupla-body-actions">
                    <button
                      className="btn sm"
                      onClick={() => setModal({ type: "renomearGrupoPrazo", grupo })}
                    >
                      Renomear
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => setModal({ type: "editarPrazosGrupo", grupo })}
                    >
                      Prazos por lista
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => setModal({ type: "vincularAlunosGrupoPrazo", grupo })}
                    >
                      <IconPlus />
                      Alunos do grupo
                    </button>
                    <button
                      type="button"
                      className="aluno-count"
                      aria-expanded={alunosOpen}
                      onClick={() => toggleAlunos(grupo.id)}
                    >
                      {alunosOpen ? "Ocultar" : "Ver alunos"} <IconChevronDown />
                    </button>
                  </div>
                  <div className={`aluno-list-wrap${alunosOpen ? " open" : ""}`}>
                    <div className="aluno-list">
                      {alunosDoGrupo.length ? (
                        alunosDoGrupo.map((aluno) => (
                          <span className="aluno-tag" key={aluno.id}>
                            <span className="aluno-tag-nome">{aluno.nome}</span>
                            <small>
                              {aluno.matricula} · {aluno.turma.nome}
                            </small>
                            <button
                              className="x-btn"
                              title="Tirar do grupo de prazo"
                              aria-label={`Tirar ${aluno.nome} do grupo de prazo`}
                              onClick={() => confirmarRemoverDoGrupo(aluno)}
                            >
                              <IconX aria-hidden="true" />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="mono-cell">sem alunos vinculados</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!gruposPrazo.length && (
          <p className="mono-cell">Nenhum grupo de prazo cadastrado neste período.</p>
        )}
      </div>

      {modal?.type === "novoGrupoPrazo" && (
        <NovoGrupoPrazoModal
          token={token}
          periodoId={periodoId}
          onClose={() => setModal(null)}
          onCreated={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "renomearGrupoPrazo" && (
        <RenomearGrupoPrazoModal
          token={token}
          grupo={modal.grupo}
          onClose={() => setModal(null)}
          onRenamed={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "editarPrazosGrupo" && (
        <EditarPrazosGrupoModal
          token={token}
          grupo={modal.grupo}
          onClose={() => setModal(null)}
          onSaved={() => run(() => Promise.resolve())}
        />
      )}
      {modal?.type === "vincularAlunosGrupoPrazo" && (
        <VincularAlunoGrupoPrazoModal
          token={token}
          grupo={modal.grupo}
          alunos={alunos}
          turmas={turmas}
          gruposPrazo={gruposPrazo}
          onClose={() => setModal(null)}
          onUpdated={() => run(() => Promise.resolve())}
        />
      )}
    </>
  );
}
