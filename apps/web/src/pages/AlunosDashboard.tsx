import { useMemo, useState } from "react";
import type { ScriptableContext } from "chart.js";
import type { ChartConfiguration } from "chart.js/auto";
import type { Aluno, Feedback, GrupoRevisao, Lista } from "../lib/types";
import { chartGradient, chartPalette, ChartCanvas } from "../components/ChartCanvas";
import { IconAluno, IconIa, IconPlagio, IconProibicao } from "../components/icons";
import { Panel, StatCard } from "../components/ui";
import { FilterSelect } from "../components/FilterSelect";
import { pct, turmasUnicas } from "../lib/format";

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
  const palette = chartPalette();
  const turmas = useMemo(() => turmasUnicas(alunos), [alunos]);

  const duplasDoGrupo = useMemo(
    () => grupos.find((g) => g.id === grupoId)?.duplas ?? [],
    [grupos, grupoId],
  );

  const filtrados = useMemo(
    () =>
      alunos.filter(
        (a) =>
          (!turma || a.turma.nome === turma) &&
          (!grupoId || a.dupla?.grupoRevisaoId === grupoId) &&
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
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.plum;
            return chartGradient(context.chart.ctx, area, `${palette.plum}ee`, `${palette.sky}88`);
          },
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 22,
        },
        {
          label: "Plágio",
          data: dPL,
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.rose;
            return chartGradient(context.chart.ctx, area, `${palette.rose}ee`, `${palette.gold}88`);
          },
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 22,
        },
        {
          label: "Proibição",
          data: dPR,
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.gold;
            return chartGradient(context.chart.ctx, area, `${palette.gold}ee`, `${palette.sage}88`);
          },
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: { color: palette.text, usePointStyle: true, boxWidth: 8, padding: 14 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: palette.muted, font: { weight: 700 } },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: palette.muted },
          grid: { color: palette.grid },
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
          backgroundColor: [palette.plum, palette.rose, palette.gold],
          borderColor: palette.isLight ? "transparent" : palette.surface,
          borderWidth: palette.isLight ? 0 : 6,
          hoverOffset: 6,
          spacing: 4,
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
            color: palette.text,
            font: { weight: 700, size: 11.5 },
            boxWidth: 10,
            padding: 10,
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
        {
          data: qtdMedia,
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.sky;
            return chartGradient(context.chart.ctx, area, `${palette.sky}ee`, `${palette.gold}88`);
          },
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 28,
        },
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
        x: { grid: { display: false }, ticks: { color: palette.muted, font: { weight: 700 } } },
        y: {
          beginAtZero: true,
          max: maxQuestoesEixo,
          ticks: { color: palette.muted, stepSize: 1 },
          grid: { color: palette.grid },
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
          backgroundColor: (context: ScriptableContext<"bar">) => {
            const area = context.chart.chartArea;
            if (!area) return palette.rose;
            return chartGradient(context.chart.ctx, area, `${palette.rose}ee`, `${palette.plum}88`);
          },
          borderRadius: 10,
          borderSkipped: false,
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
          ticks: { precision: 0, color: palette.muted },
          grid: { color: palette.grid },
        },
        y: { grid: { display: false }, ticks: { color: palette.muted, font: { weight: 700 } } },
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
        <FilterSelect
          label="turma"
          placeholder="todas as turmas"
          value={turma}
          onChange={setTurma}
          options={turmas.map((t) => ({ value: t, label: t }))}
        />
        <span className="flag">Grupo</span>
        <FilterSelect
          label="grupo"
          placeholder="todos os grupos"
          value={grupoId}
          onChange={(value) => {
            setGrupoId(value);
            setDuplaId("");
          }}
          options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
        />
        <span className="flag">Dupla</span>
        <FilterSelect
          label="dupla"
          placeholder="todas as duplas"
          value={duplaId}
          onChange={setDuplaId}
          options={duplasDoGrupo.map((d) => ({ value: d.id, label: d.label }))}
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

      <div className="stats">
        <StatCard
          label="Alunos filtrados"
          value={filtrados.length}
          sub={`${pcd} PCD/ND`}
          icon={<IconAluno />}
          color="sky"
          compact
        />
        <StatCard
          label="Uso de IA"
          value={comIA}
          sub={`${pct(comIA, filtrados.length)}% dos alunos`}
          icon={<IconIa />}
          color="plum"
          compact
        />
        <StatCard
          label="Plágio"
          value={comPlagio}
          sub={`${pct(comPlagio, filtrados.length)}% dos alunos`}
          icon={<IconPlagio />}
          color="rose"
          compact
        />
        <StatCard
          label="Uso de proibição"
          value={comProib}
          sub={`${pct(comProib, filtrados.length)}% dos alunos`}
          icon={<IconProibicao />}
          color="gold"
          compact
        />
      </div>

      <Panel
        title="Ocorrências por lista"
        className="panel-chart panel-chart-hero"
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
          <Panel
            title="Ranking de questões problemáticas"
            tag="por lista · top 10"
            className="panel-chart"
          >
            <div className="chart-wrap md">
              <ChartCanvas config={rankingConfig} />
            </div>
          </Panel>
        </div>
        <div className="panel-stack">
          <Panel title="Composição das ocorrências" className="panel-chart">
            <div className="chart-wrap md">
              <ChartCanvas config={donutConfig} />
            </div>
          </Panel>
          <Panel
            title="Questões corretas por lista"
            tag="média informada pelos monitores"
            className="panel-chart"
          >
            <div className="chart-wrap md">
              <ChartCanvas config={qtdConfig} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
