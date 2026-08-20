import { useMemo, useState } from "react";
import type { Aluno, GrupoRevisao, Monitor } from "../lib/types";
import { IconSearch } from "../components/icons";
import { Avatar, Chip, EmptyState } from "../components/ui";

export function DiretorioAlunos({
  alunos,
  grupos,
  onOpenAluno,
}: {
  alunos: Aluno[];
  grupos: GrupoRevisao[];
  onOpenAluno: (id: string) => void;
}) {
  const [turma, setTurma] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [busca, setBusca] = useState("");

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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Aluno</th>
              <th>Matrícula</th>
              <th>Turma</th>
              <th>Grupo de revisão</th>
              <th style={{ paddingRight: 20 }}>Dupla</th>
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
                        <span className="nd-icon" title="PCD">
                          ∞
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="mono-cell">{a.matricula}</td>
                <td>{a.turma.nome}</td>
                <td>{grupos.find((g) => g.id === a.dupla.grupoRevisaoId)?.nome ?? "—"}</td>
                <td className="mono-cell" style={{ paddingRight: 20 }}>
                  {a.dupla.label}
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
  monitores,
  grupos,
  onOpenMonitor,
}: {
  monitores: Monitor[];
  grupos: GrupoRevisao[];
  onOpenMonitor: (id: string) => void;
}) {
  const [grupoId, setGrupoId] = useState("");
  const [busca, setBusca] = useState("");

  const q = busca.trim().toLowerCase();
  const filtrados = monitores
    .filter((m) => m.dupla)
    .filter(
      (m) =>
        (!grupoId || m.dupla?.grupoRevisao.id === grupoId) &&
        (!q || m.nome.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));

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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Monitor</th>
              <th>Grupo de revisão</th>
              <th>Dupla</th>
              <th>Semana</th>
              <th style={{ paddingRight: 20 }}>Papel</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m) => {
              const semana = m.dupla?.monitorSemanaAId === m.id ? "A" : "B";
              return (
                <tr key={m.id} className="clickable" onClick={() => onOpenMonitor(m.id)}>
                  <td style={{ paddingLeft: 20 }}>
                    <div className="person-cell">
                      <Avatar nome={m.nome} />
                      <span className="person-name">{m.nome}</span>
                    </div>
                  </td>
                  <td>{m.dupla?.grupoRevisao.nome ?? "—"}</td>
                  <td className="mono-cell">{m.dupla?.label ?? "—"}</td>
                  <td>
                    <Chip>semana {semana}</Chip>
                  </td>
                  <td style={{ paddingRight: 20 }}>
                    <Chip tone={m.isChefe ? "warn" : "off"}>{m.isChefe ? "chefe" : "monitor"}</Chip>
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
