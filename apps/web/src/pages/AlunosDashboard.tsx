import { useMemo, useState } from "react";
import type { ChartConfiguration } from "chart.js/auto";
import type { Aluno, Feedback, GrupoRevisao, Lista } from "../lib/types";
import { CHART_GRID, CHART_TEXT, ChartCanvas } from "../components/ChartCanvas";
import { IconAluno, IconIa, IconPlagio, IconProibicao } from "../components/icons";
import { Panel, StatCard } from "../components/ui";

const shortLista = (nome: string) => nome.replace(/^Lista\s*/i, "L");

export function AlunosDashboard({
  alunos,
  grupos,
  listas,
  feedbacks,
}: {
  alunos: Aluno[];
  grupos: GrupoRevisao[];
  listas: Lista[];
  feedbacks: Feedback[];
}) {
  const [turma, setTurma] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [duplaId, setDuplaId] = useState("");
  const [listaId, setListaId] = useState("");

  const turmas = useMemo(
    () => [...new Set(alunos.map((a) => a.turma.nome))].sort((a, b) => a.localeCompare(b)),
    [alunos],
  );
  const duplasDoGrupo = useMemo(
    () => grupos.find((g) => g.id === grupoId)?.duplas ?? [],
    [grupos, grupoId],
  );

  const filtrados = useMemo(
    () =>
      alunos.filter(
        (a) =>
          (!turma || a.turma.nome === turma) &&
          (!grupoId || a.dupla.grupoRevisaoId === grupoId) &&
          (!duplaId || a.duplaId === duplaId),
      ),
    [alunos, turma, grupoId, duplaId],
  );

  const alunoIds = useMemo(() => new Set(filtrados.map((a) => a.id)), [filtrados]);
  const fb = useMemo(
    () => feedbacks.filter((f) => alunoIds.has(f.alunoId) && (!listaId || f.listaId === listaId)),
    [feedbacks, alunoIds, listaId],
  );

  const comIA = new Set(fb.filter((f) => f.usouIa).map((f) => f.alunoId)).size;
  const comPlagio = new Set(fb.filter((f) => f.plagiou).map((f) => f.alunoId)).size;
  const comProib = new Set(fb.filter((f) => f.usouProibicao).map((f) => f.alunoId)).size;
  const pcd = filtrados.filter((a) => a.isPcd).length;
  const total = filtrados.length || 1;

  const listasChart = listaId ? listas.filter((l) => l.id === listaId) : listas;

  const dIA = listasChart.map((l) => fb.filter((f) => f.listaId === l.id && f.usouIa).length);
  const dPL = listasChart.map((l) => fb.filter((f) => f.listaId === l.id && f.plagiou).length);
  const dPR = listasChart.map(
    (l) => fb.filter((f) => f.listaId === l.id && f.usouProibicao).length,
  );

  const ocorrenciasConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: listasChart.map((l) => l.nome),
      datasets: [
        {
          label: "IA",
          data: dIA,
          backgroundColor: "#B79EE0",
          borderRadius: 4,
          maxBarThickness: 22,
        },
        {
          label: "Plágio",
          data: dPL,
          backgroundColor: "#E5938A",
          borderRadius: 4,
          maxBarThickness: 22,
        },
        {
          label: "Proibição",
          data: dPR,
          backgroundColor: "#E7B65C",
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART_TEXT, font: { weight: 700 } } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: CHART_TEXT },
          grid: { color: CHART_GRID },
        },
      },
    },
  };

  const totIA = dIA.reduce((s, v) => s + v, 0);
  const totPL = dPL.reduce((s, v) => s + v, 0);
  const totPR = dPR.reduce((s, v) => s + v, 0);
  const donutConfig: ChartConfiguration<"doughnut"> = {
    type: "doughnut",
    data: {
      labels: ["IA", "Plágio", "Proibição"],
      datasets: [
        {
          data: [totIA, totPL, totPR],
          backgroundColor: ["#B79EE0", "#E5938A", "#E7B65C"],
          borderColor: "#141D30",
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: CHART_TEXT,
            font: { weight: 700, size: 11.5 },
            boxWidth: 10,
            padding: 14,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
      },
    },
  };

  const qtdMedia = listasChart.map((l) => {
    const relev = fb.filter((f) => f.listaId === l.id);
    if (!relev.length) return 0;
    const soma = relev.reduce((s, f) => s + f.qtdQuestoesPontuadas, 0);
    return +(soma / relev.length).toFixed(1);
  });
  const maxQuestoesEixo = Math.max(...listasChart.map((l) => l.qtdQuestoesTotal), 1);
  const qtdConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: listasChart.map((l) => shortLista(l.nome)),
      datasets: [
        { data: qtdMedia, backgroundColor: "#7FB8E0", borderRadius: 5, maxBarThickness: 34 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} questões corretas, em média`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART_TEXT, font: { weight: 700 } } },
        y: {
          beginAtZero: true,
          max: maxQuestoesEixo,
          ticks: { color: CHART_TEXT, stepSize: 1 },
          grid: { color: CHART_GRID },
        },
      },
    },
  };

  const maxQuestoes = Math.max(0, ...listasChart.map((l) => l.qtdQuestoesTotal));
  type Celula = { ia: number; plagio: number; proibicao: number } | null;
  const matriz = new Map<string, Celula[]>();
  listasChart.forEach((l) => {
    matriz.set(
      l.id,
      Array.from({ length: maxQuestoes }, (_, index) =>
        index < l.qtdQuestoesTotal ? { ia: 0, plagio: 0, proibicao: 0 } : null,
      ),
    );
  });
  fb.forEach((f) => {
    const linha = matriz.get(f.listaId);
    if (!linha) return;
    f.questoesIa.forEach((q) => {
      const cell = linha[q.numeroQuestao - 1];
      if (cell) cell.ia += 1;
    });
    f.questoesPlagio.forEach((q) => {
      const cell = linha[q.numeroQuestao - 1];
      if (cell) cell.plagio += 1;
    });
    f.questoesProibicao.forEach((q) => {
      const cell = linha[q.numeroQuestao - 1];
      if (cell) cell.proibicao += 1;
    });
  });

  const ranking: { label: string; v: number }[] = [];
  listasChart.forEach((l) => {
    matriz.get(l.id)?.forEach((cell, index) => {
      if (!cell) return;
      const t = cell.ia + cell.plagio + cell.proibicao;
      if (t > 0) ranking.push({ label: `${shortLista(l.nome)}·Q${index + 1}`, v: t });
    });
  });
  ranking.sort((a, b) => b.v - a.v);
  const top10 = ranking.slice(0, 10);
  const rankingConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: top10.map((r) => r.label),
      datasets: [
        {
          data: top10.map((r) => r.v),
          backgroundColor: "#E5938A",
          borderRadius: 4,
          maxBarThickness: 16,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x} ocorrências` } },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, color: CHART_TEXT },
          grid: { color: CHART_GRID },
        },
        y: { grid: { display: false }, ticks: { color: CHART_TEXT, font: { weight: 700 } } },
      },
    },
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alunos</h1>
          <div className="subtitle">
            Desempenho, ocorrências e acompanhamento por turma, grupo e lista.
          </div>
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
        <select
          value={grupoId}
          onChange={(e) => {
            setGrupoId(e.target.value);
            setDuplaId("");
          }}
        >
          <option value="">todos os grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <span className="flag">Dupla</span>
        <select value={duplaId} onChange={(e) => setDuplaId(e.target.value)}>
          <option value="">todas as duplas</option>
          {duplasDoGrupo.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <span className="flag">Lista</span>
        <select value={listaId} onChange={(e) => setListaId(e.target.value)}>
          <option value="">todas as listas</option>
          {listas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="stats">
        <StatCard
          label="Alunos filtrados"
          value={filtrados.length}
          sub={`${pcd} PCD/ND`}
          icon={<IconAluno />}
          color="sky"
        />
        <StatCard
          label="Uso de IA"
          value={comIA}
          sub={`${Math.round((comIA / total) * 100)}% dos alunos`}
          icon={<IconIa />}
          color="plum"
        />
        <StatCard
          label="Plágio"
          value={comPlagio}
          sub={`${Math.round((comPlagio / total) * 100)}% dos alunos`}
          icon={<IconPlagio />}
          color="rose"
        />
        <StatCard
          label="Uso de proibição"
          value={comProib}
          sub={`${Math.round((comProib / total) * 100)}% dos alunos`}
          icon={<IconProibicao />}
          color="gold"
        />
      </div>

      <Panel
        title="Ocorrências por lista"
        legend={
          <div className="legend-row">
            <span>
              <i style={{ background: "var(--plum)" }} />
              uso de IA
            </span>
            <span>
              <i style={{ background: "var(--rose)" }} />
              plágio
            </span>
            <span>
              <i style={{ background: "var(--gold)" }} />
              proibição
            </span>
          </div>
        }
      >
        <div className="chart-wrap">
          <ChartCanvas config={ocorrenciasConfig} />
        </div>
      </Panel>

      <div className="panel-grid">
        <div className="panel-stack">
          <Panel title="Questões mais afetadas" tag="lista × questão" fit>
            <div style={{ overflowX: "auto" }}>
              <table className="heatmap">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: maxQuestoes }, (_, i) => (
                      <th key={i}>Q{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listasChart.map((l) => (
                    <tr key={l.id}>
                      <th className="row-h">{shortLista(l.nome)}</th>
                      {matriz.get(l.id)?.map((cell, index) => {
                        if (!cell) return <td key={index} />;
                        const t = cell.ia + cell.plagio + cell.proibicao;
                        if (!t)
                          return (
                            <td key={index} title={`${l.nome} · Q${index + 1}: sem ocorrências`}>
                              <div className="heat-total z">–</div>
                            </td>
                          );
                        const parts = [];
                        if (cell.ia) parts.push(`IA ${cell.ia}`);
                        if (cell.plagio) parts.push(`Plágio ${cell.plagio}`);
                        if (cell.proibicao) parts.push(`Proibição ${cell.proibicao}`);
                        return (
                          <td key={index} title={`${l.nome} · Q${index + 1}: ${parts.join(" · ")}`}>
                            <div className="heat-total">{t}</div>
                            <div className="heat-mini">
                              {cell.ia > 0 && (
                                <span
                                  style={{
                                    width: `${(cell.ia / t) * 100}%`,
                                    background: "var(--plum)",
                                  }}
                                />
                              )}
                              {cell.plagio > 0 && (
                                <span
                                  style={{
                                    width: `${(cell.plagio / t) * 100}%`,
                                    background: "var(--rose)",
                                  }}
                                />
                              )}
                              {cell.proibicao > 0 && (
                                <span
                                  style={{
                                    width: `${(cell.proibicao / t) * 100}%`,
                                    background: "var(--gold)",
                                  }}
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="heatmap-legend">
              <span className="dot" style={{ background: "var(--plum)" }} />
              IA
              <span className="dot" style={{ background: "var(--rose)" }} />
              plágio
              <span className="dot" style={{ background: "var(--gold)" }} />
              proibição
              <span style={{ marginLeft: "auto", color: "var(--text-3)" }}>
                a barrinha mostra a proporção de cada tipo naquela questão
              </span>
            </div>
          </Panel>
          <Panel title="Ranking de questões problemáticas" tag="por lista · top 10">
            <div className="chart-wrap md">
              <ChartCanvas config={rankingConfig} />
            </div>
          </Panel>
        </div>
        <div className="panel-stack">
          <Panel title="Composição das ocorrências">
            <div className="chart-wrap md">
              <ChartCanvas config={donutConfig} />
            </div>
          </Panel>
          <Panel title="Questões corretas por lista" tag="média informada pelos monitores">
            <div className="chart-wrap md">
              <ChartCanvas config={qtdConfig} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
