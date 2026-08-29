import { useState } from "react";
import type { Aluno, Atraso, Dupla, Feedback, GrupoRevisao, Lista, Monitor } from "../lib/types";
import { fimDoDiaIso, noPrazo } from "../lib/format";
import { api } from "../lib/api";
import { monitorSemanaB } from "../lib/dupla";
import { Avatar, Chip, Drawer, DrawerCloseButton, MiniRow } from "./ui";
import { IconX } from "./icons";

export function AlunoDrawer({
  aluno,
  grupos,
  duplas,
  feedbacks,
  listas,
  token,
  onReload,
  onClose,
  onRequestRemove,
}: {
  aluno: Aluno;
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  feedbacks: Feedback[];
  listas: Lista[];
  token: string;
  onReload: () => Promise<void>;
  onClose: () => void;
  onRequestRemove: () => void;
}) {
  const [salvandoPrazo, setSalvandoPrazo] = useState<string | null>(null);
  const [prazosEditados, setPrazosEditados] = useState(new Map<string, string>());
  const afb = feedbacks.filter((f) => f.alunoId === aluno.id);
  const grupoNome = grupos.find((g) => g.id === aluno.dupla.grupoRevisaoId)?.nome ?? "—";
  const monitoresDupla = duplas.find((d) => d.id === aluno.duplaId)?.monitores ?? [];
  const monitorB = monitorSemanaB(monitoresDupla, aluno.monitorSemanaAId);

  return (
    <Drawer onClose={onClose}>
      <div className="drawer-head">
        <div className="who">
          <Avatar nome={aluno.nome} size={46} />
          <div>
            <h4>
              {aluno.nome}
              {aluno.isPcd && (
                <span className="nd-icon" title="PCD ou neurodivergente">
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
        <MiniRow label="Monitor semana A">{aluno.monitorSemanaA?.nome ?? "não atribuído"}</MiniRow>
        <MiniRow label="Monitor semana B">{monitorB?.nome ?? "não atribuído"}</MiniRow>
        <MiniRow label="Listas entregues">
          {new Set(afb.map((f) => f.listaId)).size}/{listas.length}
        </MiniRow>
      </div>
      <div className="drawer-section">
        <h5>Prazo individual</h5>
        <p className="mono-cell">
          Use somente quando este aluno tiver uma prorrogação. Sem exceção, vale o prazo da turma.
        </p>
        {listas.map((lista) => {
          const individual = aluno.prazosIndividuais?.find(
            (p) => p.listaId === lista.id,
          )?.prazoEntregaFeedback;
          const turma = lista.prazos?.find(
            (p) => p.turmaId === aluno.turmaId,
          )?.prazoEntregaFeedback;
          const valor = prazosEditados.get(lista.id) ?? individual?.slice(0, 10) ?? "";
          return (
            <div className="mini-row" key={lista.id} style={{ gap: 8 }}>
              <span className="l">
                {lista.nome}
                <small style={{ display: "block" }}>
                  Turma: {turma?.slice(0, 10) ?? "sem prazo"}
                </small>
              </span>
              <input
                type="date"
                value={valor}
                onChange={(e) =>
                  setPrazosEditados((prev) => new Map(prev).set(lista.id, e.target.value))
                }
              />
              <button
                className="btn sm"
                disabled={salvandoPrazo === lista.id}
                onClick={async () => {
                  setSalvandoPrazo(lista.id);
                  await api.salvarPrazoAluno(
                    token,
                    aluno.id,
                    lista.id,
                    valor ? fimDoDiaIso(valor) : null,
                  );
                  await onReload();
                  setSalvandoPrazo(null);
                }}
              >
                {valor ? "Salvar" : individual ? "Usar turma" : "—"}
              </button>
            </div>
          );
        })}
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
            <div
              key={lista.id}
              className="mini-row"
              style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}
            >
              <span className="l">{lista.nome}</span>
              <div className="flags-cell">
                {f.usouIa && (
                  <Chip tone="info">
                    IA · Q{f.questoesIa.map((q) => q.numeroQuestao).join(", Q")}
                  </Chip>
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
        <button
          className="btn ghost"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onRequestRemove}
        >
          Remover aluno do acompanhamento
        </button>
      </div>
    </Drawer>
  );
}

export function MonitorDrawer({
  monitor,
  alunos,
  duplas,
  feedbacks,
  atrasos,
  listas,
  token,
  onClose,
  onReload,
  onErro,
}: {
  monitor: Monitor;
  alunos: Aluno[];
  duplas: Dupla[];
  feedbacks: Feedback[];
  atrasos: Atraso[];
  listas: Lista[];
  token: string;
  onClose: () => void;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
}) {
  const mfb = feedbacks.filter((f) => f.monitorId === monitor.id);
  const total = mfb.length;
  const comPrazo = mfb.filter((f) => f.prazoEntregaFeedback !== null);
  const noPrazoCount = comPrazo.filter((f) => noPrazo(f.criadoEm, f.prazoEntregaFeedback)).length;
  const pct = comPrazo.length ? Math.round((noPrazoCount / comPrazo.length) * 100) : null;
  const monitoresDupla = duplas.find((d) => d.id === monitor.duplaId)?.monitores ?? [];
  const alunosDaDupla = monitor.duplaId ? alunos.filter((a) => a.duplaId === monitor.duplaId) : [];
  const alunosA = alunosDaDupla.filter((a) => a.monitorSemanaAId === monitor.id);
  const alunosB = alunosDaDupla.filter(
    (a) => monitorSemanaB(monitoresDupla, a.monitorSemanaAId)?.id === monitor.id,
  );
  const pendencias = atrasos.filter((atraso) => atraso.monitorId === monitor.id);

  // Monitor B nunca é armazenado — é sempre "o outro monitor da dupla" (ou o próprio,
  // sem parceiro). Por isso desatribuir este monitor de um aluno (seja como A ou como
  // B) só é possível limpando monitorSemanaAId por inteiro, o que desfaz A e B ao
  // mesmo tempo.
  async function desatribuir(alunoId: string) {
    onErro("");
    try {
      await api.atualizarAluno(token, alunoId, { monitorSemanaAId: null });
      await onReload();
    } catch (error) {
      onErro(error instanceof Error ? error.message : "Não foi possível desatribuir o aluno");
    }
  }

  return (
    <Drawer onClose={onClose}>
      <div className="drawer-head">
        <div className="who">
          <Avatar nome={monitor.nome} size={46} />
          <div>
            <h4>{monitor.nome}</h4>
            <div className="sub">
              {alunosA.length + alunosB.length} aluno(s) sob responsabilidade
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
        <h5>Feedbacks pendentes</h5>
        {pendencias.length ? (
          pendencias.map((pendencia) => (
            <MiniRow key={`${pendencia.alunoId}:${pendencia.listaId}`} label={pendencia.listaNome}>
              <Chip tone="danger">{pendencia.alunoNome}</Chip>
            </MiniRow>
          ))
        ) : (
          <p className="mono-cell">nenhuma pendência após o prazo</p>
        )}
      </div>
      <div className="drawer-section">
        <h5>Alunos · semana A</h5>
        {alunosA.length ? (
          alunosA.map((a) => (
            <div className="mini-row" key={a.id}>
              <span className="l">{a.nome}</span>
              <button
                className="x-btn"
                title="Desatribuir semana A"
                onClick={() => desatribuir(a.id)}
              >
                <IconX />
              </button>
            </div>
          ))
        ) : (
          <p className="mono-cell">nenhum aluno atribuído</p>
        )}
      </div>
      <div className="drawer-section">
        <h5>Alunos · semana B</h5>
        {alunosB.length ? (
          alunosB.map((a) => (
            <div className="mini-row" key={a.id}>
              <span className="l">{a.nome}</span>
              <button
                className="x-btn"
                title="Desatribuir semana B"
                onClick={() => desatribuir(a.id)}
              >
                <IconX />
              </button>
            </div>
          ))
        ) : (
          <p className="mono-cell">nenhum aluno atribuído</p>
        )}
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
          const emDia = noPrazo(f.criadoEm, f.prazoEntregaFeedback);
          return (
            <MiniRow key={lista.id} label={lista.nome}>
              <Chip tone={emDia === null ? "off" : emDia ? "ok" : "danger"}>
                {emDia === null ? "sem prazo" : emDia ? "no prazo" : "atrasado"}
              </Chip>
            </MiniRow>
          );
        })}
      </div>
    </Drawer>
  );
}
