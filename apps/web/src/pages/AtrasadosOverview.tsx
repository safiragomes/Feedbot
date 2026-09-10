import { useMemo, useState } from "react";
import type { Aluno, Atraso, Dupla, GrupoRevisao, Lista, Monitor, Turma } from "../lib/types";
import { agruparAtrasosPorTurma } from "../lib/atrasos-agrupados";
import { Chip, EmptyState, Panel } from "../components/ui";
import { FilterSelect } from "../components/FilterSelect";
import { IconChevronDown } from "../components/icons";

export function AtrasadosOverview({
  turmas,
  grupos,
  duplas,
  alunos,
  listas,
  monitores,
  atrasos,
}: {
  turmas: Turma[];
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  alunos: Aluno[];
  listas: Lista[];
  monitores: Monitor[];
  atrasos: Atraso[];
}) {
  const [turmaId, setTurmaId] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [monitorId, setMonitorId] = useState("");
  const [listaId, setListaId] = useState("");
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  const alunoPorId = useMemo(() => new Map(alunos.map((a) => [a.id, a])), [alunos]);
  const duplaPorId = useMemo(() => new Map(duplas.map((d) => [d.id, d])), [duplas]);

  const atrasosFiltrados = atrasos.filter((a) => {
    const aluno = alunoPorId.get(a.alunoId);
    if (!aluno) return false;
    const grupoDoAtraso = duplaPorId.get(a.duplaId)?.grupoRevisaoId;
    return (
      (!turmaId || aluno.turmaId === turmaId) &&
      (!grupoId || grupoDoAtraso === grupoId) &&
      (!monitorId || a.monitorId === monitorId) &&
      (!listaId || a.listaId === listaId)
    );
  });

  const arvore = agruparAtrasosPorTurma(atrasosFiltrados, alunos, duplas, grupos);

  const alunosAfetados = new Set(atrasosFiltrados.map((a) => a.alunoId)).size;
  const gruposAfetados = new Set(
    atrasosFiltrados.map((a) => duplaPorId.get(a.duplaId)?.grupoRevisaoId ?? a.duplaId),
  ).size;
  const monitoresAfetados = new Set(atrasosFiltrados.map((a) => a.monitorId)).size;

  const filtrosAtivos = [turmaId, grupoId, monitorId, listaId].filter(Boolean).length;

  function limparFiltros() {
    setTurmaId("");
    setGrupoId("");
    setMonitorId("");
    setListaId("");
  }

  function alternarColapso(chave: string) {
    setColapsados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Atrasados</h1>
          <div className="subtitle">
            Feedbacks pendentes com prazo vencido, organizados por turma, grupo e aluno.
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
          <span>Atrasos abertos</span>
          <strong>{atrasosFiltrados.length}</strong>
          <p>Pendências com prazo vencido na seleção atual.</p>
        </div>
        <div className="context-card">
          <span>Alunos afetados</span>
          <strong>{alunosAfetados}</strong>
          <p>Alunos com ao menos uma lista pendente.</p>
        </div>
        <div className="context-card">
          <span>Grupos afetados</span>
          <strong>{gruposAfetados}</strong>
          <p>Grupos de revisão com pendências abertas.</p>
        </div>
        <div className="context-card compact">
          <span>Monitores com pendência</span>
          <strong>{monitoresAfetados}</strong>
          <p>Responsáveis por ao menos um atraso.</p>
        </div>
      </div>

      <div className="filterbar">
        <span className="flag">Turma</span>
        <FilterSelect
          label="turma"
          placeholder="todas as turmas"
          value={turmaId}
          onChange={setTurmaId}
          options={turmas.map((t) => ({ value: t.id, label: t.nome }))}
        />
        <span className="flag">Grupo</span>
        <FilterSelect
          label="grupo"
          placeholder="todos os grupos"
          value={grupoId}
          onChange={setGrupoId}
          options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
        />
        <span className="flag">Monitor</span>
        <FilterSelect
          label="monitor"
          placeholder="todos os monitores"
          value={monitorId}
          onChange={setMonitorId}
          options={monitores.map((m) => ({ value: m.id, label: m.nome }))}
        />
        <span className="flag">Lista</span>
        <FilterSelect
          label="lista"
          placeholder="todas as listas"
          value={listaId}
          onChange={setListaId}
          options={listas.map((l) => ({ value: l.id, label: l.nome }))}
        />
      </div>

      {!arvore.length ? (
        <EmptyState
          title="Nenhum atraso encontrado"
          hint="Ajuste os filtros acima ou aproveite — ninguém está com feedback pendente vencido."
        />
      ) : (
        arvore.map((turma) => (
          <Panel key={turma.turmaId} title={turma.turmaNome} tag={`${turma.totalAtrasos} atraso(s)`}>
            {turma.grupos.map((grupo) => {
              const chave = `${turma.turmaId}:${grupo.grupoId}`;
              const aberto = !colapsados.has(chave);
              return (
                <div key={grupo.grupoId} style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ width: "100%", display: "flex", justifyContent: "space-between" }}
                    onClick={() => alternarColapso(chave)}
                  >
                    <span>
                      {grupo.grupoNome} · {grupo.totalAtrasos} atraso(s)
                    </span>
                    <IconChevronDown
                      style={{
                        transform: aberto ? "rotate(180deg)" : undefined,
                        transition: "transform .15s",
                      }}
                    />
                  </button>
                  {aberto && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Aluno</th>
                            <th>Dupla</th>
                            <th>Listas pendentes · monitor responsável</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.alunos.map((aluno) => (
                            <tr key={aluno.alunoId}>
                              <td>{aluno.alunoNome}</td>
                              <td>
                                <span className="mono-cell">{aluno.duplaLabel}</span>
                              </td>
                              <td>
                                <span className="flags-cell">
                                  {aluno.itens.map((item) => (
                                    <Chip key={item.listaId} tone="danger">
                                      {item.listaNome} · {item.monitorNome}
                                    </Chip>
                                  ))}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </Panel>
        ))
      )}
    </>
  );
}
