import type { Aluno, Feedback, GrupoRevisao, Lista, Monitor } from "../lib/types";
import { noPrazo } from "../lib/format";
import { Avatar, Chip, Drawer, DrawerCloseButton, MiniRow } from "./ui";

export function AlunoDrawer({
  aluno,
  grupos,
  feedbacks,
  listas,
  onClose,
  onRequestRemove,
}: {
  aluno: Aluno;
  grupos: GrupoRevisao[];
  feedbacks: Feedback[];
  listas: Lista[];
  onClose: () => void;
  onRequestRemove: () => void;
}) {
  const afb = feedbacks.filter((f) => f.alunoId === aluno.id);
  const grupoNome = grupos.find((g) => g.id === aluno.dupla.grupoRevisaoId)?.nome ?? "—";

  return (
    <Drawer onClose={onClose}>
      <div className="drawer-head">
        <div className="who">
          <Avatar nome={aluno.nome} size={46} />
          <div>
            <h4>
              {aluno.nome}
              {aluno.isPcd && (
                <span className="nd-icon" title="PCD">
                  {" "}
                  ∞
                </span>
              )}
            </h4>
            <div className="sub">
              {aluno.matricula} · {aluno.turma.nome}
            </div>
          </div>
        </div>
        <DrawerCloseButton onClose={onClose} />
      </div>
      <div className="drawer-section">
        <h5>Vínculo</h5>
        <MiniRow label="Grupo de revisão">{grupoNome}</MiniRow>
        <MiniRow label="Dupla">{aluno.dupla.label}</MiniRow>
        <MiniRow label="Listas entregues">
          {new Set(afb.map((f) => f.listaId)).size}/{listas.length}
        </MiniRow>
      </div>
      <div className="drawer-section">
        <h5>Histórico por lista</h5>
        {listas.map((lista) => {
          const f = afb.find((x) => x.listaId === lista.id);
          if (!f)
            return (
              <MiniRow key={lista.id} label={lista.nome}>
                <span className="mono-cell">não entregue</span>
              </MiniRow>
            );
          if (!f.usouIa && !f.plagiou && !f.usouProibicao)
            return (
              <MiniRow key={lista.id} label={lista.nome}>
                <Chip tone="off">sem ocorrências</Chip>
              </MiniRow>
            );
          return (
            <div key={lista.id} className="mini-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
              <span className="l">{lista.nome}</span>
              <div className="flags-cell">
                {f.usouIa && (
                  <Chip tone="info">IA · Q{f.questoesIa.map((q) => q.numeroQuestao).join(", Q")}</Chip>
                )}
                {f.questoesPlagio.map((p) => (
                  <Chip key={p.numeroQuestao} tone="danger">
                    plágio · Q{p.numeroQuestao} com {p.alunoEnvolvido.nome}
                  </Chip>
                ))}
                {f.usouProibicao && (
                  <Chip tone="warn">
                    proibição · Q{f.questoesProibicao.map((q) => q.numeroQuestao).join(", Q")}
                  </Chip>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="modal-actions" style={{ marginTop: 6 }}>
        <button className="btn ghost" style={{ width: "100%", justifyContent: "center" }} onClick={onRequestRemove}>
          Remover aluno do acompanhamento
        </button>
      </div>
    </Drawer>
  );
}

export function MonitorDrawer({
  monitor,
  feedbacks,
  listas,
  onClose,
  onRequestRemove,
}: {
  monitor: Monitor;
  feedbacks: Feedback[];
  listas: Lista[];
  onClose: () => void;
  onRequestRemove: () => void;
}) {
  const mfb = feedbacks.filter((f) => f.monitorId === monitor.id);
  const total = mfb.length;
  const noPrazoCount = mfb.filter((f) => noPrazo(f.criadoEm, f.lista.prazoEntregaFeedback)).length;
  const pct = total ? Math.round((noPrazoCount / total) * 100) : null;
  const semana = monitor.dupla?.monitorSemanaAId === monitor.id ? "A" : "B";

  return (
    <Drawer onClose={onClose}>
      <div className="drawer-head">
        <div className="who">
          <Avatar nome={monitor.nome} size={46} />
          <div>
            <h4>{monitor.nome}</h4>
            <div className="sub">
              {monitor.dupla ? `${monitor.dupla.grupoRevisao.nome} · ${monitor.dupla.label} · semana ${semana}` : "sem dupla"}
              {monitor.isChefe ? " · chefe" : ""}
            </div>
          </div>
        </div>
        <DrawerCloseButton onClose={onClose} />
      </div>
      <div className="drawer-section">
        <h5>Desempenho no período</h5>
        <MiniRow label="Registros feitos">{total}</MiniRow>
        <MiniRow label="Entregas no prazo">{pct === null ? "—" : `${pct}%`}</MiniRow>
        <MiniRow label="Papel">{monitor.isChefe ? "Chefe de monitoria" : "Monitor"}</MiniRow>
      </div>
      <div className="drawer-section">
        <h5>Histórico por lista</h5>
        {listas.map((lista) => {
          const f = mfb.find((x) => x.listaId === lista.id);
          if (!f)
            return (
              <MiniRow key={lista.id} label={lista.nome}>
                <span className="mono-cell">sem registro</span>
              </MiniRow>
            );
          const emDia = noPrazo(f.criadoEm, f.lista.prazoEntregaFeedback);
          return (
            <MiniRow key={lista.id} label={lista.nome}>
              <Chip tone={emDia ? "ok" : "danger"}>{emDia ? "no prazo" : "atrasado"}</Chip>
            </MiniRow>
          );
        })}
      </div>
      {monitor.dupla && (
        <div className="modal-actions" style={{ marginTop: 6 }}>
          <button className="btn ghost" style={{ width: "100%", justifyContent: "center" }} onClick={onRequestRemove}>
            Remover monitor desta dupla
          </button>
        </div>
      )}
    </Drawer>
  );
}
