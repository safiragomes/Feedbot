import { useMemo, useState } from "react";
import type { Aluno, Atraso, Dupla, GrupoRevisao, Lista, Monitor, Turma } from "../lib/types";
import {
  agruparAtrasosPorTurma,
  listarMonitoresEmAtraso,
  type OrdenacaoAtrasos,
} from "../lib/atrasos-agrupados";
import { Chip, EmptyState, Panel } from "../components/ui";
import { FilterBar, FilterBarToggle } from "../components/FilterBar";
import { FilterSelect } from "../components/FilterSelect";
import { IconChevronDown } from "../components/icons";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Sem histórico de atraso, quanto mais recente o vencimento, menos urgente parece —
 * por isso a cor escala com os dias, em vez de todo atraso usar o mesmo vermelho. */
function tonePorDiasAtraso(dias: number): "caution" | "orange" | "danger" {
  if (dias <= 2) return "caution";
  if (dias <= 6) return "orange";
  return "danger";
}

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
  const [ordenarPor, setOrdenarPor] = useState<OrdenacaoAtrasos>("pendencias");
  // Vazio = todos os grupos fechados por padrão — a tela normalmente tem muitos grupos
  // e a chefe quer ver o panorama (contagens) antes de abrir um em específico.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const alunoPorId = useMemo(() => new Map(alunos.map((a) => [a.id, a])), [alunos]);
  const duplaPorId = useMemo(() => new Map(duplas.map((d) => [d.id, d])), [duplas]);
  const agora = new Date().getTime();

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

  const arvore = agruparAtrasosPorTurma(atrasosFiltrados, alunos, duplas, grupos, ordenarPor);
  const monitoresEmRisco = listarMonitoresEmAtraso(atrasosFiltrados, ordenarPor).slice(0, 5);

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
    setExpandidos((atual) => {
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
            Feedbacks pendentes com prazo vencido, organizados por turma, grupo e monitor
            responsável.
          </div>
        </div>
        <div className="head-actions">
          <FilterBarToggle filtrosAtivos={filtrosAtivos} onClick={() => setFiltrosAbertos(true)} />
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

      <FilterBar open={filtrosAbertos} onClose={() => setFiltrosAbertos(false)}>
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
        <span className="flag">Ordenar por</span>
        <select
          value={ordenarPor}
          onChange={(e) => setOrdenarPor(e.target.value as OrdenacaoAtrasos)}
        >
          <option value="pendencias">Mais pendências</option>
          <option value="dias">Mais atrasado (dias)</option>
        </select>
      </FilterBar>

      {monitoresEmRisco.length > 0 && (
        <Panel title="Monitores mais atrasados" tag="quem cobrar primeiro">
          <div className="ranking-list">
            {monitoresEmRisco.map((item, index) => {
              const diasMaisAntigo = Math.max(
                1,
                Math.ceil((agora - new Date(item.prazoMaisAntigo).getTime()) / UM_DIA_MS),
              );
              return (
                <div key={item.monitorId} className="ranking-item">
                  <span className="ranking-index">0{index + 1}</span>
                  <div>
                    <strong>{item.monitorNome}</strong>
                    <p>
                      {ordenarPor === "dias"
                        ? `atrasado há ${diasMaisAntigo} dia(s)`
                        : `${item.totalAtrasos} atraso(s) aberto(s)`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

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
              const aberto = expandidos.has(chave);
              return (
                <div key={grupo.grupoId} style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    className="btn ghost sm atrasos-grupo-toggle"
                    style={{ width: "100%", display: "flex", justifyContent: "space-between" }}
                    aria-expanded={aberto}
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
                  {aberto &&
                    grupo.monitores.map((monitor) => (
                      <div key={monitor.monitorId} className="atrasos-monitor-bloco">
                        <div className="atrasos-monitor-head">
                          <strong>{monitor.monitorNome}</strong>
                          <span className="mono-cell">{monitor.totalAtrasos} atraso(s)</span>
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Aluno</th>
                                <th>Dupla</th>
                                <th>Listas pendentes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {monitor.alunos.map((aluno) => (
                                <tr key={aluno.alunoId}>
                                  <td data-label="Aluno">{aluno.alunoNome}</td>
                                  <td data-label="Dupla">
                                    <span className="mono-cell">{aluno.duplaLabel}</span>
                                  </td>
                                  <td data-label="Listas pendentes">
                                    <span className="flags-cell">
                                      {aluno.listas.map((item) => {
                                        const dias = Math.max(
                                          1,
                                          Math.ceil(
                                            (agora - new Date(item.prazoEntregaFeedback).getTime()) /
                                              UM_DIA_MS,
                                          ),
                                        );
                                        return (
                                          <Chip key={item.listaId} tone={tonePorDiasAtraso(dias)}>
                                            {item.listaNome} · {dias}d
                                          </Chip>
                                        );
                                      })}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                </div>
              );
            })}
          </Panel>
        ))
      )}
    </>
  );
}
