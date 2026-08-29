import { useMemo, useState } from "react";
import type { ChartConfiguration } from "chart.js/auto";
import type { Atraso, Dupla, Feedback, GrupoRevisao, Lista } from "../lib/types";
import { CHART_GRID, CHART_TEXT, ChartCanvas } from "../components/ChartCanvas";
import { IconCheckCircle, IconClock, IconGrid, IconMonitor } from "../components/icons";
import { Panel, StatCard } from "../components/ui";
import { noPrazo } from "../lib/format";

export function MonitoresDashboard({
  grupos,
  duplas,
  listas,
  feedbacks,
  atrasos,
}: {
  grupos: GrupoRevisao[];
  duplas: Dupla[];
  listas: Lista[];
  feedbacks: Feedback[];
  atrasos: Atraso[];
}) {
  const [grupoId, setGrupoId] = useState("");
  const [listaId, setListaId] = useState("");

  const duplaGrupo = useMemo(() => new Map(duplas.map((d) => [d.id, d.grupoRevisaoId])), [duplas]);

  const fb = useMemo(
    () =>
      feedbacks.filter(
        (f) =>
          (!grupoId || duplaGrupo.get(f.duplaId) === grupoId) &&
          (!listaId || f.listaId === listaId),
      ),
    [feedbacks, grupoId, listaId, duplaGrupo],
  );

  const byMonitor = new Map<
    string,
    { nome: string; total: number; comPrazo: number; noPrazo: number }
  >();
  fb.forEach((f) => {
    const atual = byMonitor.get(f.monitorId) ?? {
      nome: f.monitor.nome,
      total: 0,
      comPrazo: 0,
      noPrazo: 0,
    };
    atual.total += 1;
    if (f.prazoEntregaFeedback !== null) {
      atual.comPrazo += 1;
      if (noPrazo(f.criadoEm, f.prazoEntregaFeedback)) atual.noPrazo += 1;
    }
    byMonitor.set(f.monitorId, atual);
  });
  const arr = [...byMonitor.values()];

  const totalEntregas = fb.length;
  const comPrazo = fb.filter((f) => f.prazoEntregaFeedback !== null);
  const totalPrazo = comPrazo.filter((f) => noPrazo(f.criadoEm, f.prazoEntregaFeedback)).length;
  const pctPrazo = comPrazo.length ? Math.round((totalPrazo / comPrazo.length) * 100) : 0;
  const atrasosVisiveis = atrasos.filter(
    (a) =>
      (!grupoId || duplaGrupo.get(a.duplaId) === grupoId) && (!listaId || a.listaId === listaId),
  );
  const atrasados = new Set([
    ...arr.filter((m) => m.comPrazo > 0 && m.noPrazo / m.comPrazo < 0.7).map((m) => m.nome),
    ...atrasosVisiveis.map((a) => a.monitorNome),
  ]).size;

  const gruposVisiveis = grupos.filter((g) => !grupoId || g.id === grupoId);
  const porGrupo = gruposVisiveis.map((g) => {
    const gfb = fb.filter(
      (f) => duplaGrupo.get(f.duplaId) === g.id && f.prazoEntregaFeedback !== null,
    );
    return {
      nome: g.nome.replace("Grupo ", ""),
      prazo: gfb.filter((f) => noPrazo(f.criadoEm, f.prazoEntregaFeedback)).length,
      atraso: gfb.filter((f) => !noPrazo(f.criadoEm, f.prazoEntregaFeedback)).length,
    };
  });
  const entregasConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: porGrupo.map((g) => g.nome),
      datasets: [
        {
          label: "No prazo",
          data: porGrupo.map((g) => g.prazo),
          backgroundColor: "#8FC29B",
          borderRadius: 4,
          maxBarThickness: 26,
        },
        {
          label: "Atrasado",
          data: porGrupo.map((g) => g.atraso),
          backgroundColor: "#E5938A",
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: CHART_TEXT, font: { weight: 700 } },
          stacked: true,
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: CHART_TEXT },
          grid: { color: CHART_GRID },
          stacked: true,
        },
      },
    },
  };

  const donutConfig: ChartConfiguration<"doughnut"> = {
    type: "doughnut",
    data: {
      labels: ["No prazo", "Atrasado"],
      datasets: [
        {
          data: [totalPrazo, totalEntregas - totalPrazo],
          backgroundColor: ["#8FC29B", "#E5938A"],
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

  const ranking = [...arr].sort((a, b) => b.total - a.total).slice(0, 8);
  const rankingConfig: ChartConfiguration = {
    type: "bar",
    data: {
      labels: ranking.map((m) => m.nome.split(" ")[0]!),
      datasets: [
        {
          data: ranking.map((m) => m.total),
          backgroundColor: "#7FB8E0",
          borderRadius: 4,
          maxBarThickness: 16,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
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
          <h1>Monitores</h1>
          <div className="subtitle">
            Entregas de feedback, prazos e volume por grupo de revisão e lista.
          </div>
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
          label="Monitores com registro"
          value={arr.length}
          icon={<IconMonitor />}
          color="sky"
        />
        <StatCard
          label="Entregas no prazo"
          value={`${pctPrazo}%`}
          sub={`${totalPrazo}/${totalEntregas} registros`}
          icon={<IconCheckCircle />}
          color="sage"
        />
        <StatCard
          label="Monitores atrasados"
          value={atrasados}
          sub={`${atrasosVisiveis.length} feedback(s) pendente(s)`}
          icon={<IconClock />}
          color="rose"
        />
        <StatCard
          label="Grupos na visão"
          value={grupoId ? 1 : grupos.length}
          icon={<IconGrid />}
          color="gold"
        />
      </div>

      <Panel
        title="Entregas por grupo de revisão"
        legend={
          <div className="legend-row">
            <span>
              <i style={{ background: "var(--sage)" }} />
              no prazo
            </span>
            <span>
              <i style={{ background: "var(--rose)" }} />
              atrasado
            </span>
          </div>
        }
      >
        <div className="chart-wrap">
          <ChartCanvas config={entregasConfig} />
        </div>
      </Panel>

      <div className="panel-grid">
        <Panel title="Ranking de volume" tag="top monitores por registros">
          <div className="chart-wrap md">
            <ChartCanvas config={rankingConfig} />
          </div>
        </Panel>
        <Panel title="Entregas no prazo — geral">
          <div className="chart-wrap md">
            <ChartCanvas config={donutConfig} />
          </div>
        </Panel>
      </div>
    </>
  );
}
