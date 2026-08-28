import { useMemo, useState } from "react";
import type { Aluno, Dupla, GrupoRevisao, Monitor } from "../lib/types";
import { IconSearch, IconTrash } from "../components/icons";
import { Avatar, Chip, EmptyState, type ConfirmRequest } from "../components/ui";
import { solicitarRemocaoAluno, solicitarRemocaoMonitor } from "../lib/acoes";
import { monitorSemanaB } from "../lib/dupla";

export function DiretorioAlunos({
  token,
  alunos,
  grupos,
  onOpenAluno,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  alunos: Aluno[];
  grupos: GrupoRevisao[];
  onOpenAluno: (id: string) => void;
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [turma, setTurma] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");

  const turmas = useMemo(
    () => [...new Set(alunos.map((a) => a.turma.nome))].sort((a, b) => a.localeCompare(b)),
    [alunos],
  );

  const q = busca.trim().toLowerCase();
  const filtrados = alunos
    .filter(
      (a) =>
        (!turma || a.turma.nome === turma) &&
        (!grupoId || a.dupla.grupoRevisaoId === grupoId) &&
        (!q || a.nome.toLowerCase().includes(q) || a.matricula.includes(q)),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));

  function confirmarExclusao(aluno: Aluno, event: React.MouseEvent) {
    event.stopPropagation();
    solicitarRemocaoAluno({ aluno, token, onRequestConfirm, onReload, onErro: setErro });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alunos</h1>
          <div className="subtitle">Diretório completo — encontre um aluno por turma, grupo ou busca direta.</div>
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
                <td>{grupos.find((g) => g.id === a.dupla.grupoRevisaoId)?.nome ?? "—"}</td>
                <td className="mono-cell">{a.dupla.label}</td>
                <td style={{ paddingRight: 20, textAlign: "right" }}>
                  <button className="x-btn" title="Remover aluno" onClick={(event) => confirmarExclusao(a, event)}>
                    <IconTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtrados.length && <EmptyState title="Nenhum aluno encontrado" hint="Ajuste os filtros ou a busca acima." />}
      </div>
    </>
  );
}

export function DiretorioMonitores({
  token,
  monitores,
  grupos,
  duplas,
  alunos,
  onOpenMonitor,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  monitores: Monitor[];
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  alunos: Aluno[];
  onOpenMonitor: (id: string) => void;
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [grupoId, setGrupoId] = useState("");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");

  const q = busca.trim().toLowerCase();
  const grupoDaDupla = new Map(duplas.map((d) => [d.id, d.grupoRevisaoId]));
  const duplaPorId = new Map(duplas.map((d) => [d.id, d]));
  const filtrados = monitores
    .filter((m) => {
      const pertenceAoGrupo = !grupoId || (!!m.duplaId && grupoDaDupla.get(m.duplaId) === grupoId);
      return pertenceAoGrupo && (!q || m.nome.toLowerCase().includes(q));
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  function confirmarExclusao(monitor: Monitor, event: React.MouseEvent) {
    event.stopPropagation();
    solicitarRemocaoMonitor({ monitor, token, onRequestConfirm, onReload, onErro: setErro });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monitores</h1>
          <div className="subtitle">Diretório completo — encontre um monitor por grupo de revisão ou busca direta.</div>
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
                <td style={{ paddingRight: 20, textAlign: "right" }}>
                  <button className="x-btn" title="Excluir monitor" onClick={(event) => confirmarExclusao(m, event)}>
                    <IconTrash />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {!filtrados.length && (
          <EmptyState title="Nenhum monitor encontrado" hint="Ajuste os filtros ou a busca acima." />
        )}
      </div>
    </>
  );
}
